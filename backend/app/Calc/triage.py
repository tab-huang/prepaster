"""Time triage — maps alert fields to RUN / ACT / PREPARE."""
from __future__ import annotations


def compute_time_tier(situation: dict, hazard: str) -> tuple[str, str]:
    """Return (tier, reason). tier in {RUN, ACT, PREPARE}."""
    event = (situation.get("event") or "").lower()
    urgency = (situation.get("urgency") or "").lower()
    severity = (situation.get("severity") or "").lower()

    is_warning = "warning" in event
    is_watch = "watch" in event
    is_flash = "flash flood" in event

    if hazard == "earthquake":
        return ("RUN", "Earthquakes strike without warning — act now, then assess.")

    if hazard == "tornado" and (is_warning or urgency == "immediate"):
        return ("RUN", "A tornado is imminent — you may have only minutes to shelter.")

    if hazard == "flood" and urgency == "immediate" and (is_flash or severity == "extreme"):
        return ("RUN", "This is an immediate flash-flood threat — there may only be minutes.")

    if hazard == "wildfire" and urgency == "immediate" and severity in ("extreme", "severe"):
        return ("RUN", "Fire is an immediate threat here — leave now.")

    if urgency == "future" or is_watch:
        return ("PREPARE", "This is a watch / future threat — time to plan and gather supplies.")

    if urgency in ("immediate", "expected") or is_warning:
        return ("ACT", "There is a warning with some lead time — let's find your move.")

    return ("ACT", "Active alert — finding the safest action for your spot.")
