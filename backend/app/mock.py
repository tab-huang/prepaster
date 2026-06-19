"""Demo Mode: realistic NWS-shaped alert payloads for all four hazards.

Each hazard has a test location chosen so its module visibly works:
  flood     -> hilly ground near Boulder, CO (real elevation gradient)
  wildfire  -> Santa Rosa, CA (fire-prone) + seeded nearby fire detections
  tornado   -> Oklahoma City (tornado alley)
  earthquake-> San Francisco, CA

The tier tunes urgency/severity/event so the triage logic keys off realistic
fields. Earthquakes aren't an NWS product, so the earthquake payload is shaped
like a generic civil-emergency message.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .Calc.geo import offset_point

# Roughly how much lead time each tier implies — used to seed a realistic
# `expires` timestamp on demo alerts.
_TIER_WINDOW = {
    "RUN": timedelta(minutes=10),
    "ACT": timedelta(hours=1),
    "PREPARE": timedelta(hours=6),
}

# Per-hazard demo coordinates (frontend pre-seeds geolocation to these).
DEMO_COORDS = {
    "flood": {"lat": 40.0150, "lon": -105.2705},
    "wildfire": {"lat": 38.4400, "lon": -122.7100},
    "tornado": {"lat": 35.4823, "lon": -97.5350},
    "earthquake": {"lat": 37.7749, "lon": -122.4194},
}


def _box(lat: float, lon: float, d: float = 0.03) -> list[list[float]]:
    """A simple square polygon (list of [lon, lat]) around a point."""
    return [
        [lon - d, lat - d],
        [lon - d, lat + d],
        [lon + d, lat + d],
        [lon + d, lat - d],
        [lon - d, lat - d],
    ]


# event / severity / urgency / certainty per hazard per tier, plus copy.
_HAZARD_TIERS = {
    "flood": {
        "RUN": ("Flash Flood Warning", "Extreme", "Immediate", "Observed",
                "A wall of water is moving down the creek. Life-threatening flash flooding "
                "is occurring now. Move to higher ground immediately.",
                "Turn around, don't drown. Move to higher ground now."),
        "ACT": ("Flood Warning", "Severe", "Expected", "Likely",
                "Flooding is expected within the hour as heavy rain continues upstream. "
                "Move to higher ground before water rises.",
                "Move to higher ground. Avoid low spots and creek crossings."),
        "PREPARE": ("Flood Watch", "Moderate", "Future", "Possible",
                    "Conditions are favorable for flooding over the next 12-24 hours. "
                    "Review your route to higher ground and gather supplies.",
                    "Be ready to move to higher ground if a warning is issued."),
    },
    "wildfire": {
        "RUN": ("Fire Warning", "Extreme", "Immediate", "Observed",
                "A fast-moving wildfire is in your area. Mandatory evacuation is in effect. "
                "Leave now away from the smoke and flames.",
                "Evacuate immediately. Leave now toward open, cleared ground."),
        "ACT": ("Fire Weather Warning", "Severe", "Expected", "Likely",
                "Active wildfire detected nearby with strong winds. Prepare to evacuate and "
                "move away from the fire's path now.",
                "Move away from the fire, not downwind of it."),
        "PREPARE": ("Red Flag Warning", "Moderate", "Future", "Possible",
                    "Critical fire weather conditions are expected. Be ready to evacuate and "
                    "know your route away from fire-prone terrain.",
                    "Prepare to evacuate; keep an escape route in mind."),
    },
    "tornado": {
        "RUN": ("Tornado Warning", "Extreme", "Immediate", "Observed",
                "A tornado has been spotted. Take cover now in the lowest, most interior "
                "room. Flying debris is deadly.",
                "Get to the lowest interior room away from windows now. Cover your head."),
        "ACT": ("Tornado Warning", "Severe", "Immediate", "Likely",
                "A tornado is possible in your area. Move to a safe room now.",
                "Move to a small interior room on the lowest floor."),
        "PREPARE": ("Tornado Watch", "Moderate", "Future", "Possible",
                    "Conditions are favorable for tornadoes over the next several hours. "
                    "Know where your safe room is.",
                    "Identify your lowest, most interior room now."),
    },
    "earthquake": {
        "RUN": ("Earthquake", "Extreme", "Immediate", "Observed",
                "Strong shaking is occurring. Drop, cover, and hold on. After shaking stops, "
                "check for gas and structural damage before moving.",
                "Drop, cover, and hold on. Stay until shaking stops."),
        "ACT": ("Earthquake", "Severe", "Immediate", "Observed",
                "A significant earthquake has occurred. Aftershocks are likely. If your "
                "building is damaged, move to open ground away from structures.",
                "Drop, cover, and hold on; then assess for damage."),
        "PREPARE": ("Earthquake", "Moderate", "Expected", "Possible",
                    "Aftershocks remain possible. Identify safe spots and an open-ground "
                    "meeting point away from buildings and power lines.",
                    "Know your safe spots; be ready for aftershocks."),
    },
}


def mock_alert(hazard: str, tier: str = "ACT") -> dict:
    """Return a parsed-shape Situation dict for the hazard + tier."""
    hazard = hazard if hazard in _HAZARD_TIERS else "flood"
    tiers = _HAZARD_TIERS[hazard]
    t = tiers.get(tier, tiers["ACT"])
    event, severity, urgency, certainty, desc, instr = t
    coords = DEMO_COORDS[hazard]
    blob = (desc + " " + instr).lower()
    # Earthquakes have no meaningful warning polygon; the rest get a box.
    polygon = None if hazard == "earthquake" else _box(coords["lat"], coords["lon"])
    # Seed a realistic timing window. Earthquakes aren't an NWS-style timed
    # product, so they get no expiry; the others expire after their tier window.
    now = datetime.now(timezone.utc)
    onset = now.isoformat()
    expires = None if hazard == "earthquake" else (now + _TIER_WINDOW.get(tier, _TIER_WINDOW["ACT"])).isoformat()
    return {
        "event": event,
        "hazardType": hazard,
        "severity": severity,
        "urgency": urgency,
        "certainty": certainty,
        "onset": onset,
        "expires": expires,
        "headline": f"{event} for your area (demo)",
        "description": desc,
        "instruction": instr,
        "officialEvacOrder": "evacuat" in blob,
        "areaPolygon": polygon,
        "source": "mock",
    }


def demo_fires(lat: float, lon: float) -> list[dict]:
    """Seeded active-fire detections near the user, for the wildfire demo. Placed
    to the SW so the escape vector (away from fire) points NE."""
    seeds = [
        (225, 1200, 320.0),  # bearing SW, 1.2 km, brightness
        (210, 1800, 340.0),
        (245, 2500, 305.0),
    ]
    out = []
    for bearing, dist, bright in seeds:
        flat, flon = offset_point(lat, lon, bearing, dist)
        out.append({"lat": flat, "lon": flon, "brightness": bright, "distance_m": dist})
    return out
