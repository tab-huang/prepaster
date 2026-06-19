"""Environment and Climate Change Canada (ECCC) live alerts.

Canada has no point-query equivalent of NWS's `/alerts/active?point=`. Its public
weather alerts ride along on the MSC GeoMet "City Page Weather" feature service
(`citypageweather-realtime`), which IS point-queryable: each city page carries a
`warnings` list. We find the nearest city page to the user and read its warnings.

Coverage note: ECCC issues weather warnings (tornado, severe storm/rainfall, etc.).
Canadian wildfire alerts come from provincial agencies and earthquakes from NRCan,
so those may not appear here — the screenshot flow still handles any alert. Never
raises; returns None on no usable alert.
"""
from __future__ import annotations

import httpx

from ..Calc.geo import haversine_m
from ..hazards import detect_hazard

GEOMET_URL = "https://api.weather.gc.ca/collections/citypageweather-realtime/items"


def _bbox(lat: float, lon: float, d: float = 0.6) -> str:
    return f"{lon - d},{lat - d},{lon + d},{lat + d}"


def _first(d: dict, *keys: str) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _normalize_warnings(warnings) -> list[dict]:
    """ECCC `warnings` is [] when empty, a list (or sometimes a dict) when present."""
    if isinstance(warnings, list):
        return [w for w in warnings if isinstance(w, dict)]
    if isinstance(warnings, dict):
        # Could be a single warning object, or {"warning": [...]}.
        inner = warnings.get("warning")
        if isinstance(inner, list):
            return [w for w in inner if isinstance(w, dict)]
        if isinstance(inner, dict):
            return [inner]
        return [warnings]
    return []


def _to_situation(hazard: str, event: str, warn: dict) -> dict:
    typ = (_first(warn, "type", "priority")).lower()
    low = event.lower()
    if "warning" in low or "warning" in typ:
        severity, urgency = "Severe", "Immediate"
    elif "watch" in low or "watch" in typ:
        severity, urgency = "Moderate", "Future"
    else:
        severity, urgency = "Minor", "Expected"
    if (_first(warn, "priority")).lower() in ("urgent", "high"):
        severity = "Extreme"

    desc = _first(warn, "description", "text", "title", "event") or event
    return {
        "event": event,
        "hazardType": hazard,
        "severity": severity,
        "urgency": urgency,
        "certainty": "Observed",
        "onset": _first(warn, "issueTime", "issue", "onset") or None,
        "expires": _first(warn, "expiryTime", "expiry", "expires", "ends") or None,
        "headline": event,
        "description": desc,
        "instruction": "",
        "officialEvacOrder": False,
        "areaPolygon": None,  # city-page warnings aren't polygon-scoped
        "source": "live",
    }


async def eccc_api(lat: float, lon: float) -> dict | None:
    """Return the nearest active ECCC weather warning for a supported hazard, or None."""
    params = {"bbox": _bbox(lat, lon), "limit": 100, "f": "json"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(GEOMET_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None

    feats = [f for f in data.get("features", []) if isinstance(f, dict)]
    if not feats:
        return None

    def _dist(f: dict) -> float:
        c = (f.get("geometry") or {}).get("coordinates") or [lon, lat]
        return haversine_m(lat, lon, c[1], c[0])

    feats.sort(key=_dist)

    for f in feats:
        props = f.get("properties", {}) or {}
        for warn in _normalize_warnings(props.get("warnings")):
            text = _first(warn, "description", "text", "event", "title", "type")
            typ = (_first(warn, "type")).lower()
            event = text or ""
            low = event.lower()
            # Make sure triage can read the watch/warning level from the event string.
            if typ and "warning" not in low and "watch" not in low and "advisory" not in low:
                event = f"{event} {typ}".strip()
            hazard = detect_hazard(event)
            if hazard is None:
                continue
            return _to_situation(hazard, event or f"{hazard.title()} alert", warn)

    return None
