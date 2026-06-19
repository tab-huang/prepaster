"""NASA FIRMS active-fire detections (free API key)."""
from __future__ import annotations

import csv
import io
import os

import httpx

from ..Calc.geo import haversine_m

SOURCE = "VIIRS_SNPP_NRT"

# Hardcoded default MAP_KEY (free NASA FIRMS key). An env var still overrides it.
_DEFAULT_MAP_KEY = "6125afc3b8f51b22f8d1ebbd95c4038f"
MAP_KEY = os.environ.get("FIRMS_MAP_KEY") or _DEFAULT_MAP_KEY


def _bbox(lat: float, lon: float, half_deg: float = 0.5) -> str:
    return f"{lon - half_deg},{lat - half_deg},{lon + half_deg},{lat + half_deg}"


async def firms_api(lat: float, lon: float, days: int = 1) -> dict:
    """Return nearby fire detections sorted by distance, or ok=False if no key/data."""
    if not MAP_KEY:
        return {"ok": False, "error": "no FIRMS_MAP_KEY configured", "fires": []}

    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{_bbox(lat, lon)}/{days}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = resp.text
    except Exception as exc:
        return {"ok": False, "error": str(exc), "fires": []}

    fires = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            try:
                flat = float(row["latitude"])
                flon = float(row["longitude"])
            except (KeyError, ValueError):
                continue
            try:
                frp = float(row.get("frp") or 0)
            except ValueError:
                frp = 0.0
            fires.append(
                {
                    "lat": flat,
                    "lon": flon,
                    "brightness": float(row.get("bright_ti4") or row.get("brightness") or 0) or None,
                    "frp": frp,  # fire radiative power (MW) — intensity discriminator
                    "confidence": (row.get("confidence") or "").strip().lower(),
                    "distance_m": round(haversine_m(lat, lon, flat, flon)),
                }
            )
    except Exception as exc:
        return {"ok": False, "error": f"parse error: {exc}", "fires": []}

    fires.sort(key=lambda f: f["distance_m"])
    return {"ok": True, "fires": fires[:50]}


# Thresholds that separate a real, evacuation-worthy wildfire from a persistent
# industrial heat source (steel mills, gas flares, refineries) that VIIRS also flags.
# Industrial sources show low FRP (~1-3 MW) and moderate brightness (~300-330 K) at a
# fixed location; genuine fire pixels radiate far more. We require a detection to be
# both *close* and *credibly intense* before raising a "leave now" wildfire alert.
_MIN_FRP_MW = 5.0        # fire radiative power; industrial flares sit well below this
_MIN_BRIGHTNESS_K = 340  # bright_ti4; real fire pixels run ~350 K+, often saturating


def _is_credible_fire(f: dict) -> bool:
    """A detection looks like a real wildfire, not an industrial thermal source."""
    if f.get("confidence") in ("l", "low"):
        return False
    frp = f.get("frp") or 0
    bright = f.get("brightness") or 0
    return frp >= _MIN_FRP_MW or bright >= _MIN_BRIGHTNESS_K


async def fire_alert(lat: float, lon: float, max_km: float = 12.0) -> dict | None:
    """Return a wildfire alert candidate if *credible* active fire detections are close,
    or None.

    Requires FIRMS_MAP_KEY (global satellite coverage, includes Canada). Filters out
    low-intensity / low-confidence detections so persistent industrial heat sources
    (steel mills, gas flares) don't trip a false wildfire alert. Returns None if
    unconfigured, on error, or if no credible detection is within max_km. Never raises."""
    res = await firms_api(lat, lon)
    if not res.get("ok"):
        return None
    fires = [f for f in res.get("fires", []) if _is_credible_fire(f)]
    if not fires:
        return None
    nearest = min(fires, key=lambda f: f["distance_m"])
    if nearest["distance_m"] > max_km * 1000:
        return None
    return {"count": len(fires), "nearest_m": nearest["distance_m"]}
