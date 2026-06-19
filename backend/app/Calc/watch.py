"""Alert-state watching — compare the alert a user is viewing against the live one.

While a plan is open the client re-checks the alert (`POST /api/alert/status`).
This pure function decides what changed so the UI can react: the warning was
upgraded ("move now"), downgraded, cleared, or its window expired. When the acute
threat is over (cleared / expired) it flags `recoverSuggested` so the Respond flow
can hand off into Recover instead of dead-ending — the danger passing becomes the
bridge between the two acts rather than a seam the user has to discover.
"""
from __future__ import annotations

_SEVERITY_RANK = {"extreme": 4, "severe": 3, "moderate": 2, "minor": 1, "unknown": 0}


def severity_rank(severity: str | None) -> int:
    return _SEVERITY_RANK.get((severity or "").strip().lower(), 0)


def evaluate(
    prior: dict | None,
    current: dict | None,
    *,
    expired: bool,
    rechecked: bool,
) -> dict:
    """Compare the viewed alert (`prior`) with a freshly fetched one (`current`).

    `expired`   — prior alert's expiry has passed per the client clock.
    `rechecked` — a live re-fetch actually happened (False in demo mode, where
                  `current` is always None and only the expiry clock is known).

    Returns: {state, recoverSuggested, severityChange, message}. `state` is one of
    active | escalated | downgraded | changed | cleared | expired | unknown.
    """
    # No alert was being watched — nothing to compare.
    if not prior:
        return {
            "state": "unknown",
            "recoverSuggested": False,
            "severityChange": 0,
            "message": "No alert is being tracked.",
        }

    # Live re-check found nothing where there was an alert → the warning is gone.
    if rechecked and current is None:
        return {
            "state": "cleared",
            "recoverSuggested": True,
            "severityChange": -severity_rank(prior.get("severity")),
            "message": "The active warning for your location has cleared. The acute "
            "danger appears to have passed — when you're safe, move on to recovery.",
        }

    # Demo / no live re-check: fall back to the expiry clock.
    if not rechecked or current is None:
        if expired:
            return {
                "state": "expired",
                "recoverSuggested": True,
                "severityChange": 0,
                "message": "The warning window has passed. Verify conditions are "
                "actually safe, then move on to recovery when you're ready.",
            }
        return {
            "state": "active",
            "recoverSuggested": False,
            "severityChange": 0,
            "message": "The warning is still in effect. Keep following your plan.",
        }

    # Both present — compare severity and evacuation status.
    delta = severity_rank(current.get("severity")) - severity_rank(prior.get("severity"))
    newly_evac = bool(current.get("officialEvacOrder")) and not bool(prior.get("officialEvacOrder"))

    if newly_evac or delta > 0:
        return {
            "state": "escalated",
            "recoverSuggested": False,
            "severityChange": delta,
            "message": "This warning has been upgraded — conditions are getting worse. "
            "Act now and don't wait for your next plan step.",
        }
    if delta < 0:
        return {
            "state": "downgraded",
            "recoverSuggested": False,
            "severityChange": delta,
            "message": "The warning has been downgraded, but it is still in effect. "
            "Stay cautious and keep monitoring.",
        }
    if (current.get("event") or "") != (prior.get("event") or ""):
        return {
            "state": "changed",
            "recoverSuggested": False,
            "severityChange": 0,
            "message": "The active alert for your location has changed. Review the "
            "updated details.",
        }
    return {
        "state": "active",
        "recoverSuggested": False,
        "severityChange": 0,
        "message": "The warning is still in effect. Keep following your plan.",
    }
