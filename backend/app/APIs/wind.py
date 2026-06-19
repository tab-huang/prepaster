"""Current wind from Open-Meteo (free, no key). Used by the wildfire module."""
from __future__ import annotations

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_NAMES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _to_compass(deg: float) -> str:
    return _NAMES[round((deg % 360) / 45) % 8]


async def wind_api(lat: float, lon: float) -> dict:
    """Return wind info, or an error-flagged dict (never raises)."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "kmh",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(FORECAST_URL, params=params)
            resp.raise_for_status()
            cur = resp.json().get("current", {})
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    from_deg = cur.get("wind_direction_10m")
    speed = cur.get("wind_speed_10m")
    if from_deg is None:
        return {"ok": False, "error": "no wind data"}
    toward_deg = (from_deg + 180) % 360
    return {
        "ok": True,
        "speed_kmh": speed,
        "from_deg": from_deg,
        "from_compass": _to_compass(from_deg),
        "toward_deg": toward_deg,
        "toward_compass": _to_compass(toward_deg),
    }
