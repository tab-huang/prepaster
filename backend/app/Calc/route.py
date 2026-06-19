"""Route hazard-avoidance — would the straight-line path to a destination cross
the warned area?

The routing modules already pick safe buildings/open ground by direction, distance,
and elevation, but a destination can be "uphill and 600 m NE" and still sit on the
far side of the flood/fire warning polygon, so the obvious path runs straight
through the danger. This samples points along the user→destination segment and
flags any candidate whose path enters the warned ring, so the planner can prefer a
destination you can actually reach without passing through the hazard.

Pure geometry over the alert polygon — no network. `ring` is GeoJSON [lon, lat]
pairs, matching Situation.areaPolygon and Calc.geo.point_in_polygon.
"""
from __future__ import annotations

from .geo import point_in_polygon


def segment_crosses_ring(
    lat1: float, lon1: float, lat2: float, lon2: float,
    ring: list[list[float]] | None, samples: int = 16,
) -> bool:
    """True if the interior of the straight segment (lat1,lon1)->(lat2,lon2)
    passes through the polygon `ring`. Endpoints are skipped — the user or the
    destination being inside the zone is a separate fact, not a crossing."""
    if not ring or len(ring) < 3:
        return False
    for k in range(1, samples):
        t = k / samples
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t
        if point_in_polygon(lat, lon, ring):
            return True
    return False


def route_advisory(
    user_lat: float, user_lon: float,
    places: list[dict] | None,
    ring: list[list[float]] | None,
) -> dict:
    """Annotate candidate destinations with whether their path crosses the warned
    area. `places` are dicts carrying lat/lon/name. Returns a compact advisory the
    planner can fold into the route choice."""
    out: dict = {"warned_area_known": bool(ring and len(ring) >= 3)}
    if not out["warned_area_known"] or not places:
        return out

    crossing: list[str] = []
    clear: list[str] = []
    for p in places:
        plat, plon = p.get("lat"), p.get("lon")
        if plat is None or plon is None:
            continue
        name = p.get("name") or "destination"
        if segment_crosses_ring(user_lat, user_lon, plat, plon, ring):
            crossing.append(name)
        else:
            clear.append(name)

    out["destinations_crossing_warned_area"] = crossing
    out["destinations_with_clear_path"] = clear
    if crossing:
        out["note"] = (
            "The straight-line path to these destinations passes through the warned "
            "area: " + ", ".join(crossing) + ". Prefer a destination with a clear path "
            "(" + (", ".join(clear) if clear else "none found — follow official routes") +
            ") or follow official evacuation routes around the hazard, even if it is farther."
        )
    return out
