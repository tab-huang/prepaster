"""Tests for the recovery deadline/classification engine, alert-state watching,
route advisory, and the vulnerability/paperwork model fields."""
from __future__ import annotations

from datetime import date

from app import recovery
from app.Calc.route import route_advisory, segment_crosses_ring
from app.Calc.watch import evaluate, severity_rank
from app.models import PaperworkRequest, Resources


# ── Deadline computation ──────────────────────────────────────────────────────

AS_OF = date(2026, 3, 10)


def test_absolute_deadline_is_computed():
    sents = ["You must appeal by April 15, 2026 if you disagree."]
    details = recovery.extract_deadline_details(sents, as_of=AS_OF)
    assert len(details) == 1
    d = details[0]
    assert d["normalized_deadline_date"] == "2026-04-15"
    assert d["days_remaining"] == 36
    assert d["urgency"] == "later"
    assert d["confidence"] == "high"
    assert "Appeal" in d["action_required"]


def test_relative_deadline_resolves_against_trigger():
    sents = [
        "The date of this letter is 03/01/2026.",
        "Submit a sworn proof of loss within 60 days of the date of this letter.",
    ]
    details = recovery.extract_deadline_details(sents, as_of=AS_OF)
    proof = [d for d in details if "proof of loss" in d["action_required"].lower()]
    assert proof, details
    assert proof[0]["normalized_deadline_date"] == "2026-04-30"  # 60 days after Mar 1
    assert proof[0]["confidence"] == "high"


def test_relative_deadline_without_trigger_is_unknown():
    sents = ["You must respond within 30 days."]
    details = recovery.extract_deadline_details(sents, as_of=AS_OF)
    assert len(details) == 1
    assert details[0]["normalized_deadline_date"] is None
    assert details[0]["urgency"] == "unknown"


def test_urgency_buckets():
    soon = recovery.extract_deadline_details(["File by March 15, 2026."], as_of=AS_OF)[0]
    assert soon["urgency"] == "urgent"  # 5 days out
    past = recovery.extract_deadline_details(["File by March 1, 2026."], as_of=AS_OF)[0]
    assert past["urgency"] == "passed"


def test_signed_by_line_is_not_a_deadline():
    # "reviewed by ..." with no deadline language must not become a deadline.
    details = recovery.extract_deadline_details(
        ["This notice was reviewed by John Smith."], as_of=AS_OF
    )
    assert details == []


# ── Document classification ───────────────────────────────────────────────────

def test_classify_denial_notice():
    text = "NOTICE: Your claim is denied. The reason for denial is a policy exclusion."
    c = recovery.classify_document(text, insurer="Acme Mutual", disaster="flood")
    assert c["primary_doc_type"] == "denial notice"
    assert c["confidence_score"] > 0


def test_classify_guardrail_appeal_boilerplate_not_denial():
    # Appeal boilerplate alone must NOT be classified as a denial.
    text = "You have the right to appeal this decision and request review."
    c = recovery.classify_document(text)
    assert c["primary_doc_type"] != "denial notice"


def test_classify_unknown_when_no_signals():
    c = recovery.classify_document("The weather today is pleasant and mild.")
    assert c["primary_doc_type"] == "unknown recovery document"
    assert c["confidence_score"] == 0.25


# ── Scanned / OCR detection ───────────────────────────────────────────────────

def test_has_meaningful_text():
    assert recovery.has_meaningful_extracted_text(
        "Dear policyholder, your claim has been received and assigned a number."
    )
    assert not recovery.has_meaningful_extracted_text(".. .. ..")
    assert not recovery.has_meaningful_extracted_text("")


# ── paperwork_mock integration ────────────────────────────────────────────────

def test_paperwork_mock_includes_structured_deadlines_and_classification():
    text = (
        "The date of this letter is 03/01/2026. You must submit a sworn proof of loss "
        "within 60 days of the date of this letter. Your claim is denied. Send photos."
    )
    res = recovery.paperwork_mock(text, insurer="Acme Mutual", disaster="flood", as_of=AS_OF)
    assert "document_classification" in res
    assert "deadline_details" in res
    assert any(d["normalized_deadline_date"] == "2026-04-30" for d in res["deadline_details"])


# ── Deadline hybrid: LLM extracts, code computes ──────────────────────────────

def test_reconcile_overrides_llm_arithmetic():
    # The model reports a WRONG deadline_date; code must recompute from trigger+offset.
    llm = [{
        "action_required": "Appeal or request review",
        "original_sentence": "Appeal within 60 days of the date of this letter.",
        "trigger_date": "2026-03-01", "offset_days": 60,
        "deadline_date": "2026-04-25",  # wrong on purpose
    }]
    out = recovery.reconcile_deadlines(llm, as_of=AS_OF)
    assert out[0]["normalized_deadline_date"] == "2026-04-30"  # 60d after Mar 1, not the LLM's date
    assert out[0]["confidence"] == "high"


def test_reconcile_trusts_explicit_date_but_recomputes_days():
    llm = [{"action_required": "Submit proof of loss",
            "original_sentence": "Provide proof of loss by April 15, 2026.",
            "deadline_date": "2026-04-15"}]
    out = recovery.reconcile_deadlines(llm, as_of=AS_OF)
    assert out[0]["normalized_deadline_date"] == "2026-04-15"
    assert out[0]["days_remaining"] == 36


def test_reconcile_unknown_when_no_date():
    llm = [{"action_required": "Respond", "original_sentence": "Respond promptly."}]
    out = recovery.reconcile_deadlines(llm, as_of=AS_OF)
    assert out[0]["normalized_deadline_date"] is None
    assert out[0]["urgency"] == "unknown"


def test_merge_unions_and_dedupes():
    a = recovery.reconcile_deadlines(
        [{"action_required": "Appeal", "trigger_date": "2026-03-01", "offset_days": 60}], as_of=AS_OF)
    b = recovery.extract_deadline_details(["You must file by May 1, 2026."], as_of=AS_OF)
    merged = recovery.merge_deadlines(a, b)
    dates = sorted(d["normalized_deadline_date"] for d in merged if d["normalized_deadline_date"])
    assert dates == ["2026-04-30", "2026-05-01"]


def test_reconcile_ignores_non_dict_items():
    # Older prompt could return plain strings — must not crash.
    out = recovery.reconcile_deadlines(["just a string", None, 42], as_of=AS_OF)
    assert out == []


# ── Contact + issuer extraction (ported from david3) ──────────────────────────

CONTACT_DOC = (
    "From: Example Mutual Insurance Company\n"
    "Your claim is denied. Your assigned adjuster is Jane Doe. "
    "Call 1-800-555-0142 or email claims@example.com or visit www.example.com/claims. "
    "This notice was reviewed by John Smith of the Claims Quality Office."
)


def test_issuer_strips_header_label():
    issuer, conf, _ = recovery.identify_issuer_details(CONTACT_DOC, "")
    assert issuer == "Example Mutual Insurance"   # not "From"
    assert conf == "high"


def test_issuer_uses_user_hint():
    issuer, _, _ = recovery.identify_issuer_details("Some letter text.", "Acme Mutual")
    assert "Acme Mutual" in issuer


def test_contacts_are_classified():
    types = {c["contact_type"] for c in recovery.extract_contact_details(CONTACT_DOC)}
    assert "email" in types and "phone" in types and "portal/website" in types
    assert "named adjuster/person" in types


def test_contacts_filter_traps():
    vals = " ".join(c["value"] for c in recovery.extract_contact_details(CONTACT_DOC)).lower()
    assert "john smith" not in vals          # "reviewed by" trap
    assert "claims quality office" not in vals  # non-actionable office


def test_paperwork_mock_uses_classified_contacts():
    res = recovery.paperwork_mock(CONTACT_DOC, insurer="Example Mutual", disaster="flood")
    assert res["issuer_confidence"] in ("high", "medium", "low")
    assert any("claims@example.com" in c for c in res["contact_information"])


# ── Alert-state watching ──────────────────────────────────────────────────────

PRIOR = {"event": "Flood Warning", "severity": "Severe", "officialEvacOrder": False}


def test_watch_cleared_on_live_recheck():
    r = evaluate(PRIOR, None, expired=False, rechecked=True)
    assert r["state"] == "cleared"
    assert r["recoverSuggested"] is True


def test_watch_escalated():
    cur = {"event": "Flood Warning", "severity": "Extreme", "officialEvacOrder": True}
    r = evaluate(PRIOR, cur, expired=False, rechecked=True)
    assert r["state"] == "escalated"
    assert r["recoverSuggested"] is False


def test_watch_downgraded():
    cur = {"event": "Flood Advisory", "severity": "Minor"}
    r = evaluate(PRIOR, cur, expired=False, rechecked=True)
    assert r["state"] == "downgraded"


def test_watch_demo_expired_suggests_recover():
    r = evaluate(PRIOR, None, expired=True, rechecked=False)
    assert r["state"] == "expired"
    assert r["recoverSuggested"] is True


def test_watch_demo_active():
    r = evaluate(PRIOR, None, expired=False, rechecked=False)
    assert r["state"] == "active"
    assert r["recoverSuggested"] is False


def test_severity_rank_order():
    assert severity_rank("Extreme") > severity_rank("Severe") > severity_rank("Minor")
    assert severity_rank(None) == 0


# ── Route advisory ────────────────────────────────────────────────────────────

RING = [[0.0, 0.0], [0.02, 0.0], [0.02, 0.02], [0.0, 0.02], [0.0, 0.0]]


def test_route_advisory_flags_crossing_path():
    places = [
        {"name": "East School", "lat": 0.01, "lon": 0.03},
        {"name": "West Library", "lat": 0.01, "lon": -0.03},
    ]
    adv = route_advisory(0.01, -0.01, places, RING)
    assert adv["warned_area_known"] is True
    assert "East School" in adv["destinations_crossing_warned_area"]
    assert "West Library" in adv["destinations_with_clear_path"]


def test_route_advisory_no_polygon():
    adv = route_advisory(0.0, 0.0, [{"name": "X", "lat": 1.0, "lon": 1.0}], None)
    assert adv["warned_area_known"] is False


def test_segment_endpoints_skipped():
    # A destination inside the ring is not itself a "crossing" (endpoint skipped).
    assert segment_crosses_ring(-0.01, -0.01, 0.01, 0.01, RING) is True


# ── Model fields ──────────────────────────────────────────────────────────────

def test_resources_vulnerability_fields_default_false():
    r = Resources()
    assert r.hasVehicle is False
    assert r.mobilityLimited is False
    assert r.medicalNeeds is False
    assert r.dependents is False


def test_paperwork_request_accepts_now():
    p = PaperworkRequest(hazardType="flood", documentText="x", now="2026-06-19T12:00:00Z")
    assert p.now == "2026-06-19T12:00:00Z"
