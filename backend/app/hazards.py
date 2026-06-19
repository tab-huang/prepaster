"""Hazard-type detection and response-pattern mapping.

The hazard type selects which Stage-4 decision module runs. We derive it from the
NWS event string (or take a demo override).
"""
from __future__ import annotations

# Response pattern per hazard. Routing = "go somewhere"; shelter = "stay/act in place".
RESPONSE_PATTERN = {
    "flood": "routing",
    "wildfire": "routing",
    "tornado": "shelter",
    "earthquake": "shelter",
}

# Keyword -> hazard, checked against the lowercased NWS event name.
_EVENT_MAP = [
    ("flash flood", "flood"),
    ("flood", "flood"),
    ("fire", "wildfire"),
    ("red flag", "wildfire"),  # red flag warning = fire-weather
    ("tornado", "tornado"),
    ("earthquake", "earthquake"),
]


def detect_hazard(event: str | None) -> str | None:
    """Return one of flood/wildfire/tornado/earthquake, or None if not one of ours."""
    e = (event or "").lower()
    for kw, hazard in _EVENT_MAP:
        if kw in e:
            return hazard
    return None


def response_pattern(hazard: str) -> str:
    return RESPONSE_PATTERN.get(hazard, "routing")
