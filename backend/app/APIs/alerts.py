"""Live-alert dispatcher across national + global hazard sources.

Order of precedence for a given point:
  1. NWS   — US weather warnings (clean point-query; 400s outside the US).
  2. ECCC  — Canada weather warnings (GeoMet city-page feed).
  3. USGS  — recent significant earthquakes near the point (global, key-free).
  4. FIRMS — active wildfire detections near the point (global, needs FIRMS_MAP_KEY).

Weather feeds are polygon/point matched so they take precedence; quake and fire
are proximity detections that fill the gaps the weather feeds don't carry
(notably Canadian wildfire and any earthquake, which aren't weather products).
ECCC returns nothing over US bboxes and NWS 400s over Canada, so there are no
cross-border false positives. Never raises.
"""
from __future__ import annotations

from . import eccc, firms, nws, usgs

# Rough bounding boxes for US (incl. AK/HI/PR) coverage. NWS only answers for US
# points and returns 400 elsewhere, so we skip the doomed request for points that
# are clearly outside. Border zones (e.g. the Great Lakes, where a box still spans
# both countries) still try NWS and fall through cleanly to ECCC on a 400.
_US_BOXES = (
    (24.0, 50.0, -125.0, -66.0),   # contiguous US
    (51.0, 72.0, -170.0, -129.0),  # Alaska
    (18.0, 23.0, -161.0, -154.0),  # Hawaii
    (17.0, 19.0, -68.0, -64.0),    # Puerto Rico / USVI
)


def _maybe_in_us(lat: float, lon: float) -> bool:
    """True if the point could be in US/NWS coverage (coarse — border zones included)."""
    return any(s <= lat <= n and w <= lon <= e for (s, n, w, e) in _US_BOXES)


def _quake_situation(q: dict) -> dict:
    mag = q.get("magnitude")
    dist = q.get("distance_km")
    place = q.get("place") or "nearby"
    severity = "Extreme" if (mag or 0) >= 6 else "Severe" if (mag or 0) >= 4.5 else "Moderate"
    mag_str = f"M{mag}" if mag is not None else "Earthquake"
    return {
        "event": f"{mag_str} Earthquake",
        "hazardType": "earthquake",
        "severity": severity,
        "urgency": "Immediate",
        "certainty": "Observed",
        "onset": None,
        "expires": None,
        "headline": f"{mag_str} earthquake detected nearby",
        "description": (
            f"A magnitude {mag} earthquake occurred about {dist} km away ({place}). "
            "Aftershocks are possible — be ready to drop, cover, and hold on again."
        ),
        "instruction": "",
        "officialEvacOrder": False,
        "areaPolygon": None,
        "source": "live",
    }


def _fire_situation(fa: dict) -> dict:
    km = round(fa["nearest_m"] / 1000.0, 1)
    count = fa.get("count", 0)
    return {
        "event": "Active Wildfire Detected",
        "hazardType": "wildfire",
        "severity": "Severe",
        "urgency": "Immediate",
        "certainty": "Observed",
        "onset": None,
        "expires": None,
        "headline": "Active fire detected nearby",
        "description": (
            f"{count} active fire detection(s) nearby; the nearest is about {km} km away "
            "(NASA FIRMS satellite). Fire conditions can change quickly with wind."
        ),
        "instruction": "",
        "officialEvacOrder": False,
        "areaPolygon": None,
        "source": "live",
    }


async def fetch_alert(lat: float, lon: float) -> dict | None:
    """Return the most relevant live alert at the point from whichever source
    covers it, or None. Never raises."""
    # 1. United States (+ territories) — NWS weather warnings. Skip the call for
    #    points clearly outside US coverage; border-zone points still try it.
    if _maybe_in_us(lat, lon):
        try:
            situation = await nws.nws_api(lat, lon)
            if situation:
                return situation
        except Exception:
            pass  # border-zone non-US points 400 here; fall through to ECCC

    # 2. Canada — ECCC city-page weather warnings.
    try:
        situation = await eccc.eccc_api(lat, lon)
        if situation:
            return situation
    except Exception:
        pass

    # 3. Earthquakes — USGS recent significant quake near the point (global).
    try:
        q = await usgs.quake_alert(lat, lon)
        if q:
            return _quake_situation(q)
    except Exception:
        pass

    # 4. Wildfire — FIRMS active-fire detections near the point (global; needs key).
    try:
        fa = await firms.fire_alert(lat, lon)
        if fa:
            return _fire_situation(fa)
    except Exception:
        pass

    return None
