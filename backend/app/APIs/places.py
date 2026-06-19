"""Overpass safe-building + supply lookup, scored by type and elevation."""
from __future__ import annotations

import httpx

from .elevation import ELEV_URL
from ..Calc.geo import bearing_to_compass, haversine_m

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
OVERPASS_HEADERS = {
    "User-Agent": "CrisisToAction/0.1 (disaster-response demo; crisis@example.com)",
    "Accept": "*/*",
}


async def _run_overpass(query: str) -> tuple[list | None, str]:
    last_error = "no overpass mirror responded"
    async with httpx.AsyncClient(timeout=18.0, headers=OVERPASS_HEADERS) as client:
        for url in OVERPASS_URLS:
            try:
                resp = await client.post(url, data={"data": query})
                resp.raise_for_status()
                return resp.json().get("elements", []), ""
            except Exception as exc:
                last_error = f"{url.split('/')[2]}: {exc}"
                continue
    return None, last_error


SAFE_TYPES = {
    "hospital": 5,
    "fire_station": 4,
    "community_centre": 3,
    "school": 3,
}
SUPPLY_TYPES = {"pharmacy", "supermarket"}


def _radius_for(mobility: str) -> int:
    return 20000 if mobility == "vehicle" else 1500


def _build_query(lat: float, lon: float, radius: int) -> str:
    return f"""
[out:json][timeout:25];
(
  nwr["amenity"="hospital"](around:{radius},{lat},{lon});
  nwr["amenity"="school"](around:{radius},{lat},{lon});
  nwr["amenity"="fire_station"](around:{radius},{lat},{lon});
  nwr["amenity"="community_centre"](around:{radius},{lat},{lon});
  nwr["amenity"="pharmacy"](around:{radius},{lat},{lon});
  nwr["shop"="supermarket"](around:{radius},{lat},{lon});
);
out center 60;
""".strip()


def _classify(tags: dict) -> tuple[str, str] | None:
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    if amenity in SAFE_TYPES:
        return ("safe", amenity)
    if amenity == "pharmacy":
        return ("supply", "pharmacy")
    if shop == "supermarket":
        return ("supply", "supermarket")
    return None


async def _elevations_for(coords: list[tuple[float, float]]) -> list[float | None]:
    if not coords:
        return []
    lats = ",".join(f"{c[0]:.6f}" for c in coords)
    lons = ",".join(f"{c[1]:.6f}" for c in coords)
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(ELEV_URL, params={"latitude": lats, "longitude": lons})
            resp.raise_for_status()
            return resp.json().get("elevation", [])
    except Exception:
        return [None] * len(coords)


async def places_api(lat: float, lon: float, mobility: str, base_elev: float | None) -> dict:
    """Fetch and score nearby safe buildings and supplies. Never raises."""
    radius = _radius_for(mobility)
    query = _build_query(lat, lon, radius)
    elements, last_error = await _run_overpass(query)
    if elements is None:
        return {"ok": False, "error": last_error, "safe": [], "supplies": []}

    raw = []
    for el in elements:
        tags = el.get("tags", {})
        cls = _classify(tags)
        if not cls:
            continue
        plat = el.get("lat") or (el.get("center") or {}).get("lat")
        plon = el.get("lon") or (el.get("center") or {}).get("lon")
        if plat is None or plon is None:
            continue
        raw.append(
            {
                "category": cls[0],
                "kind": cls[1],
                "name": tags.get("name") or cls[1].replace("_", " ").title(),
                "lat": plat,
                "lon": plon,
            }
        )

    elevs = await _elevations_for([(p["lat"], p["lon"]) for p in raw])
    for p, e in zip(raw, elevs):
        p["elevation"] = e
        p["gain_over_user"] = (
            round(e - base_elev, 1) if (e is not None and base_elev is not None) else None
        )
        p["distance_m"] = round(haversine_m(lat, lon, p["lat"], p["lon"]))
        p["direction"] = bearing_to_compass(lat, lon, p["lat"], p["lon"])

    safe = [p for p in raw if p["category"] == "safe"]
    supplies = [p for p in raw if p["category"] == "supply"]

    def score(p):
        s = SAFE_TYPES.get(p["kind"], 1) * 10
        gain = p["gain_over_user"]
        if gain is not None:
            if gain < 0:
                s -= 100
            else:
                s += gain
        s -= p["distance_m"] / 200.0
        return s

    safe.sort(key=score, reverse=True)
    supplies.sort(key=lambda p: p["distance_m"])

    return {
        "ok": True,
        "radius_m": radius,
        "safe": safe[:8],
        "supplies": supplies[:5],
    }


def _build_open_space_query(lat: float, lon: float, radius: int) -> str:
    """Genuinely open ground for post-earthquake assembly — no buildings.
    Excludes pitches (enclosed with stands) and squares (surrounded by buildings).
    Prioritises grass/meadow/grassland which are definitionally open land."""
    return f"""
[out:json][timeout:25];
(
  nwr["landuse"="grass"](around:{radius},{lat},{lon});
  nwr["landuse"="meadow"](around:{radius},{lat},{lon});
  nwr["natural"="grassland"](around:{radius},{lat},{lon});
  nwr["leisure"="park"]["building"!~"."](around:{radius},{lat},{lon});
  nwr["landuse"="recreation_ground"](around:{radius},{lat},{lon});
);
out center 40;
""".strip()


async def open_spaces_api(lat: float, lon: float, radius: int = 1500) -> dict:
    """Nearest open spaces for earthquake post-shaking evacuation. Never raises."""
    elements, last_error = await _run_overpass(_build_open_space_query(lat, lon, radius))
    if elements is None:
        return {"ok": False, "error": last_error, "open_spaces": []}

    spaces = []
    for el in elements:
        tags = el.get("tags", {})
        plat = el.get("lat") or (el.get("center") or {}).get("lat")
        plon = el.get("lon") or (el.get("center") or {}).get("lon")
        if plat is None or plon is None:
            continue
        kind = tags.get("leisure") or tags.get("landuse") or tags.get("place") or "open space"
        spaces.append(
            {
                "kind": kind,
                "name": tags.get("name") or kind.replace("_", " ").title(),
                "lat": plat,
                "lon": plon,
                "distance_m": round(haversine_m(lat, lon, plat, plon)),
                "direction": bearing_to_compass(lat, lon, plat, plon),
            }
        )
    spaces.sort(key=lambda p: p["distance_m"])
    return {"ok": True, "open_spaces": spaces[:5]}
