"""Recovery-phase engines — the deterministic floor for the two "Recover" tools.

  1. cleanup_fallback()   — a hazard-keyed clean-up / re-entry plan in the SAME
                            {summary, steps[]} shape the Slideshow already renders,
                            used when the AI is off or fails.
  2. paperwork_mock()     — a regex extractor for redacted recovery paperwork
                            (insurance letters, FEMA notices, claim denials …),
                            used when the AI is off or fails. Ported/condensed
                            from the standalone recovery prototype.
  3. find_sensitive_data() — rejects SSNs / bank / policy / login data BEFORE any
                            analysis (privacy guardrail), used by both AI and mock.

These never call the network; ai.py layers an OpenRouter call on top and falls
back here, mirroring how synthesize() falls back to the Stage-4 deterministic plan.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

# ── Shared guardrail text ────────────────────────────────────────────────────

HUMAN_REVIEW_REQUIRED = [
    "An insurance adjuster or claims representative must confirm coverage, claim rules, and payment decisions.",
    "A FEMA, state, county, or local relief worker must confirm aid eligibility and application rules.",
    "A licensed contractor, utility company, or building inspector must confirm repair scope and structural safety.",
    "Legal aid or an attorney must review appeal rights, denial disputes, or legal deadlines.",
]

RESPONSIBLE_AI_NOTE = (
    "This tool explains recovery paperwork and builds checklists in plain language. It does not "
    "decide insurance coverage, aid eligibility, legal rights, or building safety — confirm those "
    "with the insurer, agency, contractor, inspector, or legal aid named in your document."
)

# French equivalents — used when language == "fr" so the whole analysis is bilingual,
# matching the Respond flow (which renders fully in French).
HUMAN_REVIEW_REQUIRED_FR = [
    "Un expert en sinistres ou un représentant des réclamations doit confirmer la couverture, les règles de réclamation et les décisions de paiement.",
    "Un agent de la FEMA, de l'État, du comté ou de l'aide locale doit confirmer l'admissibilité à l'aide et les règles de demande.",
    "Un entrepreneur agréé, une compagnie de services publics ou un inspecteur en bâtiment doit confirmer l'étendue des réparations et la sécurité structurelle.",
    "Une aide juridique ou un avocat doit examiner les droits d'appel, les contestations de refus ou les délais légaux.",
]

RESPONSIBLE_AI_NOTE_FR = (
    "Cet outil explique la paperasse de récupération et crée des listes de vérification en langage clair. "
    "Il ne décide pas de la couverture d'assurance, de l'admissibilité à l'aide, des droits juridiques ni de "
    "la sécurité du bâtiment — confirmez-les auprès de l'assureur, de l'organisme, de l'entrepreneur, de "
    "l'inspecteur ou de l'aide juridique nommé dans votre document."
)


def human_review_required(lang: str = "en") -> list[str]:
    return HUMAN_REVIEW_REQUIRED_FR if lang == "fr" else HUMAN_REVIEW_REQUIRED


def responsible_ai_note(lang: str = "en") -> str:
    return RESPONSIBLE_AI_NOTE_FR if lang == "fr" else RESPONSIBLE_AI_NOTE

NO_DEADLINE_MSG = "No exact deadline was found in the provided text."
NO_DOCS_MSG = "No required documents were found in the provided text."
NO_CONTACT_MSG = "No contact information was found in the provided text."
UNKNOWN_DEADLINE_TRIGGER_MSG = "Cannot compute the exact deadline because the trigger date is missing."


# ─────────────────────────────────────────────────────────────────────────────
# 1. Clean-up / re-entry plan (deterministic fallback)
# ─────────────────────────────────────────────────────────────────────────────

# Each hazard gets a 4-phase plan: (1) before you go back in, (2) first walk-through,
# (3) clean-up, (4) health/records/next steps — mirroring the response flow's phases.
_CLEANUP: dict[str, dict] = {
    "flood": {
        "headline": "Make your flooded home safe before you clean up",
        "what": [
            "Do not enter until utilities are confirmed safe and the structure is sound",
            "Assume floodwater and anything it touched is contaminated",
            "Photograph all damage before you move or throw anything away",
            "Dry the building out fast — mold starts within 24–48 hours",
        ],
        "steps": [
            {"title": "Before you go back in", "time": "before entry",
             "detail": "Confirm officials have said it is safe to return and that the building is structurally sound.",
             "items": ["Wait for the all-clear from local officials before returning",
                       "Do not enter if the structure is shifted, sagging, or surrounded by floodwater",
                       "If you smell gas or hear hissing, leave and call the gas company / 911",
                       "Do NOT turn power on yourself if water reached outlets, the panel, or appliances",
                       "Have an electrician or utility confirm before restoring power",
                       "Wear rubber boots, gloves, and an N95 mask"]},
            {"title": "First walk-through — document everything", "time": "1–2 hours",
             "detail": "Record the damage for your insurance/aid claim before cleaning or discarding.",
             "items": ["Photograph and video every room and damaged item before moving anything",
                       "Note the high-water line on walls",
                       "Keep a written inventory: item, approximate age, approximate value",
                       "Save samples/receipts of damaged belongings if you can",
                       "Do not throw out major items until your adjuster says so (keep photos either way)"]},
            {"title": "Clean up and dry out", "time": "days",
             "detail": "Remove water and wet material fast, then disinfect to prevent mold.",
             "items": ["Pump/remove standing water and wet mud",
                       "Remove soaked drywall, insulation, carpet, and padding — they trap moisture",
                       "Run fans, dehumidifiers, and open windows to dry the structure",
                       "Clean and disinfect hard surfaces with a household cleaner, then a bleach solution",
                       "Discard food, medicine, and cosmetics that touched floodwater",
                       "Do not use a gasoline generator indoors or in the garage — carbon monoxide kills"]},
            {"title": "Health, water, and next steps", "time": "ongoing",
             "detail": "Protect your health and start the recovery paperwork.",
             "items": ["Follow any boil-water or do-not-drink notice for your area",
                       "Watch for mold; people with asthma/allergies should stay out of mold-heavy areas",
                       "Wash hands well after contact with floodwater; clean wounds immediately",
                       "Start your insurance claim and (if eligible) FEMA/relief application",
                       "Keep all receipts for repairs, lodging, and cleanup"]},
        ],
    },
    "wildfire": {
        "headline": "Return to a fire-damaged home carefully — ash and air are hazards",
        "what": [
            "Do not return until officials reopen the area",
            "Treat ash and soot as hazardous — wear an N95 and gloves",
            "Watch for hidden hot spots and weakened structures",
            "Photograph all damage before cleanup for your claim",
        ],
        "steps": [
            {"title": "Before you go back in", "time": "before entry",
             "detail": "Re-enter only after officials clear the area and you've checked for immediate dangers.",
             "items": ["Return only when authorities say the area is safe",
                       "Watch for hot spots, smoldering debris, and ash pits that can stay hot for days",
                       "Check for the smell of gas; if present, leave and call the utility / 911",
                       "Look for downed power lines and damaged utilities — do not touch",
                       "Wear an N95 respirator, gloves, long sleeves, and sturdy boots"]},
            {"title": "First walk-through — document everything", "time": "1–2 hours",
             "detail": "Record damage for insurance/aid before disturbing anything.",
             "items": ["Photograph and video all damage, inside and out, before cleanup",
                       "Inventory damaged belongings: item, age, value",
                       "Keep receipts for lodging, food, and supplies since you evacuated",
                       "Do not discard major damaged items until your adjuster reviews them"]},
            {"title": "Clean up ash and soot safely", "time": "days",
             "detail": "Ash can contain toxic and caustic material — never dry-sweep it.",
             "items": ["Do NOT dry sweep or use a leaf blower — it spreads fine toxic particles",
                       "Mist ash lightly with water, then gently scoop into sealed bags",
                       "Use a HEPA-filter vacuum, not a regular one, indoors",
                       "Have HVAC and ducts inspected/cleaned before running the system",
                       "Wash off any ash that touches skin promptly"]},
            {"title": "Water, health, and next steps", "time": "ongoing",
             "detail": "Confirm utilities and start recovery paperwork.",
             "items": ["Follow any do-not-drink / boil-water notice — fire can damage water systems",
                       "Keep windows closed and run an air purifier while smoke lingers",
                       "Have a professional confirm the structure before extended re-occupancy",
                       "Start your insurance claim and any FEMA/relief application",
                       "Keep all cleanup and repair receipts"]},
        ],
    },
    "tornado": {
        "headline": "After a tornado, watch for downed lines and unstable structures",
        "what": [
            "Stay clear of damaged buildings and downed power lines",
            "Watch for gas leaks and sharp debris",
            "Photograph damage before cleanup",
            "Use generators and chainsaws safely",
        ],
        "steps": [
            {"title": "Before you go back in", "time": "before entry",
             "detail": "Account for immediate dangers before entering a damaged building.",
             "items": ["Do not enter a building that is leaning, cracked, or partly collapsed",
                       "Stay far away from downed power lines and anything touching them",
                       "If you smell gas or hear hissing, leave and call the gas company / 911",
                       "Wear gloves, sturdy boots, and eye protection — debris is everywhere",
                       "Watch for nails, broken glass, and unstable debris piles"]},
            {"title": "First walk-through — document everything", "time": "1–2 hours",
             "detail": "Record the damage before you start clearing it.",
             "items": ["Photograph and video all damage before moving debris",
                       "Inventory damaged property: item, age, value",
                       "Cover broken windows/roof with tarps to prevent further damage (keep receipts)",
                       "Do not discard major items until your adjuster reviews them"]},
            {"title": "Clean up debris safely", "time": "days",
             "detail": "Most post-tornado injuries happen during cleanup — go slow.",
             "items": ["Never run a generator indoors or in a garage — carbon monoxide kills",
                       "Use chainsaws only if trained; watch for tension in fallen limbs",
                       "Stack debris away from the road per local instructions",
                       "Turn off power to wet or damaged circuits before handling them",
                       "Take breaks and stay hydrated; cleanup injuries are common"]},
            {"title": "Health, contacts, and next steps", "time": "ongoing",
             "detail": "Start the recovery paperwork and stay informed.",
             "items": ["Clean any wounds immediately and check tetanus status",
                       "Reconnect with family and register as safe if a system is set up",
                       "Start your insurance claim and any FEMA/relief application",
                       "Keep all receipts for repairs, lodging, and supplies",
                       "Follow local guidance on water and utility safety"]},
        ],
    },
    "earthquake": {
        "headline": "After the shaking, check for gas, structure, and aftershocks",
        "what": [
            "Expect aftershocks — be ready to drop, cover, and hold on again",
            "Check for gas leaks and structural damage before settling in",
            "Photograph damage before cleanup",
            "Do not enter visibly damaged buildings",
        ],
        "steps": [
            {"title": "Right after the shaking", "time": "first minutes",
             "detail": "Check yourself and immediate hazards before anything else.",
             "items": ["Check yourself and others for injuries",
                       "Expect aftershocks — drop, cover, and hold on if one hits",
                       "If you smell gas or hear hissing, shut off the gas at the meter and leave",
                       "Only shut off gas if you suspect a leak — the utility must turn it back on",
                       "Put on shoes — broken glass is everywhere"]},
            {"title": "Inspect before you stay", "time": "30–60 min",
             "detail": "Confirm the building is safe before re-occupying it.",
             "items": ["Do not enter or stay in a building with major cracks, a leaning frame, or a shifted foundation",
                       "Check for damaged chimneys, stairs, and ceilings",
                       "Stay away from downed power lines and report them",
                       "If unsure about structural safety, have it inspected before re-occupying"]},
            {"title": "Document and clean up", "time": "hours–days",
             "detail": "Record damage for your claim, then clean up cautiously.",
             "items": ["Photograph and video all damage before cleanup",
                       "Inventory damaged property: item, age, value",
                       "Clean up spilled medicines, bleach, gas, and other chemicals carefully",
                       "Open cabinets carefully — contents may fall",
                       "Do not discard major items until your adjuster reviews them"]},
            {"title": "Utilities, health, and next steps", "time": "ongoing",
             "detail": "Restore services safely and start the paperwork.",
             "items": ["Have professionals check gas, water, and electrical before full use",
                       "Listen to official channels for aftershock and safety updates",
                       "Start your insurance claim and any FEMA/relief application",
                       "Keep all receipts for repairs, lodging, and supplies",
                       "Reconnect with family and check on neighbors who may need help"]},
        ],
    },
}


def cleanup_fallback(hazard: str, lang: str = "en") -> dict:
    """Deterministic clean-up plan in the Slideshow {summary, steps[]} shape."""
    plan = _CLEANUP.get(hazard) or _CLEANUP["flood"]
    return {
        "headline_action": plan["headline"],
        "confidence": "medium",
        "engine": "rule-based",
        "summary": {
            "tier_label": "Recovery — clean-up & re-entry",
            "time_estimate": "Work through these as conditions allow — safety first.",
            "what_to_do": plan["what"],
        },
        "steps": [
            {
                "title": s["title"],
                "detail": s["detail"],
                "time_estimate": s["time"],
                "expanded_detail": s["items"],
            }
            for s in plan["steps"]
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Sensitive-data guardrail
# ─────────────────────────────────────────────────────────────────────────────

_SENSITIVE = {
    "possible Social Security number": r"\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b",
    "possible bank, routing, account, or card number":
        r"\b(?:account|acct|routing|bank|card|visa|mastercard)\b.{0,30}\d{4,}|\b(?:\d[ -]?){13,19}\b",
    "possible exact street address":
        r"\b\d{1,6}\s+[\w .'-]{2,40}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place|cir|circle)\b",
    "possible policy or claim number":
        r"\b(?:policy|claim)\s*(?:number|no\.?|#|id)\s*[:#-]?\s*[A-Z0-9-]{6,}\b",
    "possible login credential":
        r"\b(?:password|passcode|pin)\s*[:=#-]?\s*\S+|\b(?:login|username|credential)\s*[:=#-]\s*\S+",
}


def find_sensitive_data(text: str) -> list[str]:
    """Return labels for any likely-sensitive data in the text (empty = clean)."""
    findings = []
    for label, pattern in _SENSITIVE.items():
        if re.search(pattern, text, flags=re.IGNORECASE):
            findings.append(label)
    return findings


def redact_sensitive_data(text: str) -> tuple[str, list[str]]:
    """Replace likely-sensitive data with [REDACTED] and return (clean_text, labels).

    Used to scrub a document before it reaches the AI / extractor, so the user can
    proceed without manually editing it. The extraction (deadlines, required proof,
    contacts) doesn't need the PII; phone numbers and emails are not in the
    sensitive set, so contact info survives. Labels list what was removed."""
    clean = text or ""
    removed: list[str] = []
    for label, pattern in _SENSITIVE.items():
        if re.search(pattern, clean, flags=re.IGNORECASE):
            removed.append(label)
            clean = re.sub(pattern, "[REDACTED]", clean, flags=re.IGNORECASE)
    return clean, removed


# ─────────────────────────────────────────────────────────────────────────────
# 3. Deadline computation + document classification
#    (ported & condensed from the standalone david2 prototype). Unlike the old
#    regex-only deadline grep, this actually COMPUTES dates: it parses absolute
#    dates, resolves relative ones ("within 60 days of the date of this letter")
#    against trigger dates found in the text, and scores urgency by days remaining.
# ─────────────────────────────────────────────────────────────────────────────

_MONTH_RX = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_PHRASE = rf"(?:\d{{1,2}}/\d{{1,2}}/\d{{2,4}}|{_MONTH_RX}\s+\d{{1,2}}(?:,\s*\d{{4}})?)"

_TRIGGER_RX = (
    r"date of this letter|letter date|date of letter|date of loss|loss date|"
    r"date of denial|denial date|date notice was issued|notice issue date|date of notice"
)

_META_TERMS = (
    "expected", "detect", "normalize to", "should be", "days remaining",
    "what should not happen", "test false positives", "test notes",
    "developer notes", "acceptance criteria", "regression test",
)


def _is_meta_instruction(sentence: str) -> bool:
    low = sentence.lower()
    return any(t in low for t in _META_TERMS)


def _source_sentences(sentences: list[str]) -> list[str]:
    """Drop spec/test/meta lines so they can't be mistaken for real deadlines."""
    return [s for s in sentences if not _is_meta_instruction(s)]


def _parse_date_phrase(value: str, as_of: date) -> date | None:
    cleaned = value.strip().rstrip(".,;")
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y", "%B %d", "%b %d"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            if "%Y" not in fmt and "%y" not in fmt:
                parsed = parsed.replace(year=as_of.year)
            return parsed.date()
        except ValueError:
            continue
    return None


def _find_absolute_deadline(sentence: str) -> re.Match[str] | None:
    for pat in (
        rf"\b(?:by|before|no later than|due by|file by|submit by|appeal by)\s+(?P<date>{_DATE_PHRASE})",
        rf"\b(?:deadline|due date|appeal deadline)\s*(?:is|:|-)?\s*(?P<date>{_DATE_PHRASE})",
    ):
        m = re.search(pat, sentence, flags=re.IGNORECASE)
        if m:
            return m
    return None


def _find_relative_deadline(sentence: str) -> re.Match[str] | None:
    for pat in (
        rf"\bwithin\s+(?P<days>\d{{1,3}})\s+days?\s+(?:of|from|after)\s+(?:the\s+)?(?P<trigger>{_TRIGGER_RX})",
        rf"\b(?P<days>\d{{1,3}})\s+days?\s+(?:of|from|after)\s+(?:the\s+)?(?P<trigger>{_TRIGGER_RX})",
    ):
        m = re.search(pat, sentence, flags=re.IGNORECASE)
        if m:
            return m
    return None


def _find_bare_relative_deadline(sentence: str) -> re.Match[str] | None:
    return re.search(r"\bwithin\s+(?P<days>\d{1,3})\s+days?\b", sentence, flags=re.IGNORECASE)


def _normalize_trigger(trigger: str) -> str:
    n = re.sub(r"\s+", " ", trigger.strip().lower())
    if n in {"date of this letter", "letter date", "date of letter"}:
        return "date_of_letter"
    if n in {"date of loss", "loss date"}:
        return "date_of_loss"
    if n in {"date of denial", "denial date"}:
        return "denial_date"
    return "notice_issue_date"


def _extract_trigger_dates(sentences: list[str], as_of: date) -> dict[str, date]:
    triggers: dict[str, date] = {}
    patterns = [
        ("date_of_letter", rf"\b(?:date of (?:this )?letter|letter date|letter dated)\s*(?:is|:|-|on)?\s*(?P<date>{_DATE_PHRASE})"),
        ("date_of_loss", rf"\b(?:date of loss|loss date|loss occurred on)\s*(?:is|:|-|on)?\s*(?P<date>{_DATE_PHRASE})"),
        ("denial_date", rf"\b(?:date of denial|denial date|denial dated)\s*(?:is|:|-|on)?\s*(?P<date>{_DATE_PHRASE})"),
        ("notice_issue_date", rf"\b(?:date notice was issued|notice issue date|date of notice|notice issued on|issued on)\s*(?:is|:|-|on)?\s*(?P<date>{_DATE_PHRASE})"),
    ]
    for sentence in sentences:
        if re.search(r"\b(?:issued|reviewed|signed)\s+by\b", sentence, flags=re.IGNORECASE):
            continue
        for label, pat in patterns:
            m = re.search(pat, sentence, flags=re.IGNORECASE)
            if m:
                parsed = _parse_date_phrase(m.group("date"), as_of)
                if parsed:
                    triggers[label] = parsed
    return triggers


def _deadline_action(sentence: str) -> str:
    for pat, action in (
        (r"\bappeal\b", "Appeal or request review"),
        (r"\bsworn proof of loss\b|\bproof of loss\b", "Submit sworn proof of loss"),
        (r"\binspection\b|\bschedule\b", "Schedule inspection or review"),
        (r"\bsubmit\b|\bprovide\b|\bsend\b|\bupload\b|\bmail\b", "Submit requested documents or information"),
        (r"\bfile\b", "File the required claim, appeal, or form"),
        (r"\brespond\b", "Respond to the notice"),
    ):
        if re.search(pat, sentence, flags=re.IGNORECASE):
            return action
    return "Confirm the required action with the issuing organization"


def _urgency(days_remaining: int) -> str:
    if days_remaining < 0:
        return "passed"
    if days_remaining <= 10:
        return "urgent"
    if days_remaining <= 30:
        return "upcoming"
    return "later"


def _is_deadline_false_positive(sentence: str) -> bool:
    return bool(
        re.search(r"\b(?:issued|reviewed|signed|prepared|approved)\s+by\b", sentence, flags=re.IGNORECASE)
        and not re.search(
            r"\b(?:within|no later than|before|deadline|due|appeal by|submit by|file by)\b",
            sentence, flags=re.IGNORECASE,
        )
    )


def _deadline_quality(detail: dict) -> int:
    score = {"high": 30, "medium": 20, "low": 10}.get(detail.get("confidence"), 0)
    low = detail.get("original_sentence", "").lower()
    if _is_meta_instruction(detail.get("original_sentence", "")):
        score -= 100
    if any(t in low for t in ("detect", "normalize to", "should be", "expected")):
        score -= 50
    if any(t in low for t in ("you must", "you have", "submit", "schedule", "no later than")):
        score += 10
    return score


def _action_key(action: str) -> str:
    low = action.lower()
    if "appeal" in low:
        return "appeal"
    if "proof of loss" in low:
        return "proof_of_loss"
    if "inspection" in low or "schedule" in low:
        return "inspection"
    if "submit" in low:
        return "submit"
    return re.sub(r"[^a-z0-9]+", "_", low).strip("_")


def _dedupe_deadlines(details: list[dict]) -> list[dict]:
    grouped: dict[tuple[str, str], dict] = {}
    unknowns: list[dict] = []
    for d in details:
        if not d.get("normalized_deadline_date"):
            unknowns.append(d)
            continue
        key = (d["normalized_deadline_date"], _action_key(d.get("action_required", "")))
        cur = grouped.get(key)
        if cur is None or _deadline_quality(d) > _deadline_quality(cur):
            grouped[key] = d
    return list(grouped.values()) + unknowns


def extract_deadline_details(sentences: list[str], as_of: date | None = None) -> list[dict]:
    """Compute structured deadlines from document sentences.

    Each result is a dict: original_sentence, action_required,
    normalized_deadline_date (ISO or None), days_remaining (int or None),
    urgency (urgent|upcoming|later|passed|unknown), confidence, explanation.
    """
    as_of = as_of or date.today()
    sentences = _source_sentences(sentences)
    trigger_dates = _extract_trigger_dates(sentences, as_of)
    details: list[dict] = []

    for raw in sentences:
        s = re.sub(r"\s+", " ", raw.strip())
        if not s or _is_deadline_false_positive(s) or _is_meta_instruction(s):
            continue

        m = _find_absolute_deadline(s)
        if m:
            d = _parse_date_phrase(m.group("date"), as_of)
            if d:
                days = (d - as_of).days
                details.append({
                    "original_sentence": s,
                    "action_required": _deadline_action(s),
                    "normalized_deadline_date": d.isoformat(),
                    "days_remaining": days,
                    "urgency": _urgency(days),
                    "confidence": "high",
                    "explanation": f"Found an explicit deadline date: {m.group('date')}.",
                })
                continue

        m = _find_relative_deadline(s)
        if m:
            days = int(m.group("days"))
            label = _normalize_trigger(m.group("trigger"))
            trig = trigger_dates.get(label)
            if trig:
                d = trig + timedelta(days=days)
                remaining = (d - as_of).days
                details.append({
                    "original_sentence": s,
                    "action_required": _deadline_action(s),
                    "normalized_deadline_date": d.isoformat(),
                    "days_remaining": remaining,
                    "urgency": _urgency(remaining),
                    "confidence": "high",
                    "explanation": f"Computed from {days} days after {label.replace('_', ' ')} ({trig.isoformat()}).",
                })
            else:
                details.append({
                    "original_sentence": s,
                    "action_required": _deadline_action(s),
                    "normalized_deadline_date": None,
                    "days_remaining": None,
                    "urgency": "unknown",
                    "confidence": "medium",
                    "explanation": f"{UNKNOWN_DEADLINE_TRIGGER_MSG} Needed trigger: {label.replace('_', ' ')}.",
                })
            continue

        m = _find_bare_relative_deadline(s)
        if m:
            details.append({
                "original_sentence": s,
                "action_required": _deadline_action(s),
                "normalized_deadline_date": None,
                "days_remaining": None,
                "urgency": "unknown",
                "confidence": "low",
                "explanation": f"{UNKNOWN_DEADLINE_TRIGGER_MSG} The document says within "
                               f"{m.group('days')} days but does not state the trigger date.",
            })

    return _dedupe_deadlines(details)


def _coerce_date(value, as_of: date) -> date | None:
    """Parse an ISO date (YYYY-MM-DD) or a loose date phrase into a date."""
    if not value:
        return None
    s = str(value).strip()
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return _parse_date_phrase(s, as_of)


def reconcile_deadlines(llm_details, as_of: date | None = None) -> list[dict]:
    """Trust the LLM for EXTRACTION, code for ARITHMETIC.

    The model emits deadline objects ({action_required, original_sentence,
    trigger_date, offset_days, deadline_date}); here we re-derive the actual date
    and days-remaining deterministically so a hallucinated count can't slip through:
      • trigger_date + offset_days  -> recompute the deadline date (most reliable)
      • else a stated deadline_date -> trust the date, recompute days/urgency
    Urgency is always computed, never taken from the model.
    """
    as_of = as_of or date.today()
    out: list[dict] = []
    for d in (llm_details or []):
        if not isinstance(d, dict):
            continue
        action = (str(d.get("action_required") or d.get("action") or "").strip()
                  or "Confirm the required action with the issuing organization")
        sentence = str(d.get("original_sentence") or "").strip()
        confidence = d.get("confidence") if d.get("confidence") in ("high", "medium", "low") else "medium"

        trigger = _coerce_date(d.get("trigger_date"), as_of)
        offset = d.get("offset_days")
        deadline = None
        explanation = ""
        if trigger is not None and isinstance(offset, (int, float)):
            deadline = trigger + timedelta(days=int(offset))
            explanation = f"Computed from {int(offset)} days after {trigger.isoformat()}."
            confidence = "high"
        else:
            deadline = _coerce_date(d.get("deadline_date") or d.get("normalized_deadline_date"), as_of)
            if deadline is not None:
                explanation = "Deadline date as stated in the document."

        if deadline is not None:
            days = (deadline - as_of).days
            out.append({
                "original_sentence": sentence or action,
                "action_required": action,
                "normalized_deadline_date": deadline.isoformat(),
                "days_remaining": days,
                "urgency": _urgency(days),
                "confidence": confidence,
                "explanation": explanation,
            })
        else:
            out.append({
                "original_sentence": sentence or action,
                "action_required": action,
                "normalized_deadline_date": None,
                "days_remaining": None,
                "urgency": "unknown",
                "confidence": "low",
                "explanation": str(d.get("explanation") or "No computable deadline date was provided."),
            })
    return _dedupe_deadlines(out)


def merge_deadlines(primary: list[dict], secondary: list[dict]) -> list[dict]:
    """Union two computed-deadline lists (LLM + regex), keeping the best-quality
    entry per (date, action). Highest-confidence dated items win; undated extras
    are appended so nothing is lost."""
    return _dedupe_deadlines([*(primary or []), *(secondary or [])])


def format_deadline_summaries(details: list[dict]) -> list[str]:
    """Human-readable one-liners for each computed deadline."""
    out = []
    for d in details:
        if d.get("normalized_deadline_date"):
            out.append(
                f"{d['original_sentence']} → Deadline: {d['normalized_deadline_date']} "
                f"({d['days_remaining']} days, urgency: {d['urgency']})."
            )
        else:
            out.append(f"{d['original_sentence']} → Urgency: {d['urgency']}. {d['explanation']}")
    return _dedup(out)


# Document classification — weighted phrase scoring with guardrails so generic
# insurance/appeal boilerplate alone can't trigger a strong (mis)classification.
_DOC_RULES: dict[str, list[tuple[int, list[str]]]] = {
    "insurance policy": [
        (6, ["coverage form", "insuring agreement", "policy conditions", "endorsement"]),
        (4, ["policy sample", "exclusions", "conditions", "definitions"]),
        (2, ["policy", "coverage", "deductible"]),
    ],
    "declarations page": [
        (8, ["declarations page", "policy declarations", "coverage limits"]),
        (4, ["policy period", "insured location", "premium"]),
    ],
    "claim filing instructions": [
        (7, ["claim filing instructions", "how to file a claim", "file a claim", "submit a claim form"]),
        (4, ["claim form", "proof of loss form", "upload documents"]),
    ],
    "claim acknowledgement": [
        (7, ["claim acknowledgement", "we received your claim", "claim has been opened"]),
        (3, ["claim number", "assigned adjuster"]),
    ],
    "claim estimate": [
        (8, ["claim estimate", "estimate of damages", "adjuster estimate", "line item estimate"]),
        (4, ["replacement cost", "actual cash value", "depreciation", "scope of repairs"]),
    ],
    "payment letter": [
        (8, ["payment letter", "we are issuing payment", "payment enclosed", "claim payment"]),
        (4, ["recoverable depreciation", "deductible applied", "settlement payment"]),
    ],
    "denial notice": [
        (10, ["your claim is denied", "we are denying", "we cannot approve", "reason for denial"]),
        (8, ["not eligible", "not approved"]),
    ],
    "appeal notice": [
        (7, ["appeal notice", "right to appeal", "submit a written appeal", "appeal instructions"]),
        (3, ["reconsideration", "request review"]),
    ],
    "FEMA assistance decision": [
        (9, ["fema assistance decision", "individual assistance decision", "disaster assistance decision"]),
        (5, ["fema", "eligible for assistance", "not eligible for assistance"]),
    ],
    "FEMA appeal instructions": [
        (9, ["fema appeal instructions", "appeal fema", "fema decision appeal"]),
        (5, ["fema", "60 days", "appeal letter"]),
    ],
    "local relief application": [
        (8, ["local relief application", "relief application", "grant application"]),
        (4, ["county assistance", "city assistance", "local aid"]),
    ],
    "inspection report": [
        (8, ["inspection report", "building inspection", "city inspection"]),
        (4, ["unsafe occupancy", "inspector", "structural inspection"]),
    ],
    "contractor estimate": [
        (8, ["contractor estimate", "repair estimate", "bid proposal"]),
        (4, ["licensed contractor", "labor and materials", "scope of work"]),
    ],
    "utility restoration notice": [
        (8, ["power restoration", "gas service", "water service", "reconnection"]),
        (4, ["utility", "service restored", "do-not-drink"]),
    ],
    "insurance claim decision letter / partial denial notice": [
        (8, ["claim decision", "we reviewed your claim", "partial denial", "partially denied"]),
        (5, ["additional building damage", "submit a written appeal", "proof of loss"]),
    ],
}


def classify_document(text: str, insurer: str = "", disaster: str = "") -> dict:
    """Score the document against known recovery-document types. Returns
    {primary_doc_type, confidence_score, alternative_types, reason_evidence}."""
    low = text.lower()
    heading = " ".join(text.splitlines()[:8]).lower()
    context = " ".join([low, insurer.lower(), disaster.lower()])

    scores = {k: 0.0 for k in _DOC_RULES}
    evidence: dict[str, list[str]] = {k: [] for k in _DOC_RULES}

    def add(doc_type: str, points: float, reason: str) -> None:
        scores[doc_type] += points
        evidence[doc_type].append(reason)

    for doc_type, rules in _DOC_RULES.items():
        for points, phrases in rules:
            matches = [p for p in phrases if p in context]
            if matches:
                add(doc_type, points * len(matches), ", ".join(matches))

    for doc_type in list(scores):
        head_word = doc_type.lower().split(" / ")[0].split()
        if any(term in heading for term in head_word):
            add(doc_type, 4, "title/heading signal")

    if insurer and insurer.lower() in low:
        for doc_type in ("insurance policy", "claim filing instructions", "claim acknowledgement",
                         "claim estimate", "payment letter", "denial notice", "appeal notice",
                         "insurance claim decision letter / partial denial notice"):
            add(doc_type, 1, "issuer name appears")

    # Guardrails: boilerplate alone is not enough for the strong types.
    if not any(p in low for p in ("your claim is denied", "we are denying", "not eligible",
                                  "we cannot approve", "reason for denial", "not approved")):
        scores["denial notice"] = min(scores["denial notice"], 3)
    if not any(p in low for p in ("claim filing instructions", "how to file a claim",
                                  "file a claim", "submit a claim form", "claim form")):
        scores["claim filing instructions"] = min(scores["claim filing instructions"], 3)
    if "fema" not in low:
        scores["FEMA assistance decision"] = 0
        scores["FEMA appeal instructions"] = 0
    if not any(p in low for p in ("contractor estimate", "contractor bid", "bid proposal")):
        scores["contractor estimate"] = min(scores["contractor estimate"], 3)
    if not any(p in low for p in ("claim estimate", "adjuster estimate", "line item estimate",
                                  "estimate of damages")):
        scores["claim estimate"] = min(scores["claim estimate"], 3)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    primary, score = ranked[0]
    if score < 4:
        primary = "unknown recovery document"
    alternatives = [dt for dt, sc in ranked[1:] if sc >= 4][:4]
    confidence = min(round(score / 20, 2), 0.99) if primary != "unknown recovery document" else 0.25
    reasons = evidence.get(primary, [])[:4]
    return {
        "primary_doc_type": primary,
        "confidence_score": confidence,
        "alternative_types": alternatives,
        "reason_evidence": "; ".join(reasons) if reasons else "No high-confidence classification signals were found.",
    }


def has_meaningful_extracted_text(text: str) -> bool:
    """False when an upload looks like a scanned image / photo with no real text
    layer — the signal the UI uses to ask for OCR or a pasted excerpt."""
    words = re.findall(r"[A-Za-z0-9]{2,}", text or "")
    return len(" ".join(words)) >= 40 and len(words) >= 6


# ── Contact + issuer extraction (ported & condensed from the david3 prototype) ──
# Classifies each contact (phone / email / portal / mailing address / named
# adjuster / actionable claim department) and filters "contact traps" — generic
# headings, "signed by …" lines, non-actionable office names — so the analysis
# surfaces *who to actually contact*, not every string that looks like a number.

_GENERIC_HEADINGS = {
    "contacts mentioned", "required documents", "deadlines",
    "claim decision letter", "insurance claim decision letter", "test false positives",
}


def _normalize_heading(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.strip().lower()).strip()


def _is_generic_heading(value: str) -> bool:
    return _normalize_heading(value) in _GENERIC_HEADINGS or _is_meta_instruction(value)


def _is_contact_trap(value: str) -> bool:
    return bool(re.search(r"\b(?:reviewed|signed|prepared|approved)\s+by\b", value, flags=re.IGNORECASE))


def _is_non_actionable_office(value: str) -> bool:
    return bool(re.search(r"\bclaims quality office\b|\binternal review office\b", value, flags=re.IGNORECASE))


def _looks_like_contact(v: str) -> bool:
    return bool(re.search(r"@|\d{3}[-.\s]\d{3}[-.\s]\d{4}|https?://|www\.", v))


def _clean_issuer_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value.strip(" .,:;-"))
    # Strip leading letter-labels ("From:", "To:", "Issued by", "Subject:") so the
    # label doesn't get mistaken for the issuer name.
    cleaned = re.sub(r"^(?:issued by|from|to|re|subject|issuer|sender)\b\s*[:\-]?\s*", "",
                     cleaned, flags=re.IGNORECASE).strip(" .,:;-")
    cleaned = re.split(
        r"\b(?:(?:flood|earthquake|tornado|wildfire)\s+(?:claim|policy|notice|letter|decision)|"
        r"claim instructions?|filing instructions?|claim decision letter|decision letter|notice|letter|"
        r"submit|upload|within|we reviewed|you must|please)\b|:",
        cleaned, maxsplit=1, flags=re.IGNORECASE,
    )[0].strip(" .,:;-")
    org = re.match(
        r"^(.+\b(?:Claims Department|Claim Department|Insurance|Mutual|Agency|Office|Utility|"
        r"School District|County|City|Authority)\b)", cleaned)
    if org:
        cleaned = org.group(1).strip(" .,:;-")
    return cleaned


def identify_issuer_details(text: str, insurer: str = "") -> tuple[str, str, str]:
    """Return (issuer_name, confidence, evidence). Scores header/letterhead,
    explicit 'issued by' lines, and organization names; filters traps/headings."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    candidates: list[tuple[str, int, str]] = []

    for line in lines[:8]:
        if _is_contact_trap(line) or _is_generic_heading(line):
            continue
        if re.search(r"\b(?:FEMA|Federal Emergency Management Agency|Insurance|Mutual|Claims? Department|"
                     r"Department|Agency|Office|Utility|School District|County|City|Authority)\b", line):
            candidates.append((_clean_issuer_name(line), 8, "document header/letterhead"))

    for pattern, weight, evidence in [
        (r"\b(?:issuer|from)\s*[:\-]\s*([A-Z][A-Za-z0-9 &.,'-]{2,100})", 7, "explicit issuer/from field"),
        (r"\bissued by\s+([A-Z][A-Za-z0-9 &.,'-]{2,100})", 10, "issued-by line"),
        (r"\b(FEMA|Federal Emergency Management Agency)\b", 8, "agency name in document"),
        (r"\b([A-Z][A-Za-z &.'-]{2,80}\s+(?:Insurance|Mutual|Claims? Department|Agency|Office|Utility|"
         r"School District|County|City|Authority))\b", 5, "organization name in document"),
    ]:
        for m in re.finditer(pattern, text):
            value = m.group(1).strip(" .,")
            if value and not _is_non_actionable_office(value):
                candidates.append((_clean_issuer_name(value), weight, evidence))

    if insurer.strip():
        w = 9 if insurer.strip().lower() in text.lower() else 4
        candidates.append((_clean_issuer_name(insurer.strip()), w, "user-entered insurer hint"))

    scored: dict[str, tuple[int, str, int]] = {}
    for cand, weight, evidence in candidates:
        if not cand or _is_generic_heading(cand):
            continue
        key = cand.lower()
        score = weight + min(text.lower().count(key), 3)
        cur = scored.get(key)
        if cur is None or score > cur[0]:
            scored[key] = (score, evidence, len(cand))

    if not scored:
        return "Issuing organization was not found in the provided text.", "low", ""

    best_key, (score, evidence, _len) = max(scored.items(), key=lambda kv: (kv[1][0], -kv[1][2]))
    issuer_name = next(c for c, _, _ in candidates if c.lower() == best_key)
    confidence = "high" if score >= 8 else "medium" if score >= 5 else "low"
    return _shorten(issuer_name, 120), confidence, evidence


def extract_contact_details(text: str) -> list[dict]:
    """Classified, de-junked contacts. Each: {contact_type, value}."""
    out: list[dict] = []
    for pat, ctype in [
        (r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "email"),
        (r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b", "phone"),
        (r"\b(?:https?://|www\.)[^\s)]+", "portal/website"),
    ]:
        for m in re.finditer(pat, text):
            out.append({"contact_type": ctype, "value": m.group(0).rstrip(".,;")})

    for sentence in _sentences(text):
        s = re.sub(r"\s+", " ", sentence.strip())
        if not s or _is_meta_instruction(s) or _is_contact_trap(s):
            continue
        addr = re.search(
            r"\b(?:mail|send|submit)\b.*?\b(?:to|at)\s+([A-Z0-9][A-Za-z0-9 .,'#-]{6,120}\b"
            r"(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Drive|Dr\.|Lane|Ln\.|Way|Suite|"
            r"PO Box|P\.O\. Box)\b[A-Za-z0-9 .,'#-]*)", s)
        if addr:
            out.append({"contact_type": "mailing address", "value": _shorten(addr.group(1).strip(" .,"), 160)})
        person = re.search(
            r"\b(?:assigned\s+)?(?:adjuster|agent|representative|case ?worker)\s*(?:is|:|-)?\s+"
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b", s)
        if person and not re.search(r"\bsigned by\b", s, flags=re.IGNORECASE):
            out.append({"contact_type": "named adjuster/person", "value": person.group(1).strip()})
        dept = re.search(
            r"\b(?:contact|call|email|send|mail|upload|submit|portal|questions?\s+(?:go\s+)?to)\s+"
            r"(?:documents?\s+)?(?:to|at|through|with|the\s+)?([A-Z][A-Za-z &.'-]{2,90}\s+"
            r"(?:Office|Department|Agency|Claims? Department|Assistance Center|Relief Center|Utility|School District))\b", s)
        if dept:
            value = dept.group(1).strip(" .,")
            if not _is_non_actionable_office(value) and not _is_generic_heading(value):
                out.append({"contact_type": "actionable claim department", "value": value})

    # Keep the deliberately-typed categories (adjuster/dept/address) plus anything
    # that matches a raw contact pattern; drop only stray look-alikes.
    _typed = {"actionable claim department", "named adjuster/person", "mailing address"}
    seen, unique = set(), []
    for c in out:
        if not _looks_like_contact(c["value"]) and c["contact_type"] not in _typed:
            continue
        key = (c["contact_type"], c["value"].lower())
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def format_contact_detail(detail: dict) -> str:
    return f"{detail['contact_type']}: {detail['value']}"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Paperwork extractor (deterministic fallback)
# ─────────────────────────────────────────────────────────────────────────────

def _sentences(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return []
    return [p.strip() for p in re.split(r"(?<=[.!?])\s+", cleaned) if p.strip()]


def _shorten(text: str, n: int = 260) -> str:
    t = re.sub(r"\s+", " ", text.strip())
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


def _dedup(items) -> list[str]:
    seen, out = set(), []
    for it in items:
        s = _shorten(str(it))
        k = s.lower()
        if k and k not in seen:
            seen.add(k)
            out.append(s)
    return out


def _match_sentences(sentences, pattern) -> list[str]:
    rx = re.compile(pattern, flags=re.IGNORECASE)
    return _dedup(s for s in sentences if rx.search(s))


def _doc_type(text: str) -> str:
    low = text.lower()
    rules = [
        ("claim denial or appeal notice", ["denied", "denial", "appeal", "reconsideration"]),
        ("FEMA / disaster assistance notice", ["fema", "disaster assistance", "individual assistance"]),
        ("local relief application", ["relief application", "county assistance", "city assistance", "grant application"]),
        ("utility restoration notice", ["power restoration", "gas service", "water service", "reconnection"]),
        ("repair estimate instructions", ["repair estimate", "contractor estimate", "licensed contractor"]),
        ("landlord / property recovery notice", ["landlord", "property manager", "tenant", "lease"]),
        ("insurance claim filing instructions", ["claim", "adjuster", "deductible", "proof of loss", "insurance"]),
    ]
    for label, terms in rules:
        if any(t in low for t in terms):
            return label
    return "unknown recovery document"


def _issuer(text: str, insurer: str) -> str:
    if insurer.strip():
        return insurer.strip()
    for pat in [
        r"\b(FEMA|Federal Emergency Management Agency)\b",
        r"\b([A-Z][A-Za-z &.'-]{2,60}\s+(?:Insurance|Mutual|Claims|Department|Agency|Office|Utility|School District|County|City))\b",
    ]:
        m = re.search(pat, text)
        if m:
            return _shorten(m.group(1).strip(" .,"), 120)
    return "Issuing organization was not found in the provided text."


_UNCLEAR_TERMS = [
    "appeal", "coverage", "deductible", "depreciation", "eligibility", "exclusion",
    "habitability", "mitigation", "proof of loss", "subrogation", "actual cash value", "replacement cost",
]


def paperwork_mock(text: str, insurer: str = "", claim_status: str = "",
                   disaster: str = "", as_of: date | None = None) -> dict:
    """Extract a structured recovery-paperwork analysis from document text."""
    text = (text or "").strip()
    if not text:
        return {}
    sents = _sentences(text)

    # Computed deadlines (dates + days-remaining + urgency) replace the old
    # regex-only sentence grep. `deadlines` keeps the array-of-strings shape the
    # frontend already renders; `deadline_details` carries the structured data.
    deadline_details = extract_deadline_details(sents, as_of=as_of)
    deadlines = format_deadline_summaries(deadline_details)
    required = _match_sentences(
        sents,
        r"\b(?:photo|photos|picture|video|receipt|receipts|estimate|invoice|proof of residence|"
        r"proof of ownership|id|identification|policy|utility bill|lease|title|deed|form|application|documentation)\b",
    )
    actions = _match_sentences(
        sents,
        r"\b(?:submit|call|appeal|upload|mail|keep|save|photograph|schedule|provide|complete|sign|return|file|register|obtain|send|bring|contact)\b",
    )
    appeals = _match_sentences(sents, r"\b(?:appeal|dispute|denial|denied|reconsideration|review request|hearing)\b")

    # Classified, de-junked contacts (typed: phone/email/portal/mailing/adjuster/dept).
    contact_objs = extract_contact_details(text)
    contacts = _dedup(format_contact_detail(c) for c in contact_objs)

    low = text.lower()
    unclear = [f"Confirm the meaning of '{t}' with the issuing organization." for t in _UNCLEAR_TERMS if t in low]

    flags = []
    if any(t in low for t in ["insurance", "claim", "adjuster", "coverage", "deductible", "policy"]) or insurer:
        flags.append("Insurance agent/adjuster must confirm coverage and payment.")
    if any(t in low for t in ["fema", "relief", "assistance", "grant", "application"]):
        flags.append("FEMA/local aid worker must confirm eligibility and application rules.")
    if any(t in low for t in ["contractor", "repair estimate", "inspection"]):
        flags.append("Licensed contractor/inspector must confirm repair scope and safety.")
    if any(t in low for t in ["appeal", "denial", "denied", "dispute", "legal"]):
        flags.append("Legal aid/attorney must review appeal rights and deadlines.")
    if not flags:
        flags.append("Confirm document requirements with the issuing organization.")

    classification = classify_document(text, insurer, disaster)
    # Prefer the scored classifier; fall back to the keyword guess if it's unsure.
    doc_type = classification["primary_doc_type"]
    if doc_type == "unknown recovery document":
        doc_type = _doc_type(text)
    issuer, issuer_confidence, _issuer_evidence = identify_issuer_details(text, insurer)

    missing = []
    if doc_type == "unknown recovery document":
        missing.append("The document type was not clear from the provided text.")
    if not deadlines:
        missing.append(NO_DEADLINE_MSG)
    if not contacts:
        missing.append(NO_CONTACT_MSG)
    if not required:
        missing.append(NO_DOCS_MSG)

    summary = (
        f"This looks like a {doc_type}. Issuer: {issuer}. The analysis below pulls out the "
        "deadlines, proof to gather, next steps, and who to confirm decisions with."
    )

    follow_ups = [
        "Do you want this sorted by deadline, by required proof, or by who to call first?",
        "What is the claim/application status — not started, started, submitted, denied, or approved?",
        "Are there other pages with deadlines or contacts you haven't pasted yet?",
    ]

    return {
        "response_mode": "mock",
        "document_type": doc_type,
        "document_classification": classification,
        "issuing_organization": issuer,
        "issuer_confidence": issuer_confidence,
        "plain_language_summary": summary,
        "deadlines": deadlines or [NO_DEADLINE_MSG],
        "deadline_details": deadline_details,
        "required_documents": required or [NO_DOCS_MSG],
        "action_steps": actions or ["No specific action steps were found in the provided text."],
        "contact_information": contacts or [NO_CONTACT_MSG],
        "appeal_or_dispute_steps": appeals,
        "unclear_terms": unclear,
        "missing_information": missing,
        "human_review_flags": flags,
        "human_review_required": HUMAN_REVIEW_REQUIRED,
        "follow_up_questions": follow_ups,
        "responsible_ai_note": RESPONSIBLE_AI_NOTE,
    }
