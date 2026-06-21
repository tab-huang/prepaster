"""Crisis-to-Action API — one spine, four hazard modules, two response patterns.

  POST /api/alert      -> Stage 1+2: situation (+hazardType) + time tier (or RUN guidance)
  POST /api/module     -> Stage 4:   run the hazard module -> data (for the map) + deterministic
  POST /api/recommend  -> Stage 5:   one AI instruction (deterministic fallback baked in)
  GET  /api/health     -> liveness + which optional keys are configured
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import ai, modules, mock
from .ratelimit import RateLimitMiddleware
from .APIs import news, nws
from .APIs.alerts import fetch_alert
from .APIs.discover import find_active_disaster, find_active_disasters, resolve_place
from .APIs.rag import fetch_rag_context, fetch_recovery_rag, keywords_from_text
from . import recovery
from .Calc.guidance import run_guidance
from .Calc.watch import evaluate as evaluate_alert_state
from .models import (
    AlertRequest,
    AlertStatusRequest,
    CleanupRequest,
    FollowUpRequest,
    ModuleRequest,
    PaperworkRequest,
    PlaceRequest,
    RecommendRequest,
    RecoveryFollowUpRequest,
    ScreenshotRequest,
)
from .Calc.triage import compute_time_tier

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

log = logging.getLogger("crisis.main")


class _ExpectedNwsMiss(logging.Filter):
    """Drop httpx's noisy INFO line for the expected NWS 400 on non-US points.

    NWS returns 400 for any point outside the US; the dispatcher handles that by
    design (falls through to ECCC), so it isn't an error worth logging. Every other
    httpx request line is left untouched."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not ("api.weather.gov" in msg and "400 Bad Request" in msg)


logging.getLogger("httpx").addFilter(_ExpectedNwsMiss())

# Keep references to fire-and-forget background tasks so they aren't GC'd mid-run.
_background_tasks: set[asyncio.Task] = set()


async def _prewarm_rag(hazard: str, time_tier: str | None) -> None:
    """Warm the RAG cache in the background so /api/recommend is instant."""
    try:
        await fetch_rag_context(hazard, time_tier=time_tier or "PREPARE")
    except Exception as exc:  # never let a prewarm failure surface
        log.warning("RAG prewarm failed for %s: %s", hazard, exc)


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

app = FastAPI(title="Crisis-to-Action API", version="0.2.0")

# Per-IP + global rate limiting (protects the AI budget from scripted abuse).
app.add_middleware(RateLimitMiddleware)

# CORS: restrict to the known frontends instead of "*". The browser enforces this,
# so it stops other websites from calling the API from their users' browsers. It
# does NOT stop scripted/curl abuse (no Origin header to enforce) — the rate limiter
# is what guards against that. Override/extend via CORS_ALLOW_ORIGINS (comma-list).
_DEFAULT_ORIGINS = [
    "https://tabsite.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_env_origins = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_env_origins or _DEFAULT_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health():
    from .APIs.firms import MAP_KEY as FIRMS_MAP_KEY
    return {
        "ok": True,
        "ai_configured": bool(os.environ.get("OPENROUTER_API_KEY")),
        "firms_configured": bool(FIRMS_MAP_KEY),
    }


@app.post("/api/alert")
async def get_alert(req: AlertRequest):
    """Stage 1 + 2. Returns the parsed situation, the time tier, and — for RUN — the
    hardcoded life-safety guidance for that hazard so the client can act instantly."""
    if req.demo:
        situation = mock.mock_alert(req.hazard or "flood", req.tier or "ACT")
    else:
        try:
            situation = await fetch_alert(req.lat, req.lon)
        except Exception as exc:
            return {"ok": False, "error": f"Alert lookup failed: {exc}", "situation": None}
        if situation is None:
            return {
                "ok": True,
                "situation": None,
                "message": "No active alert for a supported hazard at this location "
                "(US via NWS, Canada via ECCC). Try Demo Mode to see the decision engine.",
            }

    situation["inZone"] = nws.compute_in_zone(req.lat, req.lon, situation)
    hazard = situation["hazardType"]

    if req.demo and req.tier:
        tier = req.tier
        _, reason = compute_time_tier(situation, hazard)
    else:
        tier, reason = compute_time_tier(situation, hazard)

    payload = {
        "ok": True,
        "situation": situation,
        "hazardType": hazard,
        "timeTier": tier,
        "tierReason": reason,
    }
    if tier == "RUN":
        payload["runGuidance"] = run_guidance(hazard)
    return payload


def _parse_iso(ts: str | None) -> datetime | None:
    """Parse an ISO timestamp (tolerating a trailing 'Z') into an aware datetime."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


@app.post("/api/alert/status")
async def alert_status(req: AlertStatusRequest):
    """Re-check the alert the user is acting on. Returns what changed (escalated /
    downgraded / cleared / expired) and `recoverSuggested` for the Respond→Recover
    handoff. Demo plans have no live feed, so they decide on the expiry clock alone."""
    prior = req.prior.model_dump()

    expired = False
    exp_dt = _parse_iso(prior.get("expires"))
    if exp_dt:
        now_dt = _parse_iso(req.now) or datetime.now(timezone.utc)
        expired = exp_dt < now_dt

    current: dict | None = None
    rechecked = False
    if not req.demo:
        try:
            current = await fetch_alert(req.lat, req.lon)
            rechecked = True
        except Exception as exc:
            log.warning("alert_status re-fetch failed: %s", exc)
            current, rechecked = None, False

    result = evaluate_alert_state(prior, current, expired=expired, rechecked=rechecked)
    payload = {"ok": True, **result}

    # If the live feed still has an alert, hand back the refreshed situation + tier
    # so the client can re-render the plan header against current conditions.
    if current is not None:
        current["inZone"] = nws.compute_in_zone(req.lat, req.lon, current)
        hazard = current["hazardType"]
        tier, reason = compute_time_tier(current, hazard)
        payload["situation"] = current
        payload["hazardType"] = hazard
        payload["timeTier"] = tier
        payload["tierReason"] = reason
        if tier == "RUN":
            payload["runGuidance"] = run_guidance(hazard)
    return payload


def _live_payload(found: dict) -> dict:
    """Turn one discovered disaster into the same shape as /api/alert, plus the
    simulated `lat`/`lon`/`locationLabel` used to place the user next to it."""
    situation = found["situation"]
    lat, lon = found["lat"], found["lon"]
    situation["inZone"] = nws.compute_in_zone(lat, lon, situation)
    hazard = situation["hazardType"]
    tier, reason = compute_time_tier(situation, hazard)
    payload = {
        "ok": True,
        "situation": situation,
        "hazardType": hazard,
        "timeTier": tier,
        "tierReason": reason,
        "lat": lat,
        "lon": lon,
        "locationLabel": found.get("label") or "",
    }
    if tier == "RUN":
        payload["runGuidance"] = run_guidance(hazard)
    return payload


@app.get("/api/demo/live")
async def demo_live():
    """Live demo. Find a disaster happening *right now* in the US or Canada (US weather
    via NWS, Canadian weather via ECCC, US/Canada quakes via USGS) and simulate the
    user standing next to it."""
    try:
        found = await find_active_disaster()
    except Exception as exc:
        return {"ok": False, "error": f"Live disaster lookup failed: {exc}", "situation": None}
    if not found:
        return {
            "ok": True,
            "situation": None,
            "message": "No active disaster found right now in the US or Canada (no severe "
            "weather and no recent significant quakes). Try again shortly, or use Demo Mode.",
        }
    return _live_payload(found)


@app.get("/api/demo/live/list")
async def demo_live_list():
    """Live demo, multi-choice. Find up to 5 disasters happening *right now* in the US
    or Canada (US weather via NWS, Canadian weather via ECCC, US/Canada quakes via USGS)
    so the user can pick which one to simulate. Each option has the same shape as
    /api/demo/live."""
    try:
        found = await find_active_disasters(limit=5)
    except Exception as exc:
        return {"ok": False, "error": f"Live disaster lookup failed: {exc}", "options": []}
    if not found:
        return {
            "ok": True,
            "options": [],
            "message": "No active disaster found right now in the US or Canada (no severe "
            "weather and no recent significant quakes). Try again shortly, or use Demo Mode.",
        }
    return {"ok": True, "options": [_live_payload(f) for f in found]}


@app.post("/api/demo/live/place")
async def demo_live_place(req: PlaceRequest):
    """Given a picked live-demo option, move the simulated user from the warning
    centroid to a real public place (school, library, park, …) inside the warned
    area. Falls back to the original point/label if none is found. Best-effort."""
    try:
        pp = await resolve_place(req.lat, req.lon, req.areaPolygon)
    except Exception:
        pp = None
    if not pp:
        return {"ok": True, "lat": req.lat, "lon": req.lon, "locationLabel": req.locationLabel}
    plat, plon, name = pp
    return {"ok": True, "lat": plat, "lon": plon, "locationLabel": name}


@app.post("/api/analyze_screenshot")
async def analyze_screenshot(req: ScreenshotRequest):
    """Real flow. Vision-parse a screenshot of the user's alert into a situation, then
    run Stage 1+2 (hazard detect already done by the model, + time triage)."""
    if not os.environ.get("OPENROUTER_API_KEY"):
        return {"ok": False, "error": "AI is not configured, so screenshots can't be read. "
                "Add an OPENROUTER_API_KEY, or use Demo Mode."}

    situation = await ai.analyze_screenshot(req.image, req.lat, req.lon)
    if situation is None:
        return {"ok": False, "error": "Couldn't read that image. Try a clearer screenshot of "
                "the alert, or use Demo Mode."}
    if situation["hazardType"] not in ("flood", "wildfire", "tornado", "earthquake"):
        return {"ok": False, "error": "That doesn't look like one of the four supported hazards "
                "(flood, wildfire, tornado, earthquake)."}

    situation["inZone"] = nws.compute_in_zone(req.lat, req.lon, situation)
    hazard = situation["hazardType"]
    tier, reason = compute_time_tier(situation, hazard)
    payload = {
        "ok": True,
        "situation": situation,
        "hazardType": hazard,
        "timeTier": tier,
        "tierReason": reason,
    }
    if tier == "RUN":
        payload["runGuidance"] = run_guidance(hazard)
    return payload


@app.post("/api/module")
async def run_module(req: ModuleRequest):
    """Stage 4. Run the hazard's decision module. Returns data for immediate map
    render plus a deterministic recommendation (the AI fallback / instant answer)."""
    # Warm the RAG cache while the user reads the map / answers the resource check,
    # so the Stage-5 /api/recommend call doesn't pay the web-fetch latency.
    _spawn(_prewarm_rag(req.hazardType, req.timeTier))
    demo = req.situation.source == "mock"
    result = await modules.run_module(req, demo)
    return {"ok": True, **result}


@app.post("/api/recommend")
async def recommend(req: RecommendRequest):
    """Stage 5. RAG context fetch + one AI synthesis call, deterministic fallback baked in."""
    # Make retrieval situation-aware: the alert text plus the user's own concern
    # note become lexical keywords that re-rank the cached chunk pool toward what
    # THIS person is facing, instead of always returning the generic hazard chunks.
    situation_text = " ".join(p for p in (
        req.situation.event, req.situation.description,
        req.situation.instruction, req.userNote,
    ) if p)
    extra_kw = keywords_from_text(situation_text)

    # Live flow: pull real local news to ground the plan in current conditions.
    # (Demo mode supplies its own newsContext from the frontend.)
    news_sources: list[dict] = []
    if not req.newsContext and req.situation.source == "live":
        query = " ".join(p for p in (req.situation.event, req.locationLabel) if p).strip()
        news_sources = await news.fetch_news(query)
        if news_sources:
            req.newsContext = "\n".join(f"- {a['title']}: {a['snippet']}" for a in news_sources)

    rag = await fetch_rag_context(req.hazardType, extra_keywords=extra_kw, time_tier=req.timeTier)
    rec = await ai.synthesize(req, rag_context=rag.get("context", ""))
    return {
        "ok": True,
        "recommendation": rec,
        "rag_sources": rag.get("sources", []),
        "news_sources": news_sources,
    }


@app.post("/api/follow-up")
async def follow_up_endpoint(req: FollowUpRequest):
    """Follow-up on the current plan: add a new step (instruction) or answer a question.

    Grounds the answer/step in the same RAG context as the main plan. This is
    cheap: the /api/recommend call for this hazard already warmed the two-tier
    cache, so this almost always returns from cache rather than refetching."""
    rag = await fetch_rag_context(req.hazardType, time_tier=req.timeTier)
    result = await ai.follow_up(req, rag_context=rag.get("context", ""))
    return {"ok": True, **result}


@app.post("/api/recover/cleanup")
async def recover_cleanup(req: CleanupRequest):
    """Recover, Part A. Generate a clean-up / re-entry slideshow plan, grounded in
    official return-home / clean-up guidance. Deterministic fallback baked in.

    If the user attached an insurance/FEMA/aid document, it's run through the
    deterministic extractor first (computed deadlines, required proof, contacts)
    and folded into the plan so the paperwork phase cites the real specifics."""
    doc_text = (req.documentText or "").strip()
    # No pasted text but a photo of the letter? OCR it to text first, then treat it
    # exactly like a pasted document (auto-redact + David's extraction).
    if not doc_text and req.documentImages:
        doc_text = (await ai.ocr_document_text(req.documentImages)).strip()
    doc_analysis = None
    redactions: list[str] = []
    if doc_text:
        doc_text, redactions = recovery.redact_sensitive_data(doc_text)
        as_of = (_parse_iso(req.now) or datetime.now(timezone.utc)).date()
        doc_analysis = recovery.paperwork_mock(doc_text, disaster=req.hazardType, as_of=as_of)

    # Situation-aware retrieval: the damage categories + the user's free-text
    # description re-rank the cached recovery chunks toward their actual mess.
    extra = keywords_from_text(
        " ".join([*(req.damageCategories or []), getattr(req, "situationText", "") or ""])
    )
    rag = await fetch_recovery_rag(req.hazardType, extra_keywords=extra)
    plan = await ai.synthesize_cleanup(req, rag_context=rag.get("context", ""), doc_analysis=doc_analysis)
    return {"ok": True, "recommendation": plan, "rag_sources": rag.get("sources", []), "redactions": redactions}


@app.post("/api/recover/followup")
async def recover_followup(req: RecoveryFollowUpRequest):
    """Follow-up on the clean-up plan: add a step (instruction) or answer a question.
    Grounded in the same recovery RAG context as the plan."""
    rag = await fetch_recovery_rag(req.hazardType)
    result = await ai.recovery_follow_up(req, rag_context=rag.get("context", ""))
    return {"ok": True, **result}


@app.post("/api/recover/paperwork")
async def recover_paperwork(req: PaperworkRequest):
    """Recover, Part B. Analyze recovery paperwork. Auto-redacts likely-sensitive
    data (SSNs, full policy/claim numbers, bank data, addresses, credentials) before
    any analysis, then continues; AI extraction with a deterministic regex fallback."""
    # No pasted text but a photo/PDF of the letter? OCR it first, then treat it
    # exactly like pasted text (auto-redact + extraction) — same as clean-up intake.
    if not (req.documentText or "").strip() and req.documentImages:
        req.documentText = (await ai.ocr_document_text(req.documentImages)).strip()
    clean, redactions = recovery.redact_sensitive_data(req.documentText or "")
    req.documentText = clean  # everything downstream sees only the scrubbed text
    rag = await fetch_recovery_rag(req.hazardType)
    analysis = await ai.analyze_paperwork(req, rag_context=rag.get("context", ""))
    return {"ok": True, "analysis": analysis, "redactions": redactions}


@app.get("/api/demo/coords")
async def demo_coords():
    return mock.DEMO_COORDS


@app.get("/")
async def root():
    return {"service": "Crisis-to-Action API", "docs": "/docs", "health": "/api/health"}
