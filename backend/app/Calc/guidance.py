"""Hardcoded life-safety guidance per hazard (RUN tier + ultimate fallback)."""

RUN_GUIDANCE = {
    "flood": {
        "headline": "GO NOW — get to high ground",
        "lines": [
            "Flood warning. There may only be minutes. Do not wait.",
            "Move to the highest ground or highest floor you can reach now.",
            "Never walk, swim, or drive through floodwater — six inches knocks you "
            "down, one foot sweeps away a car.",
            "Do not go around barricades.",
            "If trapped, go to the highest point and call 911.",
        ],
    },
    "wildfire": {
        "headline": "LEAVE NOW — move away from the fire",
        "lines": [
            "Wildfire warning. Leave now, away from the smoke and flames.",
            "Move perpendicular to the wind, not downwind into the fire's path.",
            "If you must drive, keep windows up and vents closed.",
            "If trapped, call 911. Shelter in a cleared area or in a vehicle with "
            "vents closed, below the windows.",
            "Follow official evacuation routes and orders first.",
        ],
    },
    "tornado": {
        "headline": "TAKE COVER NOW — get low and interior",
        "lines": [
            "Tornado warning. Get to the lowest floor, most interior room, away "
            "from windows, now.",
            "Cover your head and neck.",
            "Do not try to outrun a tornado on foot.",
            "If you are in a vehicle or mobile home and a sturdy building is "
            "seconds away, go there.",
            "If caught outside with no shelter, lie flat in a low spot and cover "
            "your head.",
        ],
    },
    "earthquake": {
        "headline": "DROP, COVER, HOLD ON",
        "lines": [
            "Drop to your hands and knees.",
            "Take cover under sturdy furniture; protect your head and neck.",
            "Hold on until the shaking stops.",
            "Stay away from windows and anything that can fall.",
            "After shaking stops: check for gas and damage. If unsafe, move to "
            "open ground away from buildings and power lines. Expect aftershocks.",
        ],
    },
}


def run_guidance(hazard: str) -> dict:
    return RUN_GUIDANCE.get(hazard, RUN_GUIDANCE["flood"])
