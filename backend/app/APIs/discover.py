"""Find a currently-active disaster in the US or Canada and place the user next to it.

This powers the "simulate me next to a real disaster" demo: instead of the user
picking a hazard, we scan live feeds for something happening right now and drop
the simulated user inside/at it. Three always-on sources, scoped to US + Canada:

  NWS  — every active US weather warning (no point filter), so we can pick the
         most severe flood / wildfire / tornado and stand the user in the middle
         of its warning polygon.
  ECCC — every active Canadian weather alert (GeoMet `weather-alerts`), likewise
         polygon-scoped so we can place the user inside a real Canadian warning.
  USGS — recent significant earthquakes, filtered to North America (US + Canada)
         so we don't surface a quake in Japan or Chile in a US/Canada demo.

Never raises.
"""
from __future__ import annotations

import asyncio
import random
import time as _time

import httpx

from ..Calc import places
from ..Calc.geo import haversine_m, offset_point
from ..hazards import detect_hazard
from . import nws, usgs

_SEV_RANK = {"Extreme": 4, "Severe": 3, "Moderate": 2, "Minor": 1, "Unknown": 0}

# US + Canada coverage boxes. A USGS epicentre must fall inside one of these to be
# eligible; this keeps the demo to US/Canada without per-point reverse geocoding.
# (Boxes overlap at the border, which is fine — membership is an OR.) Southern-
# Mexico Pacific quakes (~16-18 N) sit below the contiguous box and are excluded.
_NA_BOXES = (
    (24.0, 50.0, -125.0, -66.0),    # contiguous US
    (51.0, 72.0, -170.0, -129.0),   # Alaska
    (18.0, 23.0, -161.0, -154.0),   # Hawaii
    (17.0, 19.0, -68.0, -64.0),     # Puerto Rico / USVI
    (41.0, 84.0, -141.0, -52.0),    # Canada
)


def _in_north_america(lat: float, lon: float) -> bool:
    """True if the point is within a US/Canada coverage box (coarse, border-inclusive)."""
    return any(s <= lat <= n and w <= lon <= e for (s, n, w, e) in _NA_BOXES)


def _centroid(poly: list[list[float]]) -> tuple[float, float]:
    """Average vertex of a [lon, lat] ring -> (lat, lon). Good enough to stand the
    user inside a warning area for the demo."""
    lons = [p[0] for p in poly]
    lats = [p[1] for p in poly]
    return sum(lats) / len(lats), sum(lons) / len(lons)


async def _nws_candidates() -> list[dict]:
    """Active US warnings (severe/extreme) for our four hazards, with a polygon we
    can place the user inside."""
    url = (
        "https://api.weather.gov/alerts/active"
        "?status=actual&message_type=alert&severity=Extreme,Severe"
    )
    headers = {"User-Agent": nws.USER_AGENT, "Accept": "application/geo+json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    out: list[dict] = []
    for f in data.get("features", []):
        situation = nws.parse_alert(f)
        if not situation:
            continue
        poly = situation.get("areaPolygon")
        if not poly:
            continue  # need a polygon to stand the user inside the warned area
        lat, lon = _centroid(poly)
        area = (f.get("properties", {}) or {}).get("areaDesc") or ""
        out.append(
            {
                "situation": situation,
                "lat": lat,
                "lon": lon,
                "label": area.split(";")[0].strip(),
                "score": _SEV_RANK.get(situation.get("severity", "Unknown"), 0),
            }
        )
    return out


def _quake_situation(mag: float, place: str, dist_km: float) -> dict:
    severity = "Extreme" if mag >= 6 else "Severe" if mag >= 4.5 else "Moderate"
    mag_str = f"M{mag}"
    return {
        "event": f"{mag_str} Earthquake",
        "hazardType": "earthquake",
        "severity": severity,
        "urgency": "Immediate",
        "certainty": "Observed",
        "onset": None,
        "expires": None,
        "headline": f"{mag_str} earthquake near {place or 'your location'}",
        "description": (
            f"A magnitude {mag} earthquake struck about {dist_km} km away ({place}). "
            "Strong aftershocks are likely — be ready to drop, cover, and hold on again, "
            "and stay clear of damaged structures."
        ),
        "instruction": "",
        "officialEvacOrder": False,
        "areaPolygon": None,
        "source": "live",
    }


async def _quake_candidates() -> list[dict]:
    """Recent (<24h) significant quakes in the US/Canada; user stands a few km away."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(usgs.FEED_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    now_ms = _time.time() * 1000.0
    out: list[dict] = []
    for feat in data.get("features", []):
        props = feat.get("properties", {}) or {}
        mag = props.get("mag")
        t = props.get("time")
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if mag is None or mag < 4.5 or len(coords) < 2:
            continue
        if t and (now_ms - t) > 24 * 3600 * 1000:
            continue
        qlat, qlon = coords[1], coords[0]
        if not _in_north_america(qlat, qlon):
            continue  # demo is scoped to US + Canada
        place = props.get("place") or ""
        # Stand the user a short, realistic distance from the epicentre (not on it).
        # A public place near here may replace this point later (see _attach_places).
        bearing = (int(abs(qlat * 7 + qlon * 13)) % 8) * 45
        dist_m = 3000 + (int(abs(qlat * 1000)) % 5000)  # 3–8 km
        ulat, ulon = offset_point(qlat, qlon, bearing, dist_m)
        dist_km = round(dist_m / 1000.0, 1)
        out.append(
            {
                "situation": _quake_situation(mag, place, dist_km),
                "lat": ulat,
                "lon": ulon,
                "label": place,
                "score": 4 if mag >= 6 else 3 if mag >= 5 else 2,
                # epicentre kept so the stated distance can be refreshed once the
                # user is moved to a nearby public place.
                "_quake": {"mag": mag, "place": place, "epi": (qlat, qlon)},
            }
        )
    return out


_ECCC_ALERTS_URL = "https://api.weather.gc.ca/collections/weather-alerts/items"

# ECCC alert wording that maps onto our four hazards but that detect_hazard()
# (tuned to NWS wording) doesn't catch on its own. Canadian flood risk is carried
# by rainfall warnings, so we treat those as the flood module's trigger.
_ECCC_HAZARD_HINTS = (("rainfall", "flood"), ("flash flood", "flood"))


def _eccc_hazard(name: str) -> str | None:
    h = detect_hazard(name)
    if h:
        return h
    low = (name or "").lower()
    for kw, hazard in _ECCC_HAZARD_HINTS:
        if kw in low:
            return hazard
    return None


def _poly_centroid_and_ring(geom: dict) -> tuple[tuple[float, float] | None, list | None]:
    """From a GeoJSON Polygon/MultiPolygon, return ((lat, lon) centroid, outer ring
    as [lon, lat] pairs). The ring lets the client draw and zone-test the warned
    area exactly as it does for NWS polygons."""
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    rings: list = []
    if t == "Polygon":
        rings = coords
    elif t == "MultiPolygon":
        for poly in coords:
            rings.extend(poly)
    rings = [r for r in rings if isinstance(r, list) and len(r) >= 3]
    if not rings:
        return None, None
    outer = max(rings, key=len)  # largest ring approximates the main warned area
    pts = [p for r in rings for p in r if isinstance(p, list) and len(p) >= 2]
    if not pts:
        return None, None
    lat = sum(p[1] for p in pts) / len(pts)
    lon = sum(p[0] for p in pts) / len(pts)
    return (lat, lon), outer


async def _eccc_candidates() -> list[dict]:
    """Active Canadian weather alerts (ECCC GeoMet `weather-alerts`) for our four
    hazards, each with the warning polygon to place the user inside."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_ECCC_ALERTS_URL, params={"limit": 200, "f": "json"})
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    out: list[dict] = []
    for f in data.get("features", []):
        p = f.get("properties", {}) or {}
        if (p.get("status_en") or "").lower() in ("ended", "cleared", "expired"):
            continue
        name = p.get("alert_name_en") or p.get("alert_short_name_en") or ""
        hazard = _eccc_hazard(name)
        if hazard is None:
            continue
        center, ring = _poly_centroid_and_ring(f.get("geometry") or {})
        if not center or not ring:
            continue

        colour = (p.get("risk_colour_en") or "").lower()
        impact = (p.get("impact_en") or "").lower()
        atype = (p.get("alert_type") or "").lower()
        if colour == "red" or impact in ("major", "severe", "extreme"):
            severity = "Extreme"
        elif colour == "orange" or atype == "warning":
            severity = "Severe"
        elif colour == "yellow" or atype == "watch":
            severity = "Moderate"
        else:
            severity = "Minor"
        urgency = "Immediate" if atype == "warning" else "Expected" if atype == "watch" else "Future"

        label = ", ".join(x for x in (p.get("feature_name_en") or "", p.get("province") or "") if x)
        situation = {
            "event": name.title(),
            "hazardType": hazard,
            "severity": severity,
            "urgency": urgency,
            "certainty": "Observed" if atype == "warning" else "Likely",
            "onset": p.get("validity_datetime"),
            "expires": p.get("expiration_datetime"),
            "headline": name.title(),
            "description": (p.get("alert_text_en") or name).strip()[:600],
            "instruction": "",
            "officialEvacOrder": False,
            "areaPolygon": ring,
            "source": "live",
        }
        lat, lon = center
        out.append(
            {
                "situation": situation,
                "lat": lat,
                "lon": lon,
                "label": label,
                "score": _SEV_RANK.get(severity, 0),
            }
        )
    return out


async def resolve_place(
    lat: float, lon: float, ring: list | None = None
) -> tuple[float, float, str] | None:
    """Find a public place to stand the user for a single warned area, or None.
    Used when the user picks a live-demo option. Best-effort; never raises."""
    res = await places.public_places([(ring, (lat, lon))])
    return res[0] if res else None


async def _rank_candidates(limit: int) -> list[dict]:
    """Gather all sources and return up to `limit` candidates, diversified across
    hazard types and strongest-first (placement not yet resolved)."""
    results = await asyncio.gather(
        _nws_candidates(), _eccc_candidates(), _quake_candidates(), return_exceptions=True
    )
    candidates: list[dict] = []
    for r in results:
        if isinstance(r, list):
            candidates.extend(r)
    if not candidates:
        return []

    # Group by hazard, strongest first within each group. Shuffle first, then do a
    # *stable* sort by score: equal-strength events (e.g. several Severe floods across
    # the US and Canada) end up in random order, so neither country is starved just
    # because its source happened to be fetched first.
    by_hazard: dict[str, list[dict]] = {}
    for c in candidates:
        by_hazard.setdefault(c["situation"]["hazardType"], []).append(c)
    for lst in by_hazard.values():
        random.shuffle(lst)
        lst.sort(key=lambda c: c["score"], reverse=True)

    # Round-robin across hazards (most severe hazard first) so the list mixes types.
    order = sorted(by_hazard, key=lambda h: by_hazard[h][0]["score"], reverse=True)
    chosen: list[dict] = []
    depth = 0
    while len(chosen) < limit and any(depth < len(by_hazard[h]) for h in order):
        for h in order:
            if depth < len(by_hazard[h]):
                chosen.append(by_hazard[h][depth])
                if len(chosen) >= limit:
                    break
        depth += 1
    return chosen


async def _attach_places(cands: list[dict]) -> None:
    """Move each candidate to a real public place inside its warned area where one
    can be found (one batched Overpass request). Best-effort: candidates we can't
    resolve keep their centroid point."""
    if not cands:
        return
    anchors = [(c["situation"].get("areaPolygon"), (c["lat"], c["lon"])) for c in cands]
    for c, pp in zip(cands, await places.public_places(anchors)):
        if not pp:
            continue
        plat, plon, name = pp
        c["lat"], c["lon"], c["label"] = plat, plon, name
        q = c.pop("_quake", None)
        if q:  # refresh the stated distance-to-epicentre from the new standpoint
            dist_km = round(haversine_m(plat, plon, q["epi"][0], q["epi"][1]) / 1000.0, 1)
            c["situation"] = _quake_situation(q["mag"], q["place"], dist_km)


async def find_active_disasters(limit: int = 5) -> list[dict]:
    """Return up to `limit` active disasters, each with a point to place the user.

    Diversified across hazard types where possible (so the choices aren't all the
    same hazard), strongest first, with light variety across runs. Placement is the
    warning centroid here (fast, no external calls); the public-place standpoint is
    resolved later for whichever option the user actually picks (see resolve_place).
    Each item: {situation, lat, lon, label}. Never raises."""
    return await _rank_candidates(limit)


async def find_active_disaster() -> dict | None:
    """Return one active disaster + a point to place the simulated user, or None.

    Picks randomly among the most significant current events so repeated runs show
    different real disasters. Shape: {situation, lat, lon, label}. Never raises."""
    pool = await _rank_candidates(6)
    if not pool:
        return None
    pick = random.choice(pool)
    await _attach_places([pick])
    return pick
