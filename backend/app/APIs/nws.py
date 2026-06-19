"""NWS active-alerts fetch + parse, for all four supported hazards."""
from __future__ import annotations

import httpx

from ..Calc.geo import point_in_polygon
from ..hazards import detect_hazard

USER_AGENT = "CrisisToAction/0.1 (disaster-response demo; contact: crisis@example.com)"

_EVAC_KEYWORDS = ("evacuat", "evacuation order", "leave now", "mandatory evacuation")


def _extract_polygon(feature: dict) -> list[list[float]] | None:
    geom = feature.get("geometry") or {}
    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if not coords:
        return None
    if gtype == "Polygon":
        return coords[0]
    if gtype == "MultiPolygon":
        return coords[0][0]
    return None


def parse_alert(feature: dict) -> dict | None:
    props = feature.get("properties", {})
    event = props.get("event") or ""
    hazard = detect_hazard(event)
    if hazard is None:
        return None
    desc = props.get("description") or ""
    instr = props.get("instruction") or ""
    blob = (desc + " " + instr).lower()
    return {
        "event": event or "Alert",
        "hazardType": hazard,
        "severity": props.get("severity") or "Unknown",
        "urgency": props.get("urgency") or "Unknown",
        "certainty": props.get("certainty") or "Unknown",
        "onset": props.get("onset"),
        "expires": props.get("expires") or props.get("ends"),
        "headline": props.get("headline"),
        "description": desc,
        "instruction": instr,
        "officialEvacOrder": any(k in blob for k in _EVAC_KEYWORDS),
        "areaPolygon": _extract_polygon(feature),
        "source": "live",
    }


async def nws_api(lat: float, lon: float) -> dict | None:
    """Return the most relevant active hazard alert at the point, or None."""
    url = f"https://api.weather.gov/alerts/active?point={lat},{lon}"
    headers = {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    parsed = [p for p in (parse_alert(f) for f in data.get("features", [])) if p]
    if not parsed:
        return None

    severity_rank = {"Extreme": 4, "Severe": 3, "Moderate": 2, "Minor": 1, "Unknown": 0}
    parsed.sort(key=lambda p: severity_rank.get(p.get("severity", "Unknown"), 0), reverse=True)
    return parsed[0]


def compute_in_zone(lat: float, lon: float, situation: dict) -> bool:
    poly = situation.get("areaPolygon")
    if not poly:
        return True
    return point_in_polygon(lat, lon, poly)
