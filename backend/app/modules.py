"""Stage 4 — the four hazard decision modules.

Each module gathers its hazard's data, computes a deterministic recommendation,
and returns a uniform envelope:

    {
      "pattern": "routing" | "shelter",
      "data": {...},          # hazard-specific, for the map + AI context
      "deterministic": {...}  # Recommendation-shaped dict (immediate + AI fallback)
    }

Flood and wildfire do real geo-computation (elevation / fire+wind vectors).
Tornado and earthquake are correct, time-aware shelter guidance + nearest-shelter
or open-space lookup — no faked computation where the right answer is "shelter".
"""
from __future__ import annotations

import asyncio
import math

from .APIs import elevation as elev_mod
from .APIs import firms, places, usgs, wind
from . import mock
from .Calc.geo import COMPASS, bearing_to_compass, haversine_m, offset_point
from .Calc.places import surroundings as _surroundings
from .hazards import response_pattern


def _fmt_distance(m: float) -> str:
    if m is None:
        return ""
    if m >= 1000:
        return f"about {m / 1000:.1f} km"
    return f"about {round(m / 50) * 50} m"


def _bearing_deg(lat1, lon1, lat2, lon2) -> float:
    dlat = lat2 - lat1
    dlon = (lon2 - lon1) * math.cos(math.radians(lat1))
    return (math.degrees(math.atan2(dlon, dlat)) + 360) % 360


def _ang_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def _compass_to_deg(name: str) -> float:
    for n, deg in COMPASS:
        if n == name:
            return deg
    return 0.0


def _official(situation) -> tuple[bool, str]:
    present = situation.officialEvacOrder
    text = (
        "Authorities may have issued evacuation instructions — follow official orders first."
        if present
        else ""
    )
    return present, text


_TIER_LABEL = {
    "RUN": "Immediate threat — act now",
    "ACT": "Limited time — act now",
    "PREPARE": "Future threat — prepare now",
}
_TIER_TIME = {
    "RUN": "Under 10 minutes — act immediately.",
    "ACT": "Under 1 hour — don't delay.",
    "PREPARE": "Under 6 hours — start preparing now.",
}


# --- French localization of the deterministic fallback ------------------------
# The deterministic plan is the always-present fallback when the AI call fails.
# It must therefore be available offline in French too (Canada is bilingual) —
# without depending on the AI that just failed. The English builder below is left
# exactly as-is; _plan_fr mirrors it in French and also returns a French
# headline_action so nothing the user sees leaks back to English.

_TIER_LABEL_FR = {
    "RUN": "Menace immédiate — agissez maintenant",
    "ACT": "Temps limité — agissez maintenant",
    "PREPARE": "Menace à venir — préparez-vous maintenant",
}
_TIER_TIME_FR = {
    "RUN": "Moins de 10 minutes — agissez immédiatement.",
    "ACT": "Moins d'une heure — ne tardez pas.",
    "PREPARE": "Moins de 6 heures — commencez à vous préparer maintenant.",
}
_DIR_FR = {"N": "N", "NE": "NE", "E": "E", "SE": "SE", "S": "S",
           "SW": "SO", "W": "O", "NW": "NO", "up": "vers le haut", "down": "vers le bas"}
_DIST_PHRASE_FR = {
    "wherever is closest": "là où c'est le plus proche",
    "as far as you safely can": "aussi loin que vous le pouvez en sécurité",
    "up": "vers le haut",
}


def _loc_dir(d: str | None, lang: str) -> str | None:
    if not d or lang != "fr":
        return d
    return _DIR_FR.get(d, d)


def _loc_distance(s: str | None, lang: str) -> str | None:
    """Localize a formatted distance string ('about 1.2 km' / 'about 350 m' / a phrase)."""
    if not s or lang != "fr":
        return s
    if s in _DIST_PHRASE_FR:
        return _DIST_PHRASE_FR[s]
    if s.startswith("about "):
        rest = s[6:]
        if "km" in rest:
            rest = rest.replace(".", ",")  # French decimal comma
        return "environ " + rest
    return s


def _headline_fr(hazard: str, det: dict) -> str:
    """A French headline_action built from the deterministic structured fields, so it
    never leaks the English module headline."""
    dest = det.get("destination_name")
    raw_dir = det.get("direction")
    direction = _loc_dir(raw_dir, "fr")
    distance = _loc_distance(det.get("distance"), "fr")
    has_dest = bool(dest and raw_dir and raw_dir not in ("up", "down"))
    if hazard == "flood":
        if has_dest:
            return f"Dirigez-vous vers le {direction} sur {distance} jusqu'à {dest}."
        return ("Éloignez-vous de l'eau vers un terrain ou un étage plus élevé maintenant. "
                "N'allez PAS dans un grenier fermé : l'eau qui monte pourrait vous y piéger.")
    if hazard == "wildfire":
        if has_dest:
            return f"Dirigez-vous vers le {direction} sur {distance} jusqu'à {dest}, loin du feu."
        return "Suivez les itinéraires d'évacuation officiels, loin de la fumée, maintenant."
    if hazard == "tornado":
        if has_dest:
            return (f"Rendez-vous à {dest} ({direction}, {distance}) puis gagnez sa pièce "
                    "intérieure la plus basse.")
        return ("Gagnez maintenant la pièce la plus basse, la plus intérieure et sans fenêtre. "
                "Protégez votre tête.")
    # earthquake
    return "Baissez-vous, abritez-vous sous un meuble solide et tenez bon jusqu'à la fin des secousses."


def _plan_fr(hazard: str, tier: str, resources, det: dict) -> tuple[dict, list[dict], str]:
    """French mirror of build_plan: returns (summary, steps, french_headline)."""
    pattern = response_pattern(hazard)
    at_home = getattr(resources, "atHome", True)
    slow = resources.hasSlowMovers
    has_supplies = resources.hasSupplies
    dest = det.get("destination_name")
    raw_dir = det.get("direction")
    direction = _loc_dir(raw_dir, "fr")
    distance = _loc_distance(det.get("distance"), "fr")
    headline = _headline_fr(hazard, det)
    steps: list[dict] = []

    if pattern == "routing":
        hazard_avoid = (
            "Ne marchez jamais et ne conduisez jamais dans une eau de crue qui bouge — quinze "
            "centimètres suffisent à vous faire perdre l'équilibre, trente centimètres emportent "
            "la plupart des voitures et soixante centimètres, les camions et VUS. Ne contournez "
            "pas les barricades."
            if hazard == "flood"
            else "Tenez-vous loin du feu et de la fumée dense. Ne roulez pas dans une fumée que "
            "vous ne pouvez pas traverser du regard. Gardez les fenêtres fermées et les évents "
            "coupés. Suivez les itinéraires d'évacuation officiels — n'improvisez pas votre route."
        )
        if tier == "PREPARE":
            what = ["Rassemblez l'essentiel et des provisions", "Préparez votre logement et vos proches",
                    f"Connaissez votre route — vers le {direction or 'la direction sûre'} jusqu'à {dest or 'un terrain plus élevé'}",
                    "Restez informé et partez dès qu'on vous le conseille"]
            if not has_supplies:
                steps.append({"title": "Rassemblez l'essentiel",
                              "detail": "Emportez de l'eau (environ 4 litres par personne et par jour "
                              "pendant 3 jours), des aliments non périssables, vos médicaments, votre "
                              "téléphone et son chargeur, vos pièces d'identité, de l'argent comptant, "
                              "une lampe de poche et une trousse de premiers soins."})
            else:
                steps.append({"title": "Complétez vos provisions",
                              "detail": "Vous avez indiqué avoir des provisions — vérifiez que l'eau, "
                              "les médicaments, le chargeur et les pièces d'identité sont prêts près de la porte."})
            steps.append({"title": "Préparez vos proches",
                          "detail": ("Rassemblez tout le monde et portez des chaussures solides. "
                                     + ("Prévoyez plus de temps et de l'aide pour quiconque ne peut pas se déplacer vite."
                                        if slow else "Décidez qui voyage avec qui."))})
            if at_home:
                steps.append({"title": "Protégez votre logement",
                              "detail": "Montez les objets de valeur à l'étage ; débranchez les petits "
                              "appareils (laissez le frigo/congélateur sauf si l'inondation est imminente) ; "
                              "ne coupez les services publics que si on vous le conseille. Ne touchez jamais "
                              "à l'électricité si vous êtes mouillé ou dans l'eau." if hazard == "flood"
                              else "Fermez toutes les fenêtres et portes en partant (cela freine les braises). "
                              "Éloignez les matières inflammables (bonbonnes de propane, tas de bois) de la "
                              "maison. Allumez les lumières extérieures pour que la maison reste visible dans la fumée."})
            steps.append({"title": "Fixez votre itinéraire", "detail": headline})
            steps.append({"title": "Restez informé et partez tôt",
                          "detail": "Gardez un téléphone ou une radio allumé pour les mises à jour officielles. "
                          "Partez dès qu'on vous le demande — n'attendez pas que les conditions empirent."})
        else:  # ACT
            what = ["Prenez l'essentiel rapidement", f"Dirigez-vous vers le {direction or 'maintenant'} jusqu'à {dest or 'un endroit sûr'}",
                    "Évitez les dangers en chemin", "Prévenez quelqu'un de votre plan"]
            steps.append({"title": "Prenez l'essentiel — vite",
                          "detail": "Téléphone et chargeur, eau, médicaments, pièces d'identité et clés. "
                          "N'y passez pas plus de quelques minutes."
                          if not has_supplies else "Prenez votre sac d'urgence et vos clés. Vous avez déjà des provisions."})
            go_detail = headline
            if hazard == "flood":
                go_detail += (" Si vous devez monter, gagnez l'ÉTAGE le plus haut — pas un grenier "
                              "fermé, où l'eau qui monte peut vous piéger.")
            steps.append({"title": "Partez maintenant", "detail": go_detail})
            steps.append({"title": "Évitez le danger", "detail": hazard_avoid})
            steps.append({"title": "Donnez de vos nouvelles",
                          "detail": "Dites à quelqu'un où vous allez et quand. "
                          + ("Gardez votre groupe ensemble." if slow else "")})
    else:  # shelter
        if hazard == "tornado":
            if tier == "PREPARE":
                what = ["Choisissez votre pièce sûre", "Garnissez-la du nécessaire", "Surveillez l'alerte"]
                steps = [
                    {"title": "Choisissez votre pièce sûre",
                     "detail": "L'étage le plus bas, la pièce la plus intérieure, sans fenêtre — un "
                     "sous-sol, une salle de bain ou un placard près du centre du bâtiment."},
                    {"title": "Garnissez-la",
                     "detail": "Apportez de l'eau, des chaussures solides, une lampe de poche, votre "
                     "téléphone et son chargeur, et de quoi protéger votre tête — un casque de vélo ou "
                     "de sport et des coussins ou un matelas."},
                    {"title": "Surveillez l'alerte",
                     "detail": "Gardez les alertes activées. Dès qu'une alerte de tornade est émise, gagnez "
                     "immédiatement votre pièce sûre — n'attendez pas de la voir."},
                ]
            else:
                what = ["Gagnez votre pièce sûre maintenant", "Protégez votre tête et votre nuque", "Restez à l'abri jusqu'à la fin"]
                steps = [
                    {"title": "Gagnez votre pièce sûre maintenant",
                     "detail": headline + " Ne vous abritez PAS sous un viaduc d'autoroute — le vent "
                     "s'y engouffre et accélère les débris volants (NWS)."},
                    {"title": "Protégez-vous",
                     "detail": "Dans la pièce sûre : mettez un casque si vous en avez un. Un matelas, des "
                     "coussins ou des couvertures protègent des débris qui tombent, en protection "
                     "d'appoint — mais seulement une fois au bon endroit intérieur. Ils ne remplacent "
                     "pas le fait de gagner la bonne pièce (NWS)."},
                    {"title": "Restez sur place", "detail": "Restez-y jusqu'à la levée de l'alerte — la "
                     "plupart des blessures touchent ceux qui sortent trop tôt."},
                ]
        else:  # earthquake
            what = ["Protégez-vous maintenant", "Après les secousses, cherchez les dangers", "Gagnez un terrain dégagé si c'est dangereux"]
            steps = [
                {"title": "Baissez-vous, abritez-vous, tenez bon",
                 "detail": headline + " S'il n'y a pas de meuble solide à proximité, couvrez votre tête "
                 "et votre nuque avec vos bras et pressez-vous contre un mur intérieur loin des fenêtres. "
                 "Ne vous tenez PAS dans une embrasure de porte — c'est un mythe ; vous êtes exposé à la "
                 "porte qui bat et aux débris (USGS)."},
                {"title": "Après les secousses : cherchez les dangers",
                 "detail": "Mettez d'abord des chaussures solides — le verre brisé est une cause majeure "
                 "de blessure. Cherchez les fuites de gaz : si vous sentez le gaz ou entendez un sifflement, "
                 "fermez la valve principale, sortez du bâtiment et ne la rouvrez pas vous-même — appelez "
                 "votre fournisseur de gaz. Cherchez le feu et les dommages structurels. N'utilisez aucune "
                 "flamme nue (allumettes, briquets) tant que les fuites ne sont pas écartées."},
                {"title": "Gagnez un terrain dégagé si c'est dangereux",
                 "detail": (f"Si le bâtiment est endommagé, gagnez un terrain dégagé — {dest} se trouve à "
                            f"{distance} {direction} — loin des bâtiments, des lignes électriques et des "
                            "lampadaires. N'utilisez pas les ascenseurs." if (dest and raw_dir)
                            else "Si le bâtiment est endommagé, gagnez un terrain dégagé loin des bâtiments, "
                            "des lignes électriques et des lampadaires. N'utilisez pas les ascenseurs.")},
                {"title": "Attendez-vous à des répliques",
                 "detail": "D'autres secousses sont probables. Restez loin des structures endommagées et "
                 "soyez prêt à vous baisser, vous abriter et tenir bon à chaque fois."},
            ]

    summary = {
        "tier_label": _TIER_LABEL_FR.get(tier, "Alerte active"),
        "time_estimate": _TIER_TIME_FR.get(tier, ""),
        "what_to_do": what,
    }
    return summary, steps, headline


def build_plan(hazard: str, tier: str, resources, det: dict, lang: str = "en") -> tuple[dict, list[dict], str | None]:
    """Deterministic slideshow plan: a summary + ordered, accomplishable steps.
    The AI refines this when available; this is the always-present fallback.

    Returns (summary, steps, french_headline). french_headline is non-None only for
    French, where the caller should also swap the English module headline for it."""
    if lang == "fr":
        return _plan_fr(hazard, tier, resources, det)
    pattern = response_pattern(hazard)
    mob = resources.mobility
    at_home = getattr(resources, "atHome", True)
    slow = resources.hasSlowMovers
    has_supplies = resources.hasSupplies
    dest = det.get("destination_name")
    direction = det.get("direction")
    distance = det.get("distance")
    move_line = (
        f"Head {direction} {distance} to {dest}." if (dest and direction) else det.get("headline_action", "")
    )
    supplies = det.get("supplies_enroute") or ""

    steps: list[dict] = []

    if pattern == "routing":
        hazard_avoid = (
            # NWS Turn Around Don't Drown® — 6 in of MOVING water knocks you down;
            # 1 ft carries away most cars; 2 ft carries away trucks and SUVs.
            "Never walk or drive through fast-moving floodwater — six inches can knock "
            "you off your feet; one foot can carry away most cars, and two feet can carry "
            "away trucks and SUVs. Don't go around barricades."
            if hazard == "flood"
            else "Keep away from the fire and heavy smoke. Don't drive into smoke you "
            "can't see through. Keep windows up and vents closed. Follow official "
            "evacuation routes — do not improvise your own path."
        )
        if tier == "PREPARE":
            what = ["Gather essentials and supplies", "Get your home and people ready",
                    f"Know your route — {direction or 'the safe direction'} to {dest or 'higher ground'}",
                    "Stay informed and leave the moment you're advised"]
            if not has_supplies:
                steps.append({"title": "Gather essentials",
                              "detail": "Pack water (1 gallon per person per day for 3 days), "
                              "non-perishable food, medications, phone and charger, IDs, cash, "
                              "a flashlight, and a first-aid kit."})
            else:
                steps.append({"title": "Top up your supplies",
                              "detail": "You said you have supplies — confirm water, medications, "
                              "phone charger, and IDs are packed and by the door."})
            steps.append({"title": "Ready your people",
                          "detail": ("Get everyone together and wear sturdy shoes. "
                                     + ("Plan extra time and help for anyone who can't move quickly."
                                        if slow else "Decide who rides with whom."))})
            if at_home:
                steps.append({"title": "Protect your home",
                              "detail": "Move valuables to a higher floor; unplug small electronics "
                              "(leave fridges/freezers unless flooding is imminent); shut off "
                              "utilities only if advised. Never touch electrical items if you're "
                              "wet or standing in water." if hazard == "flood"
                              else "Close all windows and doors as you leave (slows ember entry). "
                              "Move flammables (propane tanks, wood piles) away from the house. "
                              "Turn on outside lights so the house is visible in smoke."})
            steps.append({"title": "Lock in your route",
                          "detail": f"{move_line} {supplies}".strip()})
            steps.append({"title": "Stay informed and go early",
                          "detail": "Keep a phone or radio on for official updates. Leave as soon as "
                          "you're told to — don't wait for conditions to get worse."})
        else:  # ACT
            what = ["Grab essentials fast", f"Move {direction or 'now'} to {dest or 'safe ground'}",
                    "Avoid hazards on the way", "Tell someone your plan"]
            steps.append({"title": "Grab the essentials — fast",
                          "detail": "Phone and charger, water, medications, IDs, and keys. "
                          "Don't spend more than a couple of minutes."
                          if not has_supplies else "Grab your go-bag and keys. You already have supplies."})
            go_detail = f"{move_line} {supplies}".strip()
            if hazard == "flood":
                go_detail += (" If forced to go vertical, go to the highest FLOOR — "
                              "not a closed attic, where rising water can trap you.")
            steps.append({"title": "Go now", "detail": go_detail})
            steps.append({"title": "Avoid the hazard", "detail": hazard_avoid})
            steps.append({"title": "Check in",
                          "detail": "Tell someone where you're going and when. "
                          + ("Keep your group together." if slow else "")})
    else:  # shelter
        if hazard == "tornado":
            if tier == "PREPARE":
                what = ["Pick your safe room", "Stock it with what you'll need", "Watch for the warning"]
                steps = [
                    {"title": "Pick your safe room",
                     "detail": "Lowest floor, most interior room, no windows — a basement, "
                     "bathroom, or closet near the center of the building."},
                    {"title": "Stock it",
                     "detail": "Bring water, sturdy shoes, a flashlight, your phone and charger, and "
                     "something to cover your head — a bike/sports helmet and cushions or a mattress."},
                    {"title": "Watch for the warning",
                     "detail": "Keep alerts on. The moment a tornado warning is issued, go to your "
                     "safe room immediately — don't wait to see it."},
                ]
            else:
                what = ["Go to your safe room now", "Cover your head and neck", "Stay until it's clear"]
                steps = [
                    {"title": "Go to your safe room now",
                     "detail": det.get("headline_action", "")
                              + " Do NOT shelter under a highway overpass — wind tunnels "
                              "through them and accelerates flying debris (NWS)."},
                    {"title": "Cover up",
                     "detail": "Inside the safe room: put a helmet on if you have one. "
                               "A mattress, cushions, or blankets can protect against falling "
                               "debris as supplemental protection — but only once you are in the "
                               "correct interior location. They do not replace getting to the "
                               "right room (NWS)."},
                    {"title": "Stay put", "detail": "Remain there until the warning is lifted — most "
                     "injuries happen to people who come out too soon."},
                ]
        else:  # earthquake
            what = ["Protect yourself now", "After shaking, check for danger", "Move to open ground if unsafe"]
            steps = [
                {"title": "Drop, cover, and hold on",
                 "detail": det.get("headline_action", "")
                           + " If no sturdy furniture is nearby, cover your head and neck with your "
                           "arms and press against an interior wall away from windows. "
                           "Do NOT stand in a doorway — it is a myth that doorways are safer; "
                           "you are exposed to a swinging door and falling debris (USGS)."},
                {"title": "After shaking: check for danger",
                 "detail": "Put on sturdy shoes first — broken glass is a leading cause of injury. "
                           "Check for gas leaks: if you smell gas or hear hissing, shut off the main "
                           "valve, leave the building, and do not turn it back on yourself — call "
                           "your gas company. Check for fire and structural damage. "
                           "Do not use open flames (matches, lighters) until gas leaks are ruled out."},
                {"title": "Get to open ground if unsafe",
                 "detail": (f"If the building is damaged, move to open ground — {dest} is {distance} "
                            f"{direction} — away from buildings, power lines, and streetlights. "
                            "Do not use elevators." if dest
                            else "If the building is damaged, move to open ground away from buildings, "
                            "power lines, and streetlights. Do not use elevators.")},
                {"title": "Expect aftershocks",
                 "detail": "More shaking is likely. Stay away from damaged structures and be ready to "
                 "drop, cover, and hold again for each one."},
            ]

    summary = {
        "tier_label": _TIER_LABEL.get(tier, "Active alert"),
        "time_estimate": _TIER_TIME.get(tier, ""),
        "what_to_do": what,
    }
    return summary, steps, None


# --------------------------------------------------------------------------- #
# FLOOD — routing, go high
# --------------------------------------------------------------------------- #
async def _flood(req) -> dict:
    lat, lon = req.lat, req.lon
    elev = await elev_mod.elevation_api(lat, lon)
    base = elev.get("baseElevation")
    place_data = await places.places_api(lat, lon, req.resources.mobility, base)
    safe = place_data.get("safe", []) or []
    supplies = place_data.get("supplies", []) or []
    hgv = elev.get("highGroundVector")
    flat = elev.get("flat", False)
    official, official_text = _official(req.situation)

    supply_line = ""
    if supplies and not req.resources.hasSupplies:
        s = supplies[0]
        supply_line = f"A {s['kind']} ({s['name']}) is about {s['distance_m']} m to the {s['direction']}."

    # Prefer a safe building higher than (or level with) the user.
    chosen = next((p for p in safe if (p.get("gain_over_user") or 0) >= 0), None) or (safe[0] if safe else None)

    if chosen:
        gain = chosen.get("gain_over_user")
        height = f" ({gain:.0f} m above you)" if isinstance(gain, (int, float)) and gain > 0 else ""
        det = {
            "headline_action": f"Go {chosen['direction']} {_fmt_distance(chosen['distance_m'])} to {chosen['name']}.",
            "destination_name": chosen["name"],
            "direction": chosen["direction"],
            "distance": _fmt_distance(chosen["distance_m"]),
            "reason": f"It is a designated safe building{height} and the nearest good refuge.",
            "dest_lat": chosen["lat"],
            "dest_lon": chosen["lon"],
            "confidence": "medium",
        }
    elif flat:
        det = {
            "headline_action": "No high ground nearby — get to the highest FLOOR of a sturdy building. "
                               "Do NOT go into a closed attic; you can be trapped as water rises.",
            "destination_name": "Highest floor of a sturdy nearby building",
            "direction": "up",
            "distance": "wherever is closest",
            "reason": "The terrain is flat here, so go vertical (vertical evacuation). "
                      "Reach the highest floor but avoid closed attics — no escape route.",
            "dest_lat": None,
            "dest_lon": None,
            "confidence": "medium",
        }
    elif hgv:
        det = {
            "headline_action": f"Head {hgv['direction']} to higher ground, {_fmt_distance(hgv['distance_m'])}.",
            "destination_name": f"Higher ground to the {hgv['direction']}",
            "direction": hgv["direction"],
            "distance": _fmt_distance(hgv["distance_m"]),
            "reason": f"The ground rises about {hgv['gain_m']:.0f} m to the {hgv['direction']} — head that way and keep climbing.",
            "dest_lat": hgv["lat"],
            "dest_lon": hgv["lon"],
            "confidence": "medium",
        }
    else:
        det = {
            "headline_action": "Move away from water toward higher ground or higher floors now.",
            "destination_name": "The highest ground or floor you can reach",
            "direction": "up",
            "distance": "wherever is closest",
            "reason": "No high-confidence destination could be computed from the data.",
            "dest_lat": None,
            "dest_lon": None,
            "confidence": "low",
        }

    det.update(
        {
            "supplies_enroute": supply_line,
            "uncertainty_note": elev.get("resolution_note", ""),
            "official_order_present": official,
            "official_order_text": official_text,
            "responsePattern": "routing",
            "engine": "rule-based",
        }
    )
    return {"pattern": "routing", "data": {"elevation": elev, "places": place_data}, "deterministic": det}


# --------------------------------------------------------------------------- #
# WILDFIRE — routing, go away (wind-aware)
# --------------------------------------------------------------------------- #
async def _wildfire(req, demo: bool) -> dict:
    lat, lon = req.lat, req.lon
    w = await wind.wind_api(lat, lon)

    # Real fire detections (FIRMS) or seeded demo fires.
    fires_res = await firms.firms_api(lat, lon)
    fires = fires_res.get("fires", []) if fires_res.get("ok") else []
    fires_source = "FIRMS" if fires_res.get("ok") and fires else None
    if not fires and (demo or req.situation.source == "mock"):
        fires = mock.demo_fires(lat, lon)
        fires_source = "demo-seeded"

    place_data = await places.places_api(lat, lon, req.resources.mobility, None)
    safe = place_data.get("safe", []) or []
    official, official_text = _official(req.situation)

    escape = None  # {direction, lat, lon}
    fire_bearing = None
    if fires:
        # Centroid of the nearest few fires.
        near = fires[:5]
        clat = sum(f["lat"] for f in near) / len(near)
        clon = sum(f["lon"] for f in near) / len(near)
        fire_bearing = _bearing_deg(lat, lon, clat, clon)
        escape_deg = (fire_bearing + 180) % 360  # directly away from the fire
        # Nudge away from straight downwind of the fire if wind is known.
        ep = offset_point(lat, lon, escape_deg, 2000)
        escape = {
            "direction": bearing_to_compass(lat, lon, ep[0], ep[1]),
            "deg": escape_deg,
            "lat": ep[0],
            "lon": ep[1],
        }

    # Pick a safe building closest to the escape direction (and not toward the fire).
    chosen = None
    if escape and safe:
        scored = []
        for p in safe:
            b = _bearing_deg(lat, lon, p["lat"], p["lon"])
            toward_fire = fire_bearing is not None and _ang_diff(b, fire_bearing) < 60
            if toward_fire:
                continue
            scored.append((_ang_diff(b, escape["deg"]) + p["distance_m"] / 300.0, p))
        scored.sort(key=lambda t: t[0])
        chosen = scored[0][1] if scored else None

    wind_clause = ""
    if w.get("ok"):
        wind_clause = f" Wind is pushing the fire toward the {w['toward_compass']}."

    if escape and chosen:
        det = {
            "headline_action": f"Go {chosen['direction']} {_fmt_distance(chosen['distance_m'])} to {chosen['name']}, away from the fire.",
            "destination_name": chosen["name"],
            "direction": chosen["direction"],
            "distance": _fmt_distance(chosen["distance_m"]),
            "reason": f"It is away from the fire (which is to your {bearing_to_compass(lat, lon, *_fire_centroid(fires))}).{wind_clause}",
            "dest_lat": chosen["lat"],
            "dest_lon": chosen["lon"],
            "confidence": "medium",
        }
    elif escape:
        det = {
            "headline_action": f"Move {escape['direction']} now, away from the fire.",
            "destination_name": f"Open, cleared ground to the {escape['direction']}",
            "direction": escape["direction"],
            "distance": "as far as you safely can",
            "reason": f"The fire is to your {bearing_to_compass(lat, lon, *_fire_centroid(fires))}; head the opposite way.{wind_clause}",
            "dest_lat": escape["lat"],
            "dest_lon": escape["lon"],
            "confidence": "medium",
        }
    else:
        det = {
            "headline_action": "Follow official evacuation routes away from the smoke now.",
            "destination_name": None,
            "direction": None,
            "distance": None,
            "reason": "No active fire detections were available to compute a direction. "
            "Move away from smoke toward open, cleared ground or the coast, and follow official routes."
            + wind_clause,
            "dest_lat": None,
            "dest_lon": None,
            "confidence": "low",
        }

    det.update(
        {
            "supplies_enroute": None,
            "uncertainty_note": "Fire detections can lag real-time spread and wind can shift. "
            "Treat this as a direction to start moving, not a guarantee.",
            "official_order_present": official,
            "official_order_text": official_text,
            "responsePattern": "routing",
            "engine": "rule-based",
        }
    )
    return {
        "pattern": "routing",
        "data": {
            "fires": fires,
            "fires_source": fires_source,
            "wind": w,
            "places": place_data,
            "escapeVector": escape,
        },
        "deterministic": det,
    }


def _fire_centroid(fires: list[dict]) -> tuple[float, float]:
    near = fires[:5]
    return (sum(f["lat"] for f in near) / len(near), sum(f["lon"] for f in near) / len(near))


# --------------------------------------------------------------------------- #
# TORNADO — shelter, go low/interior now
# --------------------------------------------------------------------------- #
async def _tornado(req) -> dict:
    lat, lon = req.lat, req.lon
    official, official_text = _official(req.situation)
    on_vehicle = req.resources.mobility == "vehicle"

    # Search for sturdy buildings — vehicle gets the full 20 km radius, foot gets 1.5 km.
    # We then apply a distance cutoff: 800 m for vehicles (driveable), 300 m for foot (walkable).
    place_data = await places.places_api(lat, lon, req.resources.mobility, None)
    safe = place_data.get("safe", []) or []
    cutoff_m = 800 if on_vehicle else 300
    nearest_shelter = next((p for p in safe if p["distance_m"] <= cutoff_m), None)

    if nearest_shelter:
        if on_vehicle:
            action = (f"Drive to {nearest_shelter['name']} — "
                      f"{_fmt_distance(nearest_shelter['distance_m'])} {nearest_shelter['direction']} — "
                      "and go to its lowest interior room now.")
            reason = ("You're in a vehicle and a sturdy building is within driving distance — "
                      "a building is far safer than a car in a tornado. Get to its lowest, most interior room.")
        else:
            action = (f"Get inside {nearest_shelter['name']} now — "
                      f"{_fmt_distance(nearest_shelter['distance_m'])} {nearest_shelter['direction']} — "
                      "and go to its lowest interior room.")
            reason = ("A sturdy building is steps away — safer than sheltering in place. "
                      "Get to its lowest, most interior room.")
        det = {
            "headline_action": action,
            "destination_name": nearest_shelter["name"],
            "direction": nearest_shelter["direction"],
            "distance": _fmt_distance(nearest_shelter["distance_m"]),
            "reason": reason,
            "dest_lat": nearest_shelter["lat"],
            "dest_lon": nearest_shelter["lon"],
            "confidence": "medium",
        }
    else:
        det = {
            "headline_action": "Get to the lowest floor, most interior, windowless room now. Cover your head.",
            "destination_name": None,
            "direction": None,
            "distance": None,
            "reason": "A tornado's danger is flying debris. Put as many walls between you and the "
            "outside as possible, on the lowest floor. Do not try to outrun it on foot.",
            "dest_lat": None,
            "dest_lon": None,
            "confidence": "high",
        }

    det.update(
        {
            "supplies_enroute": None,
            "uncertainty_note": "If you are in a mobile home, leave it for a sturdy building or a "
            "low spot — mobile homes are unsafe in tornadoes.",
            "official_order_present": official,
            "official_order_text": official_text,
            "responsePattern": "shelter",
            "engine": "rule-based",
        }
    )
    return {
        "pattern": "shelter",
        "data": {"places": place_data, "nearestShelter": nearest_shelter},
        "deterministic": det,
    }


# --------------------------------------------------------------------------- #
# EARTHQUAKE — shelter, act in place
# --------------------------------------------------------------------------- #
async def _earthquake(req) -> dict:
    lat, lon = req.lat, req.lon
    official, official_text = _official(req.situation)

    quake = await usgs.usgs_api(lat, lon)
    open_radius = 20000 if req.resources.mobility == "vehicle" else 1500
    spaces_res = await places.open_spaces_api(lat, lon, radius=open_radius)
    spaces = spaces_res.get("open_spaces", []) if spaces_res.get("ok") else []
    nearest_open = spaces[0] if spaces else None

    quake_note = ""
    if quake.get("ok") and quake.get("found"):
        mag = quake.get("magnitude")
        quake_note = f" USGS shows a magnitude {mag} quake {quake.get('distance_km')} km away."

    post = "After shaking stops: check for gas leaks and structural damage. "
    if nearest_open:
        post += (
            f"If your building is unsafe, move to open ground — {nearest_open['name']} is "
            f"about {nearest_open['distance_m']} m to the {nearest_open['direction']} — away "
            "from buildings and power lines."
        )
    else:
        post += "If your building is unsafe, move to open ground away from buildings and power lines."

    det = {
        "headline_action": "Drop, cover under sturdy furniture, and hold on until the shaking stops.",
        "destination_name": nearest_open["name"] if nearest_open else None,
        "direction": nearest_open["direction"] if nearest_open else None,
        "distance": _fmt_distance(nearest_open["distance_m"]) if nearest_open else None,
        "reason": post + " Expect aftershocks." + quake_note,
        "dest_lat": nearest_open["lat"] if nearest_open else None,
        "dest_lon": nearest_open["lon"] if nearest_open else None,
        "supplies_enroute": None,
        "confidence": "high",
        "uncertainty_note": "Do not run outside during shaking — most injuries come from falling "
        "objects and debris near building exits.",
        "official_order_present": official,
        "official_order_text": official_text,
        "responsePattern": "shelter",
        "engine": "rule-based",
    }
    return {
        "pattern": "shelter",
        "data": {"quake": quake, "openSpaces": spaces},
        "deterministic": det,
    }


# --------------------------------------------------------------------------- #
# Dispatcher
# --------------------------------------------------------------------------- #
async def run_module(req, demo: bool) -> dict:
    hazard = req.hazardType
    # Describe what the user's coordinates sit on/in (house, forest, open terrain,
    # mountainside, near water). Runs alongside the hazard module so it overlaps
    # with that module's own geo lookups instead of adding latency. Best-effort.
    surroundings_task = asyncio.create_task(_surroundings(req.lat, req.lon))

    if hazard == "flood":
        result = await _flood(req)
    elif hazard == "wildfire":
        result = await _wildfire(req, demo)
    elif hazard == "tornado":
        result = await _tornado(req)
    elif hazard == "earthquake":
        result = await _earthquake(req)
    else:
        result = await _flood(req)
    result["pattern"] = response_pattern(hazard)

    # It ran concurrently with the hazard module above; give it at most a small
    # extra grace window so a slow/down Overpass can't stall the module response.
    try:
        surr = await asyncio.wait_for(surroundings_task, timeout=2.0)
    except (asyncio.TimeoutError, Exception):
        surroundings_task.cancel()
        surr = None
    if surr:
        result.setdefault("data", {})["surroundings"] = surr

    # Attach the deterministic slideshow plan (summary + steps).
    # Use the tier the user is actually on (it may be a demo override, e.g. a
    # PREPARE earthquake) so the deterministic fallback never contradicts the
    # AI plan or the UI badge. Recompute only if the client didn't send one.
    tier = getattr(req, "timeTier", None)
    if not tier:
        from .Calc.triage import compute_time_tier
        tier, _ = compute_time_tier(req.situation.model_dump(), hazard)
    lang = getattr(req, "language", "en")
    det = result["deterministic"]
    summary, steps, fr_headline = build_plan(hazard, tier, req.resources, det, lang)
    det["summary"] = summary
    det["steps"] = steps
    # For French, swap the English module headline + display direction/distance for the
    # localized versions so the deterministic fallback is fully French (no English leak).
    if lang == "fr":
        if fr_headline:
            det["headline_action"] = fr_headline
        det["direction"] = _loc_dir(det.get("direction"), "fr")
        det["distance"] = _loc_distance(det.get("distance"), "fr")
    return result
