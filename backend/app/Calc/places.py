"""Find a real public place to stand the simulated user, via OpenStreetMap.

A warning polygon's geometric centroid often lands in forest, water, or open
country. For the live demo we'd rather drop the person somewhere recognizable —
a school, library, community centre, park, etc. — near the centre of the warned
area. We ask the Overpass API for named public places within a radius of each
warning's centroid and pick the closest one (preferring inside the polygon).

The whole candidate list is resolved in a *single* Overpass request (one query
covering every warned area at once), and that request is raced across several
mirrors. Best-effort: on any failure (Overpass slow / down / nothing nearby) the
caller keeps the original centroid. Never raises.
"""
from __future__ import annotations

import asyncio

import httpx

from .geo import haversine_m, point_in_polygon

# Full-planet mirrors only (regional servers like overpass.osm.ch return fast but
# empty outside their area and would wrongly win the race).
_OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
# Overpass requires a descriptive User-Agent; raw posts without one get a 406.
_HEADERS = {"User-Agent": "crisis-to-action/0.2 (live-demo placement)"}

# Public, recognizable places where a person could plausibly be standing.
_AMENITY = (
    "school|college|university|hospital|library|townhall|community_centre|"
    "place_of_worship|police|fire_station|marketplace"
)
_LEISURE = "park|stadium|sports_centre|recreation_ground"

# How far from a warning's centroid we'll look for a public place.
_RADIUS_M = 20_000

# A warned area: (polygon ring as [lon, lat] pairs | None, (lat, lon) centroid).
Anchor = tuple[list | None, tuple[float, float]]


def _around(centroid: tuple[float, float]) -> str:
    a = f"(around:{_RADIUS_M},{centroid[0]},{centroid[1]})"
    return (
        f'nwr{a}[amenity~"^({_AMENITY})$"]["name"];'
        f'nwr{a}[leisure~"^({_LEISURE})$"]["name"];'
        f'nwr{a}[shop=mall]["name"];'
    )


def _select(pois: list[tuple[float, float, str]], ring, centroid):
    """Best public place for one warned area: within radius of the centroid,
    preferring inside the polygon, then nearest to the centroid."""
    clat, clon = centroid
    here = [p for p in pois if haversine_m(clat, clon, p[0], p[1]) <= _RADIUS_M]
    if ring:
        inside = [p for p in here if point_in_polygon(p[0], p[1], ring)]
        if inside:
            here = inside
    if not here:
        return None
    return min(here, key=lambda p: haversine_m(clat, clon, p[0], p[1]))


async def _fetch(query: str) -> dict | None:
    """POST the query to all Overpass mirrors at once and return the first valid
    response, cancelling the rest. Bounded by a single timeout window (not the sum),
    so a slow/overloaded mirror can't stall the demo. Returns None if all fail."""
    async with httpx.AsyncClient(timeout=9.0, headers=_HEADERS) as client:

        async def _one(url: str) -> dict:
            resp = await client.post(url, data={"data": query})
            resp.raise_for_status()
            return resp.json()

        pending = {asyncio.create_task(_one(u)) for u in _OVERPASS_URLS}
        result: dict | None = None
        try:
            while pending and result is None:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for d in done:
                    try:
                        result = d.result()
                        break
                    except Exception:
                        continue  # this mirror failed; keep waiting on the others
        finally:
            for t in pending:
                t.cancel()
        return result


async def public_places(anchors: list[Anchor]) -> list[tuple[float, float, str] | None]:
    """For each warned area, return (lat, lon, name) of a public place near it, or
    None. Output is aligned with `anchors`. One Overpass request for the whole list."""
    if not anchors:
        return []

    query = (
        "[out:json][timeout:25];("
        + "".join(_around(centroid) for (_ring, centroid) in anchors)
        + ");out center 200;"
    )
    data = await _fetch(query)
    if data is None:
        return [None] * len(anchors)

    pois: list[tuple[float, float, str]] = []
    for el in data.get("elements", []):
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        name = (el.get("tags") or {}).get("name")
        if lat is not None and lon is not None and name:
            pois.append((lat, lon, name))

    return [_select(pois, ring, centroid) for (ring, centroid) in anchors]


# --------------------------------------------------------------------------- #
# Surroundings — what does the user's point sit on / in?
# --------------------------------------------------------------------------- #
# Building values that read as somewhere a person lives / shelters vs. other kinds.
_RESID_BUILDING = {
    "house", "residential", "apartments", "detached", "terrace", "bungalow",
    "semidetached_house", "dormitory", "hut", "cabin", "static_caravan", "houseboat",
}
_PUBLIC_BUILDING = {
    "school", "university", "college", "hospital", "church", "cathedral", "mosque",
    "temple", "civic", "public", "government", "fire_station", "police", "hotel",
}


def _building_phrase(b: str) -> str:
    if b in _RESID_BUILDING:
        return "a residential building (likely a house or apartment)"
    if b in _PUBLIC_BUILDING:
        return f"a {b.replace('_', ' ')} building"
    if b in ("yes", "true") or not b:
        return "a building"
    return f"a {b.replace('_', ' ')} building"


def _land_phrase(landuses: set, naturals: set, leisures: set, protected: bool) -> str | None:
    if "forest" in landuses or naturals & {"wood"}:
        return "forested terrain"
    if naturals & {"peak", "ridge", "mountain_range", "cliff", "scree", "bare_rock", "saddle"}:
        return "mountainous or rocky terrain"
    if naturals & {"water", "wetland", "bay", "strait", "spring"} or landuses & {"reservoir", "basin"}:
        return "on or beside water"
    if protected or leisures & {"nature_reserve"} or naturals & {"scrub", "heath", "grassland", "moor"}:
        return "wilderness or open natural terrain"
    if "residential" in landuses:
        return "a residential area"
    if "industrial" in landuses:
        return "an industrial area"
    if landuses & {"commercial", "retail"}:
        return "a commercial area"
    if landuses & {"farmland", "farmyard", "meadow", "orchard", "vineyard", "grass",
                   "recreation_ground", "greenfield"} or leisures & {"park", "pitch", "garden", "golf_course"}:
        return "open fields or parkland"
    return None


def _describe(tagsets: list[dict]) -> dict | None:
    """Turn the areas/buildings enclosing a point into a short, human descriptor."""
    building = bname = featname = None
    landuses: set = set()
    naturals: set = set()
    leisures: set = set()
    protected = False
    for t in tagsets:
        b = t.get("building")
        if b and b != "no" and building is None:
            building, bname = b, t.get("name")
        if t.get("landuse"):
            landuses.add(t["landuse"])
        if t.get("natural"):
            naturals.add(t["natural"])
        if t.get("leisure"):
            leisures.add(t["leisure"])
        if t.get("boundary") == "protected_area" or t.get("leisure") == "nature_reserve":
            protected = True
            featname = featname or t.get("name")
        if t.get("name") and not featname and (t.get("natural") or t.get("leisure") or t.get("landuse")):
            featname = t.get("name")

    land = _land_phrase(landuses, naturals, leisures, protected)
    if building:
        summary = _building_phrase(building)
    elif land:
        summary = land
    else:
        return None
    return {
        "summary": summary,
        "indoors_likely": bool(building),
        "terrain": land,
        "notable_feature": bname or featname,
    }


async def surroundings(lat: float, lon: float) -> dict | None:
    """Best-effort: describe what the point sits on/in — a building (and what kind),
    or the land around it (residential, forest, mountainous, water, open terrain).
    Returns None if it can't be determined or Overpass is unavailable. Never raises."""
    query = (
        f"[out:json][timeout:20];"
        f"is_in({lat},{lon})->.a;.a out tags;"
        f"nwr(around:25,{lat},{lon})[building];out tags 5;"
    )
    try:
        data = await _fetch(query)
        if not data:
            return None
        return _describe([el.get("tags") or {} for el in data.get("elements", [])])
    except Exception:
        return None
