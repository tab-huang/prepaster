"""Stage 5 — AI synthesis into ONE instruction, with a deterministic fallback.

Exactly one model call via OpenRouter (OpenAI-compatible API). The Stage-4 module
already computed a deterministic recommendation (in moduleData['deterministic']);
the model's job is to refine it into one calm, plain-language action, choosing only
from the provided candidates. If the call fails, times out, or no key is
configured, we return the module's deterministic recommendation so the app never
hangs.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from .hazards import response_pattern
from .Calc.route import route_advisory
from . import recovery

log = logging.getLogger("crisis.ai")

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6")
# Screenshot reading uses the same model unless explicitly overridden.
VISION_MODEL = os.environ.get("OPENROUTER_VISION_MODEL", MODEL)

_OR_HEADERS = {
    "HTTP-Referer": "https://crisis-to-action.local",
    "X-Title": "Crisis-to-Action",
}

VISION_SYSTEM = (
    "You read a screenshot of an emergency or weather alert and extract structured "
    "fields. Output ONLY a JSON object, no prose, no code fences, with keys: "
    "event (string, e.g. 'Flash Flood Warning'), hazardType (one of: flood, wildfire, "
    "tornado, earthquake, other), severity (Extreme|Severe|Moderate|Minor|Unknown), "
    "urgency (Immediate|Expected|Future|Unknown), certainty (Observed|Likely|Possible|Unknown), "
    "description (string, summarize the alert text), instruction (string, any action text), "
    "officialEvacOrder (boolean — true if the text orders or urges evacuation). "
    "If the image is not an emergency alert, or the hazard is not one of the four supported "
    "types, set hazardType to 'other'. Map related events: any flood/flash-flood to 'flood'; "
    "fire/red-flag/wildfire to 'wildfire'; tornado to 'tornado'; earthquake/shaking to "
    "'earthquake'."
)


def _as_data_url(image: str) -> str:
    return image if image.startswith("data:") else f"data:image/png;base64,{image}"


def _parse_iso(ts: str | None) -> datetime | None:
    """Parse an ISO timestamp (tolerating a trailing 'Z') into an aware datetime."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _timing_context(now: str | None, expires: str | None) -> dict | None:
    """Build a small dict describing the current clock time and how long until the
    alert expires, so the model can reason about elapsed/remaining time rather than
    only a coarse tier label. Returns None if there's nothing useful to say."""
    now_dt = _parse_iso(now) or datetime.now(timezone.utc)
    out: dict = {"current_time_iso": now_dt.isoformat()}
    exp_dt = _parse_iso(expires)
    if exp_dt:
        out["expires_iso"] = exp_dt.isoformat()
        mins = (exp_dt - now_dt).total_seconds() / 60.0
        if mins >= 0:
            out["minutes_until_expiry"] = round(mins)
            out["status"] = "active"
        else:
            out["minutes_since_expiry"] = round(-mins)
            out["status"] = "expired"
    return out


async def analyze_screenshot(image: str, lat: float, lon: float) -> dict | None:
    """Vision-parse a user's alert screenshot into a Situation dict. Returns None if
    no key is configured or the call fails; returns a dict whose hazardType may be
    'other' if the image isn't a supported hazard."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return None
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
        resp = await client.chat.completions.create(
            model=VISION_MODEL,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": VISION_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the alert fields from this screenshot."},
                        {"type": "image_url", "image_url": {"url": _as_data_url(image)}},
                    ],
                },
            ],
            extra_headers=_OR_HEADERS,
        )
        data = _extract_json(resp.choices[0].message.content or "")
        if not data or "hazardType" not in data:
            return None
        return {
            "event": data.get("event") or "Alert",
            "hazardType": data.get("hazardType"),
            "severity": data.get("severity") or "Unknown",
            "urgency": data.get("urgency") or "Unknown",
            "certainty": data.get("certainty") or "Unknown",
            "onset": None,
            "expires": None,
            "headline": data.get("event"),
            "description": data.get("description") or "",
            "instruction": data.get("instruction") or "",
            "officialEvacOrder": bool(data.get("officialEvacOrder")),
            "areaPolygon": None,
            "source": "live",
        }
    except Exception:
        return None

OCR_SYSTEM = (
    "You transcribe text from a photo of a document (an insurance letter, FEMA/aid notice, or claim "
    "decision). Output ONLY the document's text as plain text — no commentary, no summary, no markdown. "
    "Preserve dates, amounts, names, and any deadline wording exactly as written. If the image has no "
    "readable document text, output an empty string."
)


async def ocr_document_text(images: list[str]) -> str:
    """Transcribe an uploaded letter photo into plain text so the deterministic
    extractor can run on it. Returns '' if no key, no images, or the call fails."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key or not images:
        return ""
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
        content: list[dict] = [{"type": "text", "text": "Transcribe the document text from these image(s)."}]
        for img in images[:4]:
            content.append({"type": "image_url", "image_url": {"url": _as_data_url(img)}})
        resp = await client.chat.completions.create(
            model=VISION_MODEL,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": OCR_SYSTEM},
                {"role": "user", "content": content},
            ],
            extra_headers=_OR_HEADERS,
        )
        choices = getattr(resp, "choices", None) or []
        text = (choices[0].message.content if choices else None) or ""
        return text.strip()[:8000]
    except Exception as exc:
        log.warning("ocr_document_text failed: %s", exc)
        return ""


SYSTEM = (
    "You are a disaster-response assistant grounded in authoritative public-safety guidance. "
    "Output ONLY a valid JSON object, no prose outside it, no code fences. "
    "Keys: headline_action (string), destination_name (string or null), direction (string or null), "
    "distance (string or null), reason (string), supplies_enroute (string or null), "
    "confidence (high|medium|low), uncertainty_note (string), official_order_present (boolean), "
    "official_order_text (string), why (array of 5-10 short bullet strings, each ≤16 words, plain "
    "language, walking through HOW you reached this plan in order — the key facts you weighed, the "
    "hazard/tier logic, the trade-offs, and why this destination/action over alternatives — so the "
    "reader can follow your reasoning and sanity-check it against their own situation; no jargon, "
    "do not just restate the steps).\n\n"
    "Core rules:\n"
    "- Pick a destination only from the provided candidates; never invent a place.\n"
    "- ROUTING (flood, wildfire): give destination/direction/distance; never send user to lower ground "
    "(flood) or toward the fire (wildfire). Follow official evacuation routes — do NOT give a "
    "'move perpendicular to wind' or improvised directional escape rule to civilians.\n"
    "- SHELTER (tornado, earthquake): destination/direction/distance = null; put the action in "
    "headline_action, unless a specific nearby shelter or open space is a candidate.\n"
    "- Keep language calm, short, and plain. The reader is frightened.\n"
    "- If an official evacuation order is present, lead with it; your suggestion is secondary.\n"
    "- Official instructions and on-scene responders (police, firefighters, emergency crews) ALWAYS "
    "override this plan. If anything you say is contradicted by an official order or by personnel on "
    "the ground, the user must follow the officials — they can see the situation and have the final "
    "say. Make this deference explicit where it's relevant.\n\n"
    "CRITICAL tier rule: For PREPARE tier (time_available = 'under 6 hours'), the hazard is NOT "
    "happening right now. Steps must be preparatory actions (gather, check, plan, monitor). "
    "NEVER use words like 'hide', 'take cover', 'shelter now', or 'get to safety' as an immediate "
    "imperative in a PREPARE-tier plan — those phrases belong only in ACT or RUN tiers. "
    "Any shelter/cover action in a PREPARE plan must include an explicit 'if/when' trigger "
    "('IF a warning is issued', 'WHEN you hear sirens', 'IF shaking starts') so the user knows "
    "it is a contingency, not something to do right now.\n\n"
    "DURATION / SUPPLIES rule: Judge how long the hazard is likely to disrupt normal life "
    "(power, water, roads, stores, return home) from the alert description, expected timing, and "
    "hazard type — not just how soon it arrives. Wildfires, major floods, and large storms can "
    "keep people sheltering or displaced for many hours to several days; most earthquakes' acute "
    "shaking is brief but aftershocks and outages can last days. When the disruption is likely to "
    "be PROLONGED (roughly a day or more, or any evacuation/displacement), AND the person still "
    "has time before the hazard reaches them, explicitly tell them to gather enough supplies to "
    "last that period: name concrete quantities (e.g. 'about 1 gallon of water per person per "
    "day for 3 days', several days of non-perishable food, medications, phone battery/power "
    "bank, cash, important documents, supplies for children/pets) scaled to the expected "
    "duration. Tailor this to what they already report having in 'resources' — only have them "
    "gather what they are missing. BUT if the hazard is IMMINENT (RUN/ACT tier, or it is "
    "arriving within minutes), do NOT send them to stock up — life-safety action comes first, "
    "and they should only grab a pre-packed go-bag or whatever is within arm's reach on the way "
    "out. Never delay an evacuation or sheltering to gather supplies.\n\n"
    "VULNERABILITY rule: the 'resources' object describes who is acting. Adapt the plan to it, do not "
    "give a one-size-fits-all answer. If mobilityLimited is true (wheelchair, frail, cannot move "
    "quickly), allow MORE lead time, prefer the closest viable safety, name accessible routes/entrances, "
    "and tell them to call for help EARLY (911 / a neighbor) rather than waiting. If medicalNeeds is true "
    "(oxygen, dialysis, refrigerated medication, powered devices), tell them to take medication and "
    "essential equipment, plan for power loss (backup batteries, where to recharge, a hospital/shelter "
    "with power), and not to return for supplies once moving. If dependents is true (children, elderly, "
    "pets), include bringing them and their essentials and never leaving them behind. For mobility: if "
    "hasVehicle is false and the hazard is a ROUTING one (flood/wildfire), do NOT assume they can drive — "
    "give walking-distance options, transit, or calling for a ride/official evacuation assistance, and "
    "factor the slower pace into timing. Keep all of this calm and concrete, woven into the relevant "
    "steps rather than as a separate disclaimer.\n\n"
    "ALL-CLEAR / WAITING realism: Do NOT confuse the acute-danger window (how long the person "
    "must take protective action) with the alert's official expiry time (which can be days "
    "out). The immediate danger for most hazards passes far sooner than the warning expires: "
    "tornado shaking/winds pass in minutes; earthquake shaking is seconds with aftershocks "
    "following; a wildfire front or flash-flood surge moves through a given spot in minutes to "
    "a few hours. Never instruct someone to physically remain in a TEMPORARY refuge — a "
    "school, hallway, interior room, a store, a stranger's building, the spot they fled to — "
    "for many hours or days just because the warning runs that long. A 'wait for the all-clear' "
    "or 'stay put' step's time_estimate must reflect how long that protective posture is "
    "realistically needed (e.g. 'a few minutes', '30–60 min'), NOT the warning's full duration, "
    "and must never be a vague 'hours' or 'days'. Once the acute threat has passed locally, the "
    "right guidance is to MOVE ON appropriately — return home if it is safe, or relocate to an "
    "official shelter / with family for a prolonged event — and to keep monitoring official "
    "channels, rather than sitting in place until the warning expires. Only advise staying put "
    "for an extended period when conditions genuinely require it (e.g. active evacuation order "
    "with roads still impassable, ongoing fire encroachment) — and say WHY.\n\n"
    "Expert guidance constraints (FEMA / NWS / USGS / NFPA / Ready.gov / Red Cross):\n"
    "FLOOD: floodwater depth figures apply to FAST-MOVING water. 1 ft carries most cars; 2 ft "
    "carries trucks/SUVs (NWS TADD). If vertical evacuation: highest FLOOR only — not a closed attic "
    "(Ready.gov). Never touch electrical items if wet.\n"
    "WILDFIRE: follow official designated routes only. If trapped in a vehicle: park on pavement "
    "away from vegetation, engine OFF, close all vents, stay below window level, headlights and "
    "hazard flashers ON, call 911 (Ready.gov/Cal Fire). Do not re-enter until officials clear it.\n"
    "TORNADO: lowest floor + most interior room + away from windows is safest (Ready.gov/NWS). "
    "Mattress/cushions = supplemental protection INSIDE correct shelter, not standalone strategy (NWS). "
    "NEVER suggest sheltering under a highway overpass — lethal (NWS). 'Lie in a ditch' is a "
    "LAST RESORT only with serious debris risk — label it explicitly as dangerous if mentioned.\n"
    "EARTHQUAKE: Drop, Cover under sturdy furniture, Hold On — confirmed by USGS/Ready.gov. "
    "If no furniture: cover head/neck with arms, press against interior wall away from windows. "
    "Do NOT suggest standing in a doorway — this is a debunked myth (USGS). "
    "Gas shutoff: only if smell/hissing detected; gas company must restore it (USGS/FEMA). "
    "Do not run outside during shaking — most injuries happen then (Ready.gov).\n\n"
    "Use the alert object's 'description' for hazard-specific detail (named rivers, expected "
    "crest, affected streets, shelters) — make the plan reference these specifics rather than "
    "staying generic. If a 'timing' object is present, use it to ground summary.time_estimate in "
    "real clock time: 'minutes_until_expiry' is how long the warning still has to run from the "
    "current time ('current_time_iso'), and 'expires_iso' is the exact end time. Say something "
    "concrete like 'the warning is in effect until ~9:45 PM, about 40 minutes from now' instead of only "
    "repeating the tier label. If timing.status is 'expired', acknowledge the warning window has "
    "passed and focus on verifying current conditions before acting. For earthquake context, if "
    "an 'earthquake' object with magnitude/distance is present, reference it.\n"
    "CRITICAL — be explicit about WHICH clock any time figure refers to, and never state a bare "
    "duration like 'under 1 hour' on its own. There are two distinct meanings and you must name "
    "the one you mean every time:\n"
    "  (a) LEAD TIME — how long until the hazard is expected to reach the person / how much time "
    "they have to act before impact (this is what 'time_available' and the tier label mean — e.g. "
    "ACT = the hazard could affect them within the hour). Phrase as 'you likely have up to ~1 hour "
    "before [the flood waters reach you / conditions become dangerous] — act now'.\n"
    "  (b) WARNING DURATION — when the official warning expires ('minutes_until_expiry' / "
    "'expires_iso'). This is how long the alert stays in effect, NOT a countdown to impact and NOT "
    "a guarantee the danger ends then. Phrase as 'the warning is in effect until ~9:45 PM'.\n"
    "Do not conflate the two: the warning expiring does NOT mean the hazard has passed, and the "
    "lead time is not the same as the warning's end time. Whenever you give a time in "
    "summary.time_estimate or a step, attach what it counts down to (e.g. 'until impact', 'to act', "
    "'until the warning expires') so the reader is never left guessing.\n"
    "If the context includes a route_advisory (and per-candidate "
    "'path_crosses_warned_area' flags), use it for ROUTING hazards: do NOT send the person to a "
    "destination whose path crosses the warned area just because it is nearest — prefer a "
    "destination with a clear path, or tell them to follow official evacuation routes around the "
    "hazard even if it is farther. Never route through the warned polygon to save distance.\n"
    "If the context includes a user_note (something that changed or a concern), address it "
    "directly and adjust the plan accordingly.\n"
    "If the context includes local_news (recent news articles about the event), use them to "
    "make the plan more specific — reference local road closures, open shelters, or hazard "
    "details mentioned in the articles when they are relevant to the person's situation.\n"
    "If the context includes gov_guidance (official emergency management guidance retrieved "
    "from government sources), use it to ground specific safety details — prefer its exact "
    "wording for critical actions (e.g. depth thresholds, shelter rules, drop-cover-hold "
    "sequence) and do not contradict it.\n"
    "If the context includes location_context (a best-effort read of what the person's "
    "coordinates sit on/in — e.g. a residential building, a commercial building, forest, "
    "open fields, mountainous terrain, or near water — with an 'indoors_likely' flag), use it "
    "to tailor the plan, but treat it as a hint, not certainty: if they are likely already "
    "inside a sturdy building during a tornado/earthquake, keep them there in the safest spot "
    "rather than sending them outside; if they are in open or exposed terrain with no shelter, "
    "prioritize reaching substantial shelter; if they are on/near water or low ground during a "
    "flood, treat that as elevated risk. Never assert more about their surroundings than this "
    "field states, and never override an official evacuation order because of it.\n\n"
    "Also return a slideshow plan at the TOP LEVEL of the JSON (keys 'summary' and 'steps' — "
    "NOT nested inside a 'slideshow_plan' wrapper):\n"
    "- summary: object with tier_label (short threat+timing label), time_estimate (how much "
    "time they likely have BEFORE the hazard reaches them / how long they have to act — this is "
    "lead time to impact, not the warning's expiry; if you also mention when the warning ends, "
    "label it clearly as the warning duration), what_to_do (array of 3-4 short high-level bullets).\n"
    "- steps: Structure the plan into these 4 PHASES in order. Each phase becomes one or more steps "
    "(you decide how many steps each phase needs — fewer if straightforward, more if complex)."
    "Each step should have a few sentences (2-3)"
    "Do NOT collapse all phases into a single step.\n"
    "  PHASE 1 — PREPARATION (gather what you need): ONLY include this phase when the person has time "
    "— i.e. the hazard is NOT imminent (e.g. earthquake still 30+ min away, wildfire still multiple km "
    "away, flood rising but not yet at their location). Cover: what to grab, what to turn off, who to "
    "call, what to pack. Skip this phase entirely for ACT/RUN tiers where the hazard is happening NOW "
    "or within minutes — there is no time to prepare.\n"
    "TIMING PRINCIPLE — match the action to how much lead time is left, do not make people hide too "
    "early: if the hazard is still roughly an hour (or more) away, the person should be PREPARING and "
    "GATHERING — packing a go-bag, securing the home, charging devices, planning the route, staying "
    "informed — NOT sheltering, hiding, or taking cover yet. Sitting in a safe room with an hour to "
    "spare wastes time they should use to get ready. Reserve the actual shelter/hide/take-cover action "
    "for when the hazard is close — about the last 30 minutes before impact, or the moment conditions "
    "suddenly worsen or an official warning to take cover is issued. So with ~1 hour of lead time the "
    "plan leads with preparation and frames sheltering as a later conditional step; only inside that "
    "final ~30-minute window does sheltering become the immediate, primary action.\n"
    "  PHASE 2 — EVACUATION / BRACE: The active response. For ROUTING hazards (flood/wildfire): "
    "leave now, route to destination, hazard avoidance en route. For SHELTER hazards (tornado/earthquake) "
    "ACT/RUN tier: get to the safest spot immediately, drop/cover/hold or shelter actions. "
    "For SHELTER hazards PREPARE tier: steps must be about readiness ONLY — locate the safe room, "
    "clear the path, move supplies nearby, charge devices, review what to do IF it escalates. "
    "Do NOT tell the person to shelter, hide, or take cover yet. The shelter action is a CONDITIONAL "
    "step and must be phrased as: 'If a [hazard] warning is issued or conditions worsen suddenly, "
    "immediately move to [shelter location].' This conditional step can be the last step of Phase 2 "
    "or first step of Phase 3 — but it must always be framed as a future trigger, not a current action.\n"
    "  PHASE 3 — AT SHELTER / ARRIVAL: What to do once they have reached safety or the hazard has "
    "passed its peak. For ROUTING: what to do on arrival at the destination (check in, report, rest). "
    "For SHELTER: what to do while sheltering or immediately after shaking/wind stops (stay put, check "
    "for injury, do not go outside yet).\n"
    "  PHASE 4 — AFTER: Recovery and next steps once it is safe to move. Check for hazards (gas, "
    "structural damage, downed lines), stay informed, contact family, follow official re-entry guidance.\n"
    "Each step object must have: title (short imperative ≤8 words), "
    "detail (1-2 sentence plain summary), time_estimate (rough range e.g. '30 sec', "
    "'1-2 min', '5-10 min', '~15 min'), expanded_detail (array of 5-10 specific checklist "
    "items — concrete enough to follow without thinking; for supply steps list exact items by name; "
    "for navigation list specific actions; for shelter list the exact sequence; each item ≤20 words). "
    "Tailor to time tier and person's resources. If a user_note is present, incorporate it."
)

_REQUIRED_KEYS = {"headline_action", "reason", "confidence"} #Make the professional guidance fetching done with RAG


def _candidates(req, rag_context: str = "") -> dict:
    """Compact, named context for the model, drawn from the module's data."""
    module = req.moduleData or {}
    data = module.get("data", {}) or {}
    det = module.get("deterministic", {}) or {}
    _tier_labels = {"RUN": "under 10 minutes", "ACT": "under 1 hour", "PREPARE": "under 6 hours"}
    out = {
        "hazard": req.hazardType,
        "response_pattern": response_pattern(req.hazardType),
        "time_tier": req.timeTier,
        "time_available": _tier_labels.get(req.timeTier, req.timeTier),
        "user": {"in_alert_zone": req.situation.inZone, "accuracy_m": req.accuracy},
        "resources": req.resources.model_dump(),
        "alert": {
            "event": req.situation.event,
            "severity": req.situation.severity,
            "urgency": req.situation.urgency,
            "certainty": req.situation.certainty,
            "official_evac_order": req.situation.officialEvacOrder,
            # The description is the richest hazard-specific text (named rivers,
            # expected crest, affected neighborhoods, road closures) — give it to
            # the model so the plan can be specific, not generic.
            "description": (req.situation.description or "")[:1200],
            "instruction": (req.situation.instruction or "")[:600],
            # Actual timing window so the model can reference real times instead
            # of only the coarse tier label.
            "onset": req.situation.onset,
            "expires": req.situation.expires,
        },
        "computed_recommendation": det,
    }
    timing = _timing_context(getattr(req, "now", None), req.situation.expires)
    if timing:
        out["timing"] = timing
    if getattr(req, "runFollowOn", False):
        from .Calc.guidance import run_guidance
        out["immediate_actions_underway"] = run_guidance(req.hazardType).get("lines", [])
    if getattr(req, "userNote", ""):
        out["user_note"] = req.userNote
    if getattr(req, "newsContext", ""):
        out["local_news"] = req.newsContext
    if rag_context:
        out["gov_guidance"] = rag_context
    if "places" in data:
        safe_places = data["places"].get("safe", []) or []
        # Flag candidates whose straight-line path would cross the warned area so
        # the model can route around the hazard, not just toward the nearest exit.
        ring = req.situation.areaPolygon
        advisory = route_advisory(req.lat, req.lon, safe_places, ring)
        crossing = set(advisory.get("destinations_crossing_warned_area", []))
        out["candidate_safe_buildings"] = [
            {
                "name": p["name"],
                "kind": p["kind"],
                "direction": p["direction"],
                "distance_m": p["distance_m"],
                "elevation_gain_over_user_m": p.get("gain_over_user"),
                "path_crosses_warned_area": p["name"] in crossing,
            }
            for p in safe_places
        ]
        if advisory.get("warned_area_known"):
            out["route_advisory"] = advisory
        out["candidate_supplies"] = [
            {"name": p["name"], "kind": p["kind"], "direction": p["direction"], "distance_m": p["distance_m"]}
            for p in (data["places"].get("supplies", []) or [])
        ]
    if "elevation" in data:
        e = data["elevation"]
        out["elevation"] = {
            "base_m": e.get("baseElevation"),
            "flat": e.get("flat"),
            "high_ground_vector": e.get("highGroundVector"),
            "resolution_note": e.get("resolution_note"),
        }
    if data.get("surroundings"):
        out["location_context"] = data["surroundings"]
    if "wind" in data:
        out["wind"] = data["wind"]
    if "fires" in data:
        fires = data.get("fires") or []
        out["fire_count_nearby"] = len(fires)
        out["escape_vector"] = data.get("escapeVector")
        # How close is the nearest detection, so the model can convey proximity.
        nearest = min((f.get("distance_m") for f in fires if f.get("distance_m") is not None), default=None)
        if nearest is not None:
            out["nearest_fire_distance_m"] = round(nearest)
    if "quake" in data:
        q = data["quake"] or {}
        if q.get("ok") and q.get("found"):
            out["earthquake"] = {
                "magnitude": q.get("magnitude"),
                "distance_km": q.get("distance_km"),
            }
    if "openSpaces" in data:
        out["candidate_open_spaces"] = [
            {"name": s["name"], "kind": s["kind"], "direction": s["direction"], "distance_m": s["distance_m"]}
            for s in (data.get("openSpaces") or [])
        ]
    return out


def _coords_for_name(req, name: str):
    """Best-effort map a chosen destination_name back to lat/lon from candidates."""
    if not name:
        return None, None
    name_l = name.lower()
    data = req.moduleData.get("data", {}) or {}
    pools = []
    if "places" in data:
        pools += data["places"].get("safe", []) or []
    pools += data.get("openSpaces", []) or []
    for p in pools:
        if p["name"].lower() in name_l or name_l in p["name"].lower():
            return p["lat"], p["lon"]
    # Routing fallbacks: high-ground vector or escape vector by direction match.
    e = data.get("elevation", {}) or {}
    hgv = e.get("highGroundVector")
    if hgv and hgv["direction"].lower() in name_l:
        return hgv["lat"], hgv["lon"]
    ev = data.get("escapeVector")
    if ev and ev["direction"].lower() in name_l:
        return ev["lat"], ev["lon"]
    return None, None


def _extract_json(text: str) -> dict | None:
    """Defensive parse (spec §5): strip code fences, then locate the JSON object."""
    if not text:
        return None
    t = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    # Reasoning models sometimes wrap the object in prose — grab the first {...} block.
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(t[start : end + 1])
        except Exception:
            return None
    return None


FOLLOW_UP_STEP_SYSTEM = (
    "You are a disaster-response assistant adding one extra step to an existing emergency action plan. "
    "Output ONLY a valid JSON object with keys: "
    "title (short imperative ≤8 words), "
    "detail (1-2 sentence plain summary), "
    "time_estimate (rough range e.g. '2-3 min'), "
    "expanded_detail (array of 5-10 specific checklist items, each ≤20 words). "
    "Keep language calm and plain. Ground in official guidance (FEMA, Ready.gov, NWS, Red Cross). "
    "The step must directly address the user's request and fit naturally after the existing steps."
)

FOLLOW_UP_QA_SYSTEM = (
    "You are a disaster-response assistant answering a follow-up question about an active emergency. "
    "Be concise (2-5 sentences), calm, and plain. "
    "Ground your answer in official public-safety guidance (FEMA, Ready.gov, NWS, Red Cross). "
    "If the context includes Timing information, use it: when the user asks about time ('do I still "
    "have time?', 'is it too late?'), answer with the actual minutes remaining or elapsed rather than "
    "a vague reply, and adjust urgency accordingly. "
    "Output plain text only — no JSON, no markdown headers."
)


async def follow_up(req, rag_context: str = "") -> dict:
    """Generate a new plan step (instruction mode) or answer a question (question mode)."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        if req.mode == "instruction":
            return {"step": None, "error": "AI not configured"}
        return {"answer": "AI is not configured — cannot answer questions.", "error": "AI not configured"}

    context_lines = [
        f"Hazard: {req.hazardType}",
        f"Time available (tier): {req.timeTier}",
    ]
    timing = _timing_context(getattr(req, "now", None), getattr(req, "expires", None))
    if timing:
        if "minutes_until_expiry" in timing:
            context_lines.append(
                f"Timing: the alert runs until {timing['expires_iso']} — about "
                f"{timing['minutes_until_expiry']} minute(s) from now "
                f"(current time {timing['current_time_iso']}). Factor remaining time into your answer."
            )
        elif "minutes_since_expiry" in timing:
            context_lines.append(
                f"Timing: the alert window expired about {timing['minutes_since_expiry']} minute(s) ago "
                f"(current time {timing['current_time_iso']}). The official warning period has passed — "
                "advise verifying current conditions rather than assuming it is over."
            )
        else:
            context_lines.append(f"Current time: {timing['current_time_iso']}.")
    if getattr(req, "planAge", None):
        context_lines.append(f"This plan was generated {req.planAge}; some time has passed since then.")
    if req.headline_action:
        context_lines.append(f"Headline action: {req.headline_action}")
    if req.existing_steps:
        steps_text = "\n".join(
            f"  {i+1}. {s.get('title', '')} — {s.get('detail', '')}"
            for i, s in enumerate(req.existing_steps)
        )
        context_lines.append(f"Existing plan steps:\n{steps_text}")
    if rag_context:
        context_lines.append(
            "Official emergency-management guidance (ground your answer in this; "
            f"prefer its exact wording for critical safety details):\n{rag_context}"
        )
    context_str = "\n".join(context_lines)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)

        fr = getattr(req, "language", "en") == "fr"
        if req.mode == "instruction":
            user_msg = f"Context:\n{context_str}\n\nUser request: {req.message}\n\nGenerate one additional step."
            if fr:
                user_msg += (
                    " Write all human-readable text in the step (title, detail, every "
                    "expanded_detail item) in plain French; keep the JSON keys in English."
                )
            resp = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": FOLLOW_UP_STEP_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                extra_headers=_OR_HEADERS,
            )
            text = resp.choices[0].message.content or ""
            log.info("follow_up instruction raw: %s", text[:300])
            step = _extract_json(text)
            if not step or "title" not in step:
                return {"step": None, "error": "Could not parse a step from AI response"}
            step.setdefault("time_estimate", "")
            step.setdefault("expanded_detail", [])
            return {"step": step}
        else:
            user_msg = f"Context:\n{context_str}\n\nQuestion: {req.message}"
            if fr:
                user_msg += "\n\nAnswer entirely in plain French."
            resp = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": FOLLOW_UP_QA_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                extra_headers=_OR_HEADERS,
            )
            answer = (resp.choices[0].message.content or "").strip()
            log.info("follow_up question answer: %s", answer[:200])
            return {"answer": answer}
    except Exception as exc:
        log.exception("follow_up() raised: %s", exc)
        if req.mode == "instruction":
            return {"step": None, "error": str(exc)}
        return {"answer": "Sorry, something went wrong. Please try again.", "error": str(exc)}


RECOVERY_CLEANUP_SYSTEM = (
    "You are a post-disaster RECOVERY assistant. The acute emergency is OVER — the person is "
    "cleaning up and returning to a damaged home. This is NOT a life-safety/evacuation plan. "
    "Output ONLY a valid JSON object, no prose outside it, no code fences.\n\n"
    "CRITICAL FRAMING: the danger has ALREADY PASSED. headline_action MUST be a calm recovery / "
    "re-entry headline (e.g. 'Return safely and start your clean-up'). It must NEVER be an "
    "evacuation or life-safety imperative — never 'leave now', 'evacuate', 'flooding is imminent', "
    "'move to higher ground', 'take cover', or 'get to safety'. If the provided situation text or "
    "description sounds like an active alert (imminent danger, 'expected within the hour', etc.), "
    "treat it as the PAST event the person is recovering FROM, not a current threat. Every part of "
    "the plan — headline, summary, steps — must be about safe return and clean-up, not escaping.\n\n"
    "Top-level keys: headline_action (string), confidence (high|medium|low), why (array of 5-10 "
    "short bullet strings, each ≤16 words, plain language, walking through HOW you reached this "
    "clean-up plan in order — what you weighed about the damage, the hazard-specific risks, the "
    "sequencing, and any deadlines from an uploaded document — so the reader can follow the "
    "reasoning and sanity-check it; no jargon, do not just restate the steps), and a slideshow plan "
    "as 'summary' and 'steps' at the TOP LEVEL (NOT nested under 'slideshow_plan').\n"
    "- summary: object with tier_label (short label, e.g. 'Recovery — clean-up & re-entry'), "
    "time_estimate (a calm note on pacing), what_to_do (array of 3-4 short high-level bullets).\n"
    "- steps: array of 4–6 steps total covering these 4 PHASES in order. Aim for 4–6 steps across all phases — merge thin phases into one step and put all specifics in expanded_detail, not as extra steps.\n"
    "  PHASE 1 — BEFORE YOU GO BACK IN: is it safe to enter? structural soundness, gas leaks "
    "(smell/hissing → leave, call utility/911), electrical safety (do NOT restore power if water "
    "reached outlets/panel), downed lines, protective gear (N95, gloves, boots).\n"
    "  PHASE 2 — FIRST WALK-THROUGH / DOCUMENT: photograph and video ALL damage BEFORE moving or "
    "discarding anything, inventory damaged items (item/age/value), keep receipts, do not throw out "
    "major items until the insurance adjuster reviews them.\n"
    "  PHASE 3 — CLEAN UP: hazard-specific clean-up. Flood: remove water + soaked drywall/carpet, dry "
    "out fast (mold in 24-48h), disinfect, discard food/medicine that touched floodwater. Wildfire: NEVER "
    "dry-sweep ash (mist + scoop, HEPA vacuum, HVAC inspection). Tornado: debris/chainsaw/generator "
    "safety (never run a generator indoors — carbon monoxide). Earthquake: aftershocks, spilled chemicals, "
    "cabinets. Never run fuel generators indoors anywhere.\n"
    "  PHASE 4 — HEALTH, UTILITIES & NEXT STEPS: boil-water/do-not-drink notices, mold/air quality, wound "
    "care, restoring utilities via professionals, starting the insurance claim and FEMA/relief paperwork, "
    "keeping all receipts. IMPORTANT: this app has a built-in companion tool called the "
    "\"Insurance & aid paperwork\" assistant — when you mention insurance letters, FEMA/relief notices, "
    "claim denials, or recovery paperwork, explicitly tell the user they can open the \"Insurance & aid "
    "paperwork\" tool in this same app to paste that document and get its deadlines, required proof, "
    "and contacts pulled out. Refer to it by that exact name.\n"
    "Each step object: title (short imperative ≤8 words), detail (1-2 sentence plain summary), "
    "time_estimate (rough, e.g. 'before entry', '1-2 hours', 'days', 'ongoing'), expanded_detail "
    "(array of 6-12 concrete checklist items — this is where all the specific instructions go; each item ≤20 words).\n"
    "Ground specifics in the gov_guidance provided (CDC, Ready.gov, FEMA, EPA) — prefer its exact wording "
    "for safety thresholds and do not contradict it. Use the person's reported damage and description to "
    "tailor the plan. If photos are provided, use what they show to make the steps specific. Never tell "
    "someone a building is safe — defer structural/utility/coverage decisions to professionals. "
    "Official instructions and on-scene personnel (inspectors, fire/utility crews, officials) ALWAYS "
    "override this plan; if they contradict a step, the person must follow the officials — they have the "
    "final say. Make this deference explicit where relevant.\n\n"
    "UPLOADED DOCUMENT: if the context includes 'uploaded_document', the person attached a real insurance, "
    "FEMA, or aid letter that has already been analyzed for you. Weave its specifics into PHASE 4 (and an "
    "earlier phase if a deadline is imminent) instead of generic 'start your claim' advice: name the "
    "computed deadlines from deadline_details (use the exact normalized_deadline_date and urgency — do NOT "
    "recompute or invent dates), tell them to gather the exact required_documents listed, complete the "
    "action_steps, and reach out using contact_information. If a deadline is urgent, surface it prominently. "
    "Treat these as the authoritative specifics for this person's paperwork; never contradict or restate "
    "the dates differently."
)


async def synthesize_cleanup(req, rag_context: str = "", doc_analysis: dict | None = None) -> dict:
    """Recovery clean-up / re-entry plan in the Slideshow {summary, steps[]} shape.
    Falls back to the deterministic per-hazard plan if the AI is off or fails.

    If `doc_analysis` is provided (the deterministic extraction of an uploaded
    insurance/FEMA/aid document), its computed deadlines, required proof, and
    contacts are handed to the model so the paperwork phase cites the real
    specifics instead of generic 'start your claim' advice."""
    lang = getattr(req, "language", "en")
    fallback = recovery.cleanup_fallback(req.hazardType, lang)

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return fallback

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
        context = {
            "hazard": req.hazardType,
            "damage_categories": getattr(req, "damageCategories", []) or ["not specified"],
            "situation_description": (getattr(req, "situationText", "") or "")[:2000],
        }
        if doc_analysis:
            # Hand the model the already-extracted, already-computed specifics.
            context["uploaded_document"] = {
                "document_type": doc_analysis.get("document_type"),
                "issuing_organization": doc_analysis.get("issuing_organization"),
                "deadline_details": doc_analysis.get("deadline_details", []),
                "deadlines": doc_analysis.get("deadlines", []),
                "required_documents": doc_analysis.get("required_documents", []),
                "action_steps": doc_analysis.get("action_steps", []),
                "contact_information": doc_analysis.get("contact_information", []),
            }
        if rag_context:
            context["gov_guidance"] = rag_context

        lead = "Generate the recovery clean-up & re-entry plan for this person. "
        if lang == "fr":
            lead += (
                "IMPORTANT — LANGUE : rédige TOUTES les valeurs de texte lisibles en FRANÇAIS clair "
                "(headline_action, tout summary et tous les steps : titres, détails, time_estimate, "
                "chaque élément de expanded_detail). Garde les CLÉS JSON et les valeurs d'énumération "
                "(confidence: high/medium/low) en anglais. "
            )
        text_part = lead + "Respond with ONLY the JSON object. Context (JSON):\n" + json.dumps(context)

        content: list[dict] = [{"type": "text", "text": text_part}]
        for img in (getattr(req, "images", None) or [])[:4]:
            content.append({"type": "image_url", "image_url": {"url": _as_data_url(img)}})

        resp = await client.chat.completions.create(
            model=VISION_MODEL if content[1:] else MODEL,
            messages=[
                {"role": "system", "content": RECOVERY_CLEANUP_SYSTEM},
                {"role": "user", "content": content},
            ],
            extra_headers=_OR_HEADERS,
        )
        choices = getattr(resp, "choices", None) or []
        content = (choices[0].message.content if choices else None) or ""
        data = _extract_json(content)
        if not data or "headline_action" not in data:
            log.warning("cleanup synth: bad/empty JSON — using deterministic fallback")
            return fallback

        slideshow = data.get("slideshow_plan") or {}
        if isinstance(slideshow, dict):
            if not isinstance(data.get("summary"), dict) and isinstance(slideshow.get("summary"), dict):
                data["summary"] = slideshow["summary"]
            if not (isinstance(data.get("steps"), list) and data["steps"]) and isinstance(slideshow.get("steps"), list):
                data["steps"] = slideshow["steps"]

        if not isinstance(data.get("summary"), dict):
            data["summary"] = fallback["summary"]
        if not (isinstance(data.get("steps"), list) and data["steps"]):
            data["steps"] = fallback["steps"]
        data.setdefault("confidence", "medium")
        data["engine"] = "ai"
        why = data.get("why")
        data["why"] = [str(b).strip() for b in why if str(b).strip()] if isinstance(why, list) else []
        return data
    except Exception as exc:
        log.exception("synthesize_cleanup() failed — using fallback: %s", exc)
        return fallback


RECOVERY_STEP_SYSTEM = (
    "You are a post-disaster RECOVERY assistant adding ONE extra step to an existing clean-up / "
    "re-entry plan. The acute emergency is over. Output ONLY a valid JSON object with keys: "
    "title (short imperative ≤8 words), detail (1-2 sentence plain summary), time_estimate (rough, "
    "e.g. '15 min', 'a few hours'), expanded_detail (array of 4-8 concrete checklist items, each ≤20 words). "
    "Keep it calm and practical. Ground it in official recovery guidance (CDC, Ready.gov, FEMA, EPA) when "
    "the provided gov_guidance is relevant. Never tell someone a building is safe — defer structural, "
    "utility, and coverage decisions to professionals. If the request is about insurance, FEMA, or claim "
    "paperwork, point them to this app's \"Insurance & aid paperwork\" tool. The step must directly address "
    "the user's request and fit after the existing steps."
)

RECOVERY_QA_SYSTEM = (
    "You are a post-disaster RECOVERY assistant answering a follow-up question about cleaning up and "
    "returning home safely after a disaster. The acute emergency has passed. Be concise (2-5 sentences), "
    "calm, and plain. Ground your answer in official recovery guidance (CDC, Ready.gov, FEMA, EPA) when the "
    "provided guidance is relevant. Never declare a building safe or decide insurance coverage / aid "
    "eligibility — say who must confirm. If the question is about an insurance letter, FEMA notice, claim, "
    "or any recovery document, tell them this app has an \"Insurance & aid paperwork\" tool that extracts "
    "the deadlines, required proof, and contacts from a pasted document. Output plain text only — no JSON."
)


async def recovery_follow_up(req, rag_context: str = "") -> dict:
    """Follow-up for the recovery clean-up plan: add a step (instruction mode) or
    answer a question (question mode). Mirrors follow_up() but recovery-flavored."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        if req.mode == "instruction":
            return {"step": None, "error": "AI not configured"}
        return {"answer": "AI is not configured — cannot answer questions.", "error": "AI not configured"}

    lines = [f"Hazard (recovery context): {req.hazardType}"]
    if getattr(req, "headline_action", ""):
        lines.append(f"Plan headline: {req.headline_action}")
    if getattr(req, "existing_steps", None):
        steps_text = "\n".join(
            f"  {i+1}. {s.get('title', '')} — {s.get('detail', '')}"
            for i, s in enumerate(req.existing_steps)
        )
        lines.append(f"Existing clean-up steps:\n{steps_text}")
    if rag_context:
        lines.append(
            "Official recovery guidance (ground your answer in this; prefer its exact wording "
            f"for safety details):\n{rag_context}"
        )
    context_str = "\n".join(lines)
    fr = getattr(req, "language", "en") == "fr"

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)

        if req.mode == "instruction":
            user_msg = f"Context:\n{context_str}\n\nUser request: {req.message}\n\nGenerate one additional recovery step."
            if fr:
                user_msg += (
                    " Write all human-readable text in the step (title, detail, every expanded_detail "
                    "item) in plain French; keep the JSON keys in English."
                )
            resp = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": RECOVERY_STEP_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                extra_headers=_OR_HEADERS,
            )
            choices = getattr(resp, "choices", None) or []
            text = (choices[0].message.content if choices else None) or ""
            step = _extract_json(text)
            if not step or "title" not in step:
                return {"step": None, "error": "Could not parse a step from AI response"}
            step.setdefault("time_estimate", "")
            step.setdefault("expanded_detail", [])
            return {"step": step}
        else:
            user_msg = f"Context:\n{context_str}\n\nQuestion: {req.message}"
            if fr:
                user_msg += "\n\nAnswer entirely in plain French."
            resp = await client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": RECOVERY_QA_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                extra_headers=_OR_HEADERS,
            )
            choices = getattr(resp, "choices", None) or []
            answer = ((choices[0].message.content if choices else None) or "").strip()
            return {"answer": answer or "Sorry, couldn't get an answer."}
    except Exception as exc:
        log.exception("recovery_follow_up() raised: %s", exc)
        if req.mode == "instruction":
            return {"step": None, "error": str(exc)}
        return {"answer": "Sorry, something went wrong. Please try again.", "error": str(exc)}


PAPERWORK_SYSTEM = (
    "You are an after-disaster RECOVERY PAPERWORK assistant. The user pastes redacted recovery "
    "paperwork (insurance letter, FEMA notice, claim denial, utility/landlord notice, repair estimate). "
    "Use the disaster type only as context. Output ONLY a valid JSON object, no prose, no code fences.\n\n"
    "Keys: response_mode ('ai'), document_type, issuing_organization, plain_language_summary, "
    "deadlines (array), deadline_details (array), required_documents (array), action_steps (array), "
    "contact_information (array), appeal_or_dispute_steps (array), unclear_terms (array), "
    "missing_information (array), human_review_flags (array), follow_up_questions (array of 3).\n\n"
    "DEADLINES — extract structure, do NOT do the date arithmetic yourself. For each deadline in the "
    "text, add an object to 'deadline_details' with: action_required (short label, e.g. 'Appeal or "
    "request review', 'Submit sworn proof of loss'), original_sentence (the exact sentence), and "
    "whichever of these you can read from the text: trigger_date (ISO YYYY-MM-DD — the anchor like the "
    "letter/loss/denial date), offset_days (integer — e.g. 60 for 'within 60 days'), deadline_date (ISO "
    "YYYY-MM-DD if an explicit calendar date is given). Do NOT compute the final date or days-remaining — "
    "the system computes those from your trigger_date+offset_days (or deadline_date). The context includes "
    "'today' and a 'computed_deadlines' list the system already derived; use it to make "
    "plain_language_summary urgency-aware (e.g. 'your most urgent step is the appeal, due in 6 days'), but "
    "never restate a different date than the computed one.\n\n"
    "FORMAT: every array field EXCEPT deadline_details must be an array of plain STRINGS, not objects "
    "(e.g. contact_information: ['Example Mutual — 1-800-555-0142 — claims@example.com'], not a JSON "
    "object). deadline_details is the only array of objects.\n\n"
    "Rules: Do NOT invent deadlines, contacts, coverage, eligibility, legal conclusions, phone numbers, "
    "or addresses. If a field is absent in the text, say so clearly in plain language rather than guessing. "
    "Do NOT decide whether coverage applies, whether the person is eligible for aid, or give legal advice — "
    "flag where an insurer, agency, contractor, inspector, or legal aid must confirm. Explain confusing terms "
    "in plain English under unclear_terms."
)


async def analyze_paperwork(req, rag_context: str = "") -> dict:
    """Extract a structured analysis of recovery paperwork. Falls back to the
    deterministic regex extractor if the AI is off or fails. (Sensitive-data
    rejection happens in the endpoint, before this is called.)"""
    doc_text = (getattr(req, "documentText", "") or "").strip()
    insurer = getattr(req, "insurerName", "") or ""
    claim_status = getattr(req, "claimStatus", "") or ""
    disaster = getattr(req, "hazardType", "") or ""
    lang = getattr(req, "language", "en")
    # Anchor deadline-day math to the client's clock if supplied, else "now".
    as_of = (_parse_iso(getattr(req, "now", None)) or datetime.now(timezone.utc)).date()

    def _fallback() -> dict:
        if not doc_text:
            return {
                "response_mode": "mock",
                "document_type": "no document provided",
                "issuing_organization": "",
                "plain_language_summary": (
                    "Aucun texte de document n'a été fourni. Collez un extrait caviardé de votre "
                    "document de récupération pour en extraire les délais, les preuves et les étapes."
                    if lang == "fr" else
                    "No document text was provided. Paste a redacted excerpt of your recovery document "
                    "to extract deadlines, required proof, and next steps."
                ),
                "deadlines": [], "required_documents": [], "action_steps": [],
                "contact_information": [], "appeal_or_dispute_steps": [], "unclear_terms": [],
                "missing_information": [], "human_review_flags": recovery.human_review_required(lang)[:1],
                "follow_up_questions": [], "human_review_required": recovery.human_review_required(lang),
                "responsible_ai_note": recovery.responsible_ai_note(lang),
            }
        mock = recovery.paperwork_mock(doc_text, insurer, claim_status, disaster, as_of)
        # Keep the always-shown guardrail bilingual even on the deterministic path.
        mock["human_review_required"] = recovery.human_review_required(lang)
        mock["responsible_ai_note"] = recovery.responsible_ai_note(lang)
        return mock

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key or not doc_text:
        return _fallback()

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
        # Deterministic floor computed up-front: its already-computed deadlines are
        # handed to the model so its summary can speak to urgency ("the appeal is due
        # in 6 days"), while the dates themselves stay code-computed and trustworthy.
        base = recovery.paperwork_mock(doc_text, insurer, claim_status, disaster, as_of)
        context = {
            "disaster_type": req.hazardType,
            "insurance_company": insurer or "not provided",
            "claim_status": claim_status or "not provided",
            "damage_categories": getattr(req, "damageCategories", []) or ["not specified"],
            "today": as_of.isoformat(),
            "computed_deadlines": base.get("deadline_details", []),
            "document_text": doc_text[:150000],
        }
        lead = "Analyze the recovery document. Respond with ONLY the JSON object. "
        if lang == "fr":
            lead += (
                "IMPORTANT — LANGUE : rédige toutes les valeurs de texte lisibles en FRANÇAIS clair "
                "(plain_language_summary et chaque élément des tableaux). Garde les clés JSON en anglais. "
            )
        if rag_context:
            context["gov_guidance"] = rag_context
        user_msg = lead + "Context (JSON):\n" + json.dumps(context)

        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": PAPERWORK_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            extra_headers=_OR_HEADERS,
        )
        choices = getattr(resp, "choices", None) or []
        content = (choices[0].message.content if choices else None) or ""
        data = _extract_json(content)
        if not data or "document_type" not in data:
            return _fallback()

        # Deadline hybrid: the model EXTRACTS deadline structure, code COMPUTES the
        # math. Re-derive every date/days-remaining from the model's stated trigger +
        # offset (or stated date), then merge with the regex pass so we catch what
        # each missed. The displayed `deadlines` strings reflect the computed result.
        llm_deadlines = recovery.reconcile_deadlines(data.get("deadline_details"), as_of)
        merged = recovery.merge_deadlines(llm_deadlines, base.get("deadline_details", []))
        if merged:
            data["deadline_details"] = merged
            data["deadlines"] = recovery.format_deadline_summaries(merged)

        # Backfill anything else the model omitted from the deterministic extraction.
        for k, v in base.items():
            if k not in data or data.get(k) in (None, "", []):
                data[k] = v
        data["response_mode"] = "ai"
        data["human_review_required"] = recovery.human_review_required(lang)
        data["responsible_ai_note"] = recovery.responsible_ai_note(lang)
        return data
    except Exception as exc:
        log.exception("analyze_paperwork() failed — using fallback: %s", exc)
        return _fallback()


async def synthesize(req, rag_context: str = "") -> dict:
    """One OpenRouter call → strict JSON. Falls back to the deterministic result."""
    module = req.moduleData or {}
    fallback = dict(module.get("deterministic", {}) or {})
    fallback.setdefault("responsePattern", response_pattern(req.hazardType))
    fallback.setdefault("engine", "rule-based")

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return fallback

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)
        context = _candidates(req, rag_context=rag_context)
        if getattr(req, "runFollowOn", False):
            lead = (
                "The person is in a RUN-tier, life-threatening emergency and is ALREADY carrying "
                "out the immediate life-safety reflex listed in 'immediate_actions_underway' "
                "(e.g. moving to high ground / drop-cover-hold / fleeing). Assume those actions "
                "are underway or just completed — do NOT repeat them as the first step or the "
                "headline_action. Generate the plan for what they do NEXT: getting to and staying "
                "at real safety, then what to do once the immediate danger passes. Keep it calm "
                "and concrete for someone who is already moving. "
            )
        else:
            lead = "Refine the computed recommendation into ONE calm action for this person. "
        if getattr(req, "language", "en") == "fr":
            lead += (
                "IMPORTANT — LANGUAGE: write every human-readable string value in the JSON in "
                "FRENCH (clear, calm, plain Canadian French): headline_action, reason, "
                "uncertainty_note, official_order_text, and all of summary and steps (tier_label, "
                "time_estimate, what_to_do, every step title/detail/time_estimate and each "
                "expanded_detail item). Keep the JSON keys and the enum values (confidence: "
                "high/medium/low, responsePattern, direction compass words) in English. "
            )
        user_msg = (
            lead + "Respond with ONLY the JSON object. Context (JSON):\n" + json.dumps(context)
        )
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            extra_headers={
                "HTTP-Referer": "https://crisis-to-action.local",
                "X-Title": "Crisis-to-Action",
            },
        )
        text = resp.choices[0].message.content or ""
        log.info("=== RAW MODEL RESPONSE ===\n%s\n==========================", text)

        data = _extract_json(text)
        if not data:
            log.warning("JSON parse failed — falling back to deterministic. Raw text length: %d", len(text))
            return fallback
        if not _REQUIRED_KEYS.issubset(data):
            log.warning("Missing required keys %s — falling back. Keys present: %s",
                        _REQUIRED_KEYS - data.keys(), list(data.keys()))
            return fallback

        log.info("=== PARSED AI DATA (top-level keys) ===\n%s\n========================================",
                 json.dumps(list(data.keys()), indent=2))

        for k in ("supplies_enroute", "uncertainty_note", "official_order_text"):
            data.setdefault(k, "" if k != "supplies_enroute" else None)
        for k in ("destination_name", "direction", "distance"):
            data.setdefault(k, None)
        data.setdefault("official_order_present", req.situation.officialEvacOrder)
        data.setdefault("confidence", "medium")
        data["responsePattern"] = response_pattern(req.hazardType)

        # The model sometimes wraps the plan under a "slideshow_plan" key instead
        # of putting summary/steps at the top level — promote them if so.
        slideshow = data.get("slideshow_plan") or {}
        if isinstance(slideshow, dict):
            if not isinstance(data.get("summary"), dict) and isinstance(slideshow.get("summary"), dict):
                log.info("Promoting slideshow_plan.summary to top level")
                data["summary"] = slideshow["summary"]
            if not (isinstance(data.get("steps"), list) and data["steps"]) and isinstance(slideshow.get("steps"), list) and slideshow["steps"]:
                log.info("Promoting slideshow_plan.steps to top level (%d steps)", len(slideshow["steps"]))
                data["steps"] = slideshow["steps"]

        # Final fallback: use deterministic plan if AI still didn't produce one.
        if not isinstance(data.get("summary"), dict):
            log.warning("No summary from AI — using deterministic fallback summary")
            data["summary"] = fallback.get("summary")
        if not (isinstance(data.get("steps"), list) and data["steps"]):
            log.warning("No steps from AI — using deterministic fallback steps")
            data["steps"] = fallback.get("steps")

        log.info("=== FINAL PLAN: %d steps, summary tier=%s ===",
                 len(data.get("steps") or []),
                 (data.get("summary") or {}).get("tier_label", "?"))

        dlat, dlon = _coords_for_name(req, data.get("destination_name") or "")
        # If the AI named the same destination the module computed, reuse its coords.
        if dlat is None and fallback.get("destination_name") and data.get("destination_name") == fallback.get("destination_name"):
            dlat, dlon = fallback.get("dest_lat"), fallback.get("dest_lon")
        data["dest_lat"] = dlat
        data["dest_lon"] = dlon
        data["engine"] = "ai"
        # `why`: the model's own bullet-point reasoning. Keep only clean strings.
        why = data.get("why")
        data["why"] = [str(b).strip() for b in why if str(b).strip()] if isinstance(why, list) else []
        return data
    except Exception as exc:
        log.exception("synthesize() raised — falling back to deterministic. Error: %s", exc)
        return fallback
