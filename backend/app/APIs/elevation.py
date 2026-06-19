"""Elevation-ring reasoning — samples concentric rings around the user via Open-Meteo."""
from __future__ import annotations

import httpx

from ..Calc.geo import COMPASS, offset_point

RADII = [150, 400, 800]
GAIN_THRESHOLD_M = 5.0

ELEV_URL = "https://api.open-meteo.com/v1/elevation"


def _build_sample_points(lat: float, lon: float) -> list[dict]:
    points = [{"label": "center", "direction": None, "radius": 0, "lat": lat, "lon": lon}]
    for name, bearing in COMPASS:
        for r in RADII:
            plat, plon = offset_point(lat, lon, bearing, r)
            points.append(
                {"label": f"{name}@{r}m", "direction": name, "radius": r, "lat": plat, "lon": plon}
            )
    return points


async def _fetch_elevations(points: list[dict]) -> list[float]:
    lats = ",".join(f"{p['lat']:.6f}" for p in points)
    lons = ",".join(f"{p['lon']:.6f}" for p in points)
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(ELEV_URL, params={"latitude": lats, "longitude": lons})
        resp.raise_for_status()
        data = resp.json()
    return data.get("elevation", [])


def _reason(points: list[dict], elevations: list[float], base: float) -> dict:
    samples = []
    for p, e in zip(points[1:], elevations[1:]):
        samples.append({**p, "elevation": e, "gain": e - base})

    dir_gain: dict[str, list[float]] = {}
    for s in samples:
        dir_gain.setdefault(s["direction"], []).append(s["gain"])
    dir_avg = {d: sum(gs) / len(gs) for d, gs in dir_gain.items()}

    best_dir = max(dir_avg, key=dir_avg.get) if dir_avg else None
    best_dir_avg_gain = dir_avg.get(best_dir, 0.0) if best_dir else 0.0

    high_point = None
    if best_dir:
        candidates = sorted(
            (s for s in samples if s["direction"] == best_dir and s["gain"] >= GAIN_THRESHOLD_M),
            key=lambda s: s["radius"],
        )
        if candidates:
            high_point = candidates[0]

    max_gain = max((s["gain"] for s in samples), default=0.0)
    flat = max_gain < GAIN_THRESHOLD_M

    return {
        "baseElevation": round(base, 1),
        "directionGains": {d: round(g, 1) for d, g in dir_avg.items()},
        "bestDirection": best_dir,
        "bestDirectionGain": round(best_dir_avg_gain, 1),
        "flat": flat,
        "maxGain": round(max_gain, 1),
        "highGroundVector": (
            {
                "direction": high_point["direction"],
                "distance_m": high_point["radius"],
                "gain_m": round(high_point["gain"], 1),
                "lat": high_point["lat"],
                "lon": high_point["lon"],
            }
            if high_point
            else None
        ),
        "samples": [
            {
                "lat": s["lat"],
                "lon": s["lon"],
                "elevation": round(s["elevation"], 1),
                "gain": round(s["gain"], 1),
            }
            for s in samples
            if s["radius"] == max(RADII)
        ],
        "resolution_note": "Elevation is sampled at ~90 m resolution (Copernicus). Good for "
        "which way trends higher, not fine detail.",
    }


async def elevation_api(lat: float, lon: float) -> dict:
    """Run the full ring analysis. On API failure returns an error-flagged dict."""
    points = _build_sample_points(lat, lon)
    try:
        elevations = await _fetch_elevations(points)
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "baseElevation": None,
            "highGroundVector": None,
            "flat": False,
            "resolution_note": "Elevation data unavailable — fall back to nearest safe "
            "building and move toward higher floors.",
        }

    if not elevations or len(elevations) != len(points):
        return {
            "ok": False,
            "error": "unexpected elevation response shape",
            "baseElevation": None,
            "highGroundVector": None,
            "flat": False,
        }

    base = elevations[0]
    result = _reason(points, elevations, base)
    result["ok"] = True
    return result
