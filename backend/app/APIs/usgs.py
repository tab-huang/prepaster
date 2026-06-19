"""USGS recent-earthquake confirmation (free, no key)."""
from __future__ import annotations

import time as _time

import httpx

from ..Calc.geo import haversine_m

FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"


async def usgs_api(lat: float, lon: float, radius_km: float = 300) -> dict:
    """Return the nearest recent quake within radius, or ok=False. Never raises."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(FEED_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    best = None
    for f in data.get("features", []):
        coords = (f.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        qlon, qlat = coords[0], coords[1]
        dist_km = haversine_m(lat, lon, qlat, qlon) / 1000.0
        if dist_km <= radius_km and (best is None or dist_km < best["distance_km"]):
            props = f.get("properties", {})
            best = {
                "magnitude": props.get("mag"),
                "place": props.get("place"),
                "time": props.get("time"),
                "distance_km": round(dist_km, 1),
            }
    if best is None:
        return {"ok": True, "found": False}
    return {"ok": True, "found": True, **best}


async def quake_alert(
    lat: float,
    lon: float,
    min_mag: float = 4.0,
    max_km: float = 300.0,
    max_age_s: int = 3 * 3600,
) -> dict | None:
    """Return the most significant *recent, nearby* quake as an alert candidate, or None.

    Unlike usgs_api (which returns the nearest of any size for confirmation), this
    filters by magnitude, distance, and recency so it only fires when there's a quake
    worth alerting on. Global coverage (includes Canada). Never raises."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(FEED_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None

    now_ms = _time.time() * 1000.0
    best = None
    for f in data.get("features", []):
        props = f.get("properties", {}) or {}
        mag = props.get("mag")
        t = props.get("time")  # epoch ms
        coords = (f.get("geometry") or {}).get("coordinates") or []
        if mag is None or mag < min_mag or len(coords) < 2:
            continue
        if t and (now_ms - t) > max_age_s * 1000:
            continue
        dist_km = haversine_m(lat, lon, coords[1], coords[0]) / 1000.0
        if dist_km > max_km:
            continue
        cand = {
            "magnitude": mag,
            "place": props.get("place"),
            "time": t,
            "distance_km": round(dist_km, 1),
        }
        # Prefer the strongest; break ties by proximity.
        if best is None or mag > best["magnitude"] or (
            mag == best["magnitude"] and dist_km < best["distance_km"]
        ):
            best = cand
    return best
