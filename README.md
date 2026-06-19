# Prepaster

> **Turn a stressful disaster alert into a manageable plan.**
> When a disaster alert fires, what do you actually *do* - right now, from exactly where you're standing?

Official warning systems are excellent at telling you *that* something is coming and almost
useless at telling you what to do about it from your specific spot. Prepaster closes
that gap. It takes your location and an alert, triages **how much time you have**, runs a
**hazard-specific decision module** over live geospatial data, and returns **one calm,
plain-language action plan** - drawn over a satellite map, grounded in official safety
guidance, and resilient enough to keep working when the network doesn't.

> Why it's built the way it is - minimalism, calm, and AI safety - is laid out in
> [`DESIGN_PHILOSOPHY.md`](DESIGN_PHILOSOPHY.md). (The backend service is internally
> titled "Crisis-to-Action API" - same project, earlier working name.)

**Four hazards, two response patterns, one engine:**

| Hazard | Pattern | Core action | Live data it reasons over |
|---|---|---|---|
| 🌊 Flood | routing | Move to higher ground | Elevation rings (Open-Meteo), safe buildings (Overpass) |
| 🔥 Wildfire | routing | Move away from the fire, accounting for wind | Fire detections (NASA FIRMS), wind (Open-Meteo), safe buildings |
| 🌪️ Tornado | shelter | Get to the lowest, most interior room | Nearest sturdy building (Overpass) |
| 🟤 Earthquake | shelter | Drop, cover, hold; then open ground if unsafe | Recent quakes (USGS), open spaces (Overpass) |

Flood and wildfire do genuine geo-computation; tornado and earthquake provide correct,
time-aware shelter guidance plus a nearest-shelter / open-ground lookup. The app **never fakes
computation where the right answer is "shelter in place."**

The product runs in **three acts** — *Receive* an alert, *Respond* with a plan, and **Recover**
once the danger has passed. The Recover phase adds two post-disaster tools (a clean-up / re-entry
guide and an insurance / aid paperwork helper) on top of the same deterministic-first, RAG-grounded
engine — see [Recovery](#recovery-after-the-danger-passes).

---

## Table of contents

1. [Core ideas](#core-ideas)
2. [Features](#features)
3. [How it works - the pipeline](#how-it-works--the-pipeline)
4. [Workflow & data-flow diagram](#workflow--data-flow-diagram)
5. [Project structure (file-by-file)](#project-structure-file-by-file)
6. [Technical specification](#technical-specification)
7. [Built with](#built-with)
8. [Running it locally](#running-it-locally)
9. [Configuration](#configuration)
10. [API reference](#api-reference)
11. [Design philosophy](#design-philosophy)
12. [Known limitations](#known-limitations)

---

## Core ideas

Three principles shape every decision in the codebase:

- **Deterministic first, AI second.** Every hazard module computes a complete, correct,
  rule-based recommendation *before* the AI is ever called. The AI's job is to *refine* that
  into one calm instruction - never to be the only thing standing between a user and a safe
  action. If the AI is unconfigured, times out, or returns garbage, the deterministic plan is
  shown instead. The app never hangs and never shows nothing.
- **Time is the primary variable.** The same hazard demands totally different advice depending
  on whether you have 10 minutes, 1 hour, or 6 hours. Everything is keyed off a three-level
  **time tier** (`RUN` / `ACT` / `PREPARE`).
- **From exactly where you're standing.** Generic "move to higher ground" is useless. The app
  reasons over *your* coordinates: which way the ground actually rises, which sturdy building
  is closest, where the fire is relative to the wind.

---

## Features

### Marketing landing page
Before the app shell, a standalone, scroll-told **landing page** (`Landing.jsx`) introduces
Prepaster: a hero, a one-line product thesis (*warnings tell you that something is coming;
Prepaster tells you what to do*), and one animated SVG scene per hazard with a plain-language
"if it strikes" line. **Launch Prepaster** drops into the app. It's deliberately minimal -
the first proof that the app won't overwhelm you (see [`DESIGN_PHILOSOPHY.md`](DESIGN_PHILOSOPHY.md)).

### Five ways in (home screen)
- **Check live alerts near me** - uses your location to look for an active alert right now,
  dispatching across sources **in order**: **NWS** (US weather) → **Environment and Climate
  Change Canada (ECCC)** (Canada weather) → **USGS** (recent significant earthquakes near you,
  global) → **NASA FIRMS** (active-fire detections near you, global). The first source that
  matches wins (`APIs/alerts.fetch_alert`).
- **Disaster Response (real)** - upload a screenshot of the emergency alert on your phone. A
  multimodal model reads the hazard, severity, urgency, and any official instruction straight from
  the image. You provide your location (GPS or typed coordinates). Works anywhere.
- **Recover after a disaster** - the danger has passed. Pick what you went through and get a safe
  clean-up & re-entry guide, a recovery **assistant** for any question, and on-demand analysis of an
  insurance / FEMA / Canadian provincial-aid letter (paste it or photograph it). See
  [Recovery](#recovery-after-the-danger-passes).
- **Demo Disaster Response** - two sub-modes behind a toggle on the demo screen:
  - *Synthetic alert* - pick a hazard + how much time + a location; the app generates a
    realistic, NWS-shaped synthetic alert at a curated test site with real terrain
    (Boulder / Santa Rosa / Oklahoma City / San Francisco), or at your own GPS location. The
    generated alert is shown **side-by-side with a real NWS screenshot** of the same hazard so you
    can compare the synthetic generator against the real thing (flood / tornado / earthquake;
    wildfire is omitted - it's a fire-*weather* product, see [Known limitations](#known-limitations)).
  - *Simulate a real, active disaster* - scans live feeds for up to **5 real disasters happening
    right now** (NWS warnings + USGS quakes), **diversified across hazard types**, and lets you
    pick which one to stand next to. Live data, simulated location.
- **How it works** - an in-app explainer (`InstructionsLanding.jsx`) of what actually happens when an
  alert fires: official-guidance grounding, the four-phase plan, the map mechanics, and the
  question/update boxes.

The emergency number shown throughout is derived from the reverse-geocoded country (911 in the
US + Canada; falls back sensibly elsewhere).

### Decision engine
- **Time triage** into `RUN` (≈10 min), `ACT` (≈1 hr), `PREPARE` (≈6 hr), each with its own
  plan shape.
- **`RUN` tier: instant guidance + background plan** - for imminent threats the app shows
  hardcoded, instantly-rendered life-safety guidance with zero API dependency *first*. Then,
  **assuming the user is already performing that reflex**, it kicks off the full module + AI
  pipeline in the background (`runFollowOn=true`) to produce the *next-steps* plan ("While you
  move - your next steps") - getting to real safety and what to do once the danger passes -
  without repeating drop/cover/flee. The immediate guidance is never blocked by this.
- **One-tap, vulnerability-aware resource check** - mobility (vehicle vs foot), at-home,
  slow-movers, supplies, **plus** limited mobility, medical / powered-equipment needs, and
  dependents. No typing; a frightened person won't type. These reshape the plan: someone with no
  vehicle gets walking/transit options, limited mobility buys more lead time and accessible routes,
  medical needs trigger power-loss planning, and dependents are never left behind.
- **Four hazard modules** computing real escape vectors, high-ground directions, nearest
  shelters, and open-ground assembly points.
- **Real-time clock grounding** - every plan generation and follow-up passes the user's
  current time (and the alert's `expires` when known) to the AI, so time estimates land in
  real clock time ("runs until ~9:45 PM, about 40 minutes") and follow-up questions like
  *"do I still have time?"* are answered with the **actual minutes remaining** rather than a
  vague reply. Demo alerts also surface their active window ("in effect until 4:45 PM") on the
  notification card.

### The plan
- **Step-by-step slideshow** organized into four phases (Preparation → Evacuation/Brace →
  At Shelter → After), each step with a title, plain summary, time estimate, and an
  expandable detailed checklist.
- **Live satellite map** (Leaflet) with the danger polygon, elevation rings, fires, wind
  vector, candidate buildings, the chosen destination, and a real road route (OSRM). The
  "you are here" marker shows a **live facing cone** from the device compass, so a "head
  north-east" instruction maps to a direction you can physically see.
- **"Ask anything" assistant** - a Q&A box with tappable suggestion chips ("How much time do I
  have?", "What should I bring?") plus free-text questions ("Is it safe to use the elevator?"),
  answered concise and RAG-grounded without regenerating the plan.
- **"Need more guidance?"** - append extra plan steps on demand.
- **Concerns / plan updates** - "Roads near me are flooded" / "I have pets" regenerates the
  whole plan with that context folded in.
- **Live alert-state watching + all-clear handoff** - while a plan is open the client re-checks
  the alert every 30s (`POST /api/alert/status`). If it's **upgraded** it surfaces an "act now"
  banner; if it's **downgraded / changed** it says so; and once it has **cleared or expired** it
  offers a one-tap handoff straight into Recover - so the danger passing becomes the bridge between
  Respond and Recover instead of a dead end. (Demo plans decide on the alert's expiry clock; live
  plans re-fetch the real feed.)
- **Hazard-zone route avoidance** - for routing hazards, each candidate destination is checked to
  see whether the straight-line path crosses the warned polygon (`Calc/route.py`); the planner is
  told to prefer a destination with a clear path rather than the nearest exit through the danger.
- **Share plan** - Web Share API on mobile, clipboard / SMS fallback on desktop.

### Accessibility & inclusion
- **Read-aloud** - every plan slide, the RUN life-safety card, and the deterministic fallback
  plan have a speaker button (Web Speech `SpeechSynthesis`), for a person who is moving or can't
  read the screen.
- **Voice input** - the question, add-a-step, and "something changed" boxes accept dictation
  (`SpeechRecognition`), so no typing is required under stress.
- **EN / FR toggle** - the plan, headline, and follow-up Q&A render in French (US + Canada
  coverage; Canada is officially bilingual). The **offline deterministic fallback is also
  bilingual** (`modules._plan_fr`), so French survives a total AI outage.
- **Device facing cone** - the user marker tracks the device compass so directions map to where
  the person is physically pointed. All four affordances degrade silently where the browser
  lacks speech / orientation support.

### Grounding & freshness
- **RAG over government sources** - scrapes Ready.gov / FEMA / NWS / USGS / CAL FIRE / NOAA
  pages, scores paragraphs by hazard keywords, and feeds the top chunks to the AI so critical
  details (depth thresholds, drop-cover-hold sequence) match official wording.
- **Two-tier RAG cache** - a 24-hour in-memory cache plus a 30-day on-disk cache, with
  urgency-aware selection so urgent tiers never block on a web fetch.
- **Real-flow local news** - live alerts pull recent headlines (Google News RSS) so the plan
  can reference real road closures / open shelters.

### Resilience
- **Offline-capable PWA** - a service worker caches the app shell; the last generated plan is
  saved to `localStorage` and can be resumed offline from the home screen.
- **Graceful degradation everywhere** - every external API wrapper returns an `ok: False`
  shape on failure instead of raising; the pipeline always produces *something*.

### Recovery (after the danger passes)
A third act, reached from the **Recover after a disaster** card (or the all-clear handoff from a
live plan) and built on the same deterministic-first, RAG-grounded engine as the response flow.
Pick the hazard, and you get **one cohesive surface**: a clean-up plan, a recovery assistant, and
insurance/aid paperwork analysis woven through both (`RecoverHub.jsx` → `RecoverCleanupIntake.jsx`
→ the clean-up result page).

- **Clean-up & re-entry guide** - describe what you're seeing and optionally attach damage photos.
  The app returns a phased **slideshow plan** (*before you go back in → first walk-through / document
  everything → clean up → health, records & next steps*) in the exact same `{summary, steps[]}` shape
  the response Slideshow renders - so read-aloud, "need more guidance," and follow-up Q&A all work
  identically. Grounded in official **return-home / clean-up** sources (Ready.gov, CDC, EPA,
  Earthquake Country Alliance) via a dedicated recovery RAG tier, with a bilingual deterministic
  fallback baked in (`recovery.cleanup_fallback`).
- **Attach a letter at intake → folded into the plan** - the intake has an optional box to **paste
  or photograph** an insurance letter, FEMA decision, or Canadian provincial disaster-assistance
  letter. A photo is OCR'd to text first (`ai.ocr_document_text`); the text is auto-redacted, run
  through the extractor, and its **computed deadlines, required proof, and contacts are handed to the
  clean-up AI**, which weaves the real specifics into the plan's paperwork phase (e.g. *"submit proof
  of loss by Apr 30 — 12 days left"*) instead of generic "start your claim" advice.
- **Recovery "Ask anything" assistant** - the same suggestion-chip Q&A box as the response flow,
  recovery-flavored, plus an on-demand **insurance/FEMA/aid letter** analysis that renders a full
  structured result inline (`PaperworkBox.jsx` → `PaperworkResult.jsx`).
- **The paperwork engine** (`recovery.py`, the deterministic floor under `ai.analyze_paperwork`):
  - **Computed deadlines** - parses absolute dates *and* resolves relative ones ("within 60 days of
    the date of this letter") against trigger dates in the text into a real date, **days remaining,
    and an urgency tier**. On the AI path it's a *hybrid*: the model **extracts** the structure
    (`trigger_date`, `offset_days`), code **computes** the arithmetic and merges with the regex pass,
    so a hallucinated date can't reach the user (`reconcile_deadlines` / `merge_deadlines`).
  - **Document classification** - weighted phrase scoring with guardrails (`classify_document`) →
    primary type + confidence + alternatives.
  - **Classified, de-junked contacts** - typed as phone / email / portal / mailing address / named
    adjuster / actionable claim department, with "contact trap" filtering, plus **issuer
    identification with confidence** (`extract_contact_details` / `identify_issuer_details`).
  - **Scanned-doc detection** - `has_meaningful_extracted_text` flags an image-only upload.
- **Privacy guardrail — auto-redact, don't reject** - `recovery.redact_sensitive_data()` scrubs
  likely SSNs, bank/card/account numbers, full policy/claim numbers, exact addresses, and login
  credentials to `[REDACTED]` **before any text reaches the model** (including OCR'd photo text), then
  continues and shows a notice of what was removed. The extraction doesn't need the PII (phone/email
  contacts survive), so the user proceeds instantly instead of hand-editing the document.
- **Responsible-AI framing** - every paperwork result carries an explicit *"this tool explains, it
  does not decide"* note and a **human-review-required** list (adjuster / FEMA / contractor / legal
  aid), localized EN/FR, so it never poses as a coverage, eligibility, legal, or structural-safety
  determination.

### Transparency (demo mode)
- **Activity Log** sidebar shows every API call, every data point retrieved, and every
  decision in real time - in a "Tidy" human view or a "Raw" payload-inspection view.

---

## How it works - the pipeline

The whole app is **one spine** that both entry paths converge on. The stages:

| Stage | Name | Where | What happens |
|---|---|---|---|
| **1** | Hazard detection | `hazards.detect_hazard` (NWS) or `ai.analyze_screenshot` (vision) | Identify which of the four hazards this is |
| **2** | Time triage | `Calc/triage.compute_time_tier` | Map alert fields → `RUN` / `ACT` / `PREPARE` |
| **3** | Resource check | `components/ResourceCheck.jsx` | One-tap questions about the user's situation (mobility, at-home, slow-movers, supplies + limited mobility / medical needs) |
| **4** | Hazard module | `modules.run_module` | Gather live geo-data → `data` (map) + `deterministic` (rule-based plan) |
| **5** | Synthesis | `APIs/rag` + `ai.synthesize` | RAG fetch → one AI call → refined plan (deterministic fallback baked in) |

For `RUN` tier, `Calc/guidance.run_guidance` renders **instantly** after Stage 2 (no waiting on
anything). In parallel the app still runs Stages 4–5 in the background with `runFollowOn=true`, so
a "what next" plan streams in *underneath* the life-safety card once ready. The two are decoupled:
the life-safety reflex is never gated on a network call.

**Recovery is a separate, shorter spine** (it has no live alert or map). The clean-up tool runs one
recovery-RAG fetch + one AI call (`ai.synthesize_cleanup`, falling back to `recovery.cleanup_fallback`)
to produce the same `{summary, steps[]}` plan the Slideshow renders. If a letter is attached at intake,
it's OCR'd (photo → text) if needed, **auto-redacted** (`recovery.redact_sensitive_data`), extracted
(`recovery.paperwork_mock` — computed deadlines, classification, classified contacts), and that
structured analysis is passed into `synthesize_cleanup` so the plan cites the real deadlines. The
paperwork analysis (assistant box) is the same: redact → one recovery-RAG fetch + one AI call
(`ai.analyze_paperwork`, falling back to `recovery.paperwork_mock`), with the **LLM-extracts /
code-computes** deadline hybrid reconciled in `recovery.reconcile_deadlines`. Both reuse the two-tier
RAG cache under a namespaced `recovery:<hazard>` key. Separately, an open plan polls
`POST /api/alert/status` (`Calc/watch.py`) to react to escalation/clearing and offer the Recover
handoff. See [Recovery](#recovery-after-the-danger-passes).

---

## Workflow & data-flow diagram

```
        ┌─────────────────────────────────────────────────────────────────────────┐
        │                          HOME SCREEN (HomeLanding.jsx)                    │
        │  Check live alerts  ·  Disaster Response  ·  Demo Disaster Resp.  ·  How  │
        │  (resume saved plan if one exists ◄──────────────────────────────────────┼── localStorage
        └────┬───────────────┬──────────────────┬──────────────────────┬──────────┘
   REAL PATH │     live alerts│       How it works│              DEMO PATH│ (StartScreen.jsx)
             ▼                ▼                   ▼            ┌──────────┴──────────┐
   ScreenshotIntake     (your GPS)    InstructionsLanding.jsx synthetic        real active
   (image + GPS)             │             (static explainer)  │           │ GET /api/demo/live/list
             │              ▼ POST /api/alert      │           │           ▼ discover.find_active_
             │       alerts.fetch_alert()          │           │             disasters() → up to 5
             ▼ POST   (NWS→ECCC→USGS→FIRMS)        │           │             (NWS+USGS, diversified)
   analyze_screenshot       │                      │           │           ▼ DisasterPicker.jsx
   (vision → Situation)     │                      │  POST /api/alert       (user picks one)
             │              │                      │  mock.mock_alert  ┌────┘
             │              │             NotificationCard.jsx (demo: generated-vs-real compare)
             └──────┬───────┴──────────────────────┬───────────┴───────┘
                    ▼                               ▼
                STAGE 2  Calc/triage.compute_time_tier()  ──►  RUN / ACT / PREPARE
                    │
        ┌───────────┴───────────────────────────────┐
   RUN  ▼ (renders instantly)                        ▼  ACT / PREPARE
  guidance.run_guidance()                   STAGE 3  ResourceCheck.jsx
  RunGuidance.jsx                           (mobility, atHome, slow, supplies)
        │                                            │
        │ background, runFollowOn=true               ▼  POST /api/module
        └────────────────────┐         ┌──────────────────────────────────────────────┐
                             ▼         │ STAGE 4  modules.run_module()                 │
                  (same Stages 4–5)    │  ├─ flood ──► elevation_api + places_api      │
                             │         │  ├─ wildfire► firms + wind + places           │
                             │         │  ├─ tornado ► places (nearest sturdy bldg)    │
                             │         │  └─ quake ──► usgs + open_spaces              │
                             │         │  build_plan() → deterministic summary+steps   │
                             │         │  ⇢ fire-and-forget: _prewarm_rag() warms cache│
                             │         └───────────────┬──────────────────────────────┘
                             │                         │  returns {data, deterministic}
                             │           ┌─────────────┴──────────────┐
                             │           ▼                            ▼
                             │  CrisisMap.jsx draws         STAGE 5  POST /api/recommend
                             │  immediately (no AI wait)    ┌──────────────────────────────────┐
                             │                              │ news.fetch_news()  (live only)    │
                             └─────────────────────────────│ rag.fetch_rag_context() (cached)  │
                               runFollowOn steers the      │ ai.synthesize()  ── 1 AI call ──┐ │
                               prompt to skip the reflex    │   success → AI plan             │ │
                               and plan "what next"         │   fail/timeout → deterministic ◄┘ │
                                                            └───────────────┬───────────────────┘
                                                                            ▼
                                              Slideshow.jsx + CrisisMap.jsx (route via OSRM)
                                                      │
                              ┌───────────────────────┼───────────────────────┐
                              ▼                        ▼                        ▼
                       QuestionsBox            ConcernsBox              "Need more guidance?"
                    POST /api/follow-up     POST /api/recommend        POST /api/follow-up
                    (mode=question,RAG)     (with userNote)            (mode=instruction)
                              └───────────────────────┴───────────────────────┘
                                          plan persisted to localStorage  ──►  (offline resume)
```

**Data shapes that flow through the spine:**

- `Situation` - parsed alert: `{event, hazardType, severity, urgency, certainty, onset,
  expires, description, instruction, officialEvacOrder, areaPolygon, inZone, source}`
- Module envelope - `{pattern, data, deterministic}` where `data` is hazard-specific (for the
  map + AI context) and `deterministic` is a `Recommendation`-shaped dict plus a `summary` +
  `steps` slideshow plan.
- `Recommendation` - the final plan: `{headline_action, destination_name, direction, distance,
  reason, supplies_enroute, confidence, uncertainty_note, official_order_*, dest_lat, dest_lon,
  responsePattern, engine, summary, steps}`.

---

## Project structure (file-by-file)

```
usaii/
├── backend/                      FastAPI service (Python)
│   ├── app/
│   │   ├── main.py               API entrypoint: routes, CORS, RAG prewarm, news wiring
│   │   ├── models.py             Pydantic request/response schemas (the data contract)
│   │   ├── hazards.py            Hazard detection from event text + response-pattern map
│   │   ├── mock.py               Demo Mode: synthetic NWS-shaped alerts per hazard × tier
│   │   ├── modules.py            Stage 4 - the four hazard decision modules + build_plan()
│   │   ├── ai.py                 Stage 5 + Recover - vision parse, AI synthesis, follow-up, OCR, recovery calls (OpenRouter)
│   │   ├── recovery.py           Recover floor - clean-up plans, paperwork engine (computed deadlines, classification, contacts), auto-redaction
│   │   ├── ratelimit.py          Per-IP + global rate-limit middleware (AI-budget guard)
│   │   ├── Calc/
│   │   │   ├── triage.py         Stage 2 - alert fields → RUN/ACT/PREPARE
│   │   │   ├── guidance.py       RUN-tier hardcoded life-safety guidance (ultimate fallback)
│   │   │   ├── watch.py          Alert-state diff for /api/alert/status (escalated/cleared + Recover handoff)
│   │   │   ├── route.py          Hazard-zone route avoidance (does the path cross the warned polygon?)
│   │   │   ├── places.py         Public-place finder (drops the simulated user somewhere real)
│   │   │   └── geo.py            Geo math: offset_point, haversine, bearing, point-in-polygon
│   │   └── APIs/                 External-data adapters (each never raises)
│   │       ├── alerts.py         Live-alert dispatcher (NWS → ECCC → USGS → FIRMS, in order)
│   │       ├── nws.py            NWS active-alerts fetch + parse + in-zone test
│   │       ├── eccc.py           Environment Canada (GeoMet) city-page warnings → Situation
│   │       ├── discover.py       "Active disasters now" finder for the simulate flow (1 or up to 5)
│   │       ├── elevation.py      Open-Meteo elevation-ring reasoning (high-ground vector)
│   │       ├── places.py         Overpass safe-building / supply / open-space lookup
│   │       ├── firms.py          NASA FIRMS active-fire detections (needs free key)
│   │       ├── wind.py           Open-Meteo current wind (direction fire is pushed)
│   │       ├── usgs.py           USGS recent-earthquake confirmation feed
│   │       ├── rag.py            Gov-page scraper + scorer + two-tier cache
│   │       └── news.py           Google News RSS headlines for the live flow
│   ├── requirements.txt          Python dependencies
│   └── .env.example              Template for OPENROUTER_API_KEY / FIRMS_MAP_KEY
│
├── frontend/                     React + Vite SPA
│   ├── index.html                HTML shell, manifest + theme-color + fonts
│   ├── vite.config.js            Vite config + /api proxy to the backend
│   ├── package.json              JS dependencies + scripts
│   ├── public/
│   │   ├── sw.js                 Service worker (offline app-shell cache)
│   │   ├── manifest.webmanifest  PWA manifest (installable)
│   │   ├── icon.svg              App icon
│   │   └── examples/             Real NWS alert screenshots for the demo compare view
│   │       ├── flood.jpg         (flood / tornado / earthquake; no wildfire - fire-weather)
│   │       ├── tornado.jpg
│   │       └── earthquake.jpg
│   └── src/
│       ├── main.jsx              React entry; registers the service worker
│       ├── App.jsx               Root state machine: phases, all flows, persistence, share
│       ├── api.js                Thin fetch wrappers around the backend (with logging)
│       ├── hazards.js            Hazard metadata (labels, icons, demo coords, patterns)
│       ├── geoutil.js            Client-side offsetPoint (for drawing map arrows)
│       ├── i18n.js               EN/FR string table + makeT(lang) translator factory
│       ├── speech.js             Web Speech wrappers: read-aloud (TTS) + dictation (STT) hook
│       ├── logBus.js             Tiny pub/sub bus for the Activity Log
│       ├── styles.css            Core app styles + the design tokens (light "bone" theme, one green)
│       ├── landing.css           Marketing landing page styles (hero, hazard scenes)
│       ├── home-landing.css      App home-screen styles
│       ├── recover.css           Recover-flow styles (hub, intake, paperwork, deadline cards)
│       ├── technical-docs.css    "Technical specification" page styles
│       └── components/
│           ├── Landing.jsx       Standalone marketing landing page (shown before the app)
│           ├── HomeLanding.jsx   App home screen: entry cards + offline "resume" banner
│           ├── InstructionsLanding.jsx  "How it works" page (links to the technical spec)
│           ├── TechnicalDocs.jsx  Full system spec rendered as a page (visual diagrams)
│           ├── RecoverHub.jsx    Recover flow: pick the hazard → clean-up guide + assistant
│           ├── RecoverCleanupIntake.jsx  Recover intake: damage, notes, photos, + an insurance/aid letter (paste/photo) → plan
│           ├── PaperworkBox.jsx  Optional standalone letter-analysis box (paste → structured result)
│           ├── PaperworkResult.jsx  Shared renderer: computed deadline cards, classification, contacts
│           ├── RecoverPaperwork.jsx  Former standalone paperwork page (dormant; superseded by assistant + box)
│           ├── StartScreen.jsx   Demo config: synthetic-alert / real-active-disaster toggle
│           ├── DisasterPicker.jsx  Live "active disasters now" chooser (up to 5)
│           ├── ScreenshotIntake.jsx  Real flow: image upload + location capture
│           ├── NotificationCard.jsx  Alert preview (demo: generated-vs-real screenshot compare)
│           ├── ResourceCheck.jsx     Stage 3 one-tap questions
│           ├── RunGuidance.jsx       RUN-tier instant life-safety card
│           ├── Slideshow.jsx         Step-by-step plan with phases + checklists
│           ├── CrisisMap.jsx         Leaflet map: tiles, overlays, route
│           ├── QuestionsBox.jsx      "Ask anything" assistant: robot mark, suggestion chips, optional letter analysis
│           ├── ConcernsBox.jsx       Plan-update note → regenerate
│           ├── ActivityLog.jsx       Demo-mode transparency sidebar
│           ├── MicButton.jsx         Self-hiding voice-dictation button (feature-gated)
│           └── Icon.jsx              Inline SVG icon set
│
├── README.md                     This file
├── DESIGN_PHILOSOPHY.md          Why it's built this way (minimalism, calm, AI safety)
└── DEPLOYMENT.md                 Build + deploy notes (frontend → Vercel, backend → PythonAnywhere)
```

### Backend, in detail

- **`main.py`** - Declares the FastAPI app, the **rate-limit middleware**, **origin-restricted
  CORS** (the known frontends, overridable via `CORS_ALLOW_ORIGINS`), and all routes
  (`/api/health`, `/api/alert`, `/api/alert/status`, `/api/analyze_screenshot`, `/api/module`,
  `/api/recommend`, `/api/follow-up`, `/api/recover/cleanup`, `/api/recover/followup`,
  `/api/recover/paperwork`, `/api/demo/live`, `/api/demo/live/list`, `/api/demo/live/place`,
  `/api/demo/coords`). `/api/alert/status` re-checks the alert a user is viewing and returns what
  changed + a `recoverSuggested` flag for the all-clear handoff. Hosts the
  **fire-and-forget RAG prewarm** spawned from `/api/module` and the **live-news enrichment** in
  `/api/recommend`. A `_live_payload()` helper shapes one discovered disaster into the same
  envelope as `/api/alert` (situation + tier + simulated `lat`/`lon`/`locationLabel`), reused by
  both the single (`/api/demo/live`) and multi (`/api/demo/live/list`) endpoints.
- **`ratelimit.py`** - Dependency-free, in-memory sliding-window rate limiter (Starlette
  middleware). Three layers: a per-IP cap on all endpoints, a tighter per-IP cap on the paid
  AI endpoints (`/recommend`, `/analyze_screenshot`, `/follow-up`), and a **global ceiling**
  across all clients on those AI endpoints - so even forged source IPs can't run the
  OpenRouter budget away. `/api/health` is exempt. Returns `429` with `Retry-After`.
- **`models.py`** - The single source of truth for every wire shape: `Resources` (mobility,
  at-home, slow-movers, supplies + the **vulnerability fields** `hasVehicle`, `mobilityLimited`,
  `medicalNeeds`, `dependents`), `Situation`, `AlertRequest`, **`AlertStatusRequest`** (the viewed
  alert + `now` + `demo`, for live alert-watching), `ScreenshotRequest`, `ModuleRequest` (carries
  `timeTier` so the deterministic plan can't contradict the AI), `RecommendRequest` (carries
  `userNote`, `newsContext`, `locationLabel`, **`runFollowOn`** - the RUN-tier "they're already
  moving, plan what's next" flag - and **`now`** for real-time grounding), `FollowUpRequest` (also
  carries `now`, `expires`, and a human `planAge`), `Recommendation`, and the three **Recover**
  schemas (`CleanupRequest` - hazard + damage categories + free text + capped damage photos +
  **`documentText` / `documentImages` / `now`** for an attached insurance/aid letter;
  `RecoveryFollowUpRequest`; `PaperworkRequest` - capped document text + insurer/claim status +
  `now`). Every free-text, image, and list field is length/size-capped so no endpoint can be abused
  as a free vision proxy or to inflate prompt cost.
- **`hazards.py`** - `detect_hazard()` maps an NWS event string to one of the four hazards via a
  keyword table (`"red flag"`/`"fire"` → wildfire, etc.); `response_pattern()` maps a hazard to
  `routing` or `shelter`. Note: warning-vs-watch is **not** distinguished here - both map to the
  same hazard; the distinction is made downstream in `Calc/triage`.
- **`mock.py`** - Per-hazard test coordinates and an `event/severity/urgency/certainty + copy`
  table for each hazard × tier, so triage keys off realistic fields. Seeds realistic
  `onset`/`expires` timestamps. Also seeds demo fire detections for the wildfire scenario.
- **`modules.py`** - The heart of Stage 4. `_flood` (elevation + safe buildings, prefers higher
  ground, handles flat terrain → vertical evacuation), `_wildfire` (fire centroid + wind →
  escape vector → safe building not toward the fire), `_tornado` (nearest sturdy building within
  a walk/drive cutoff, else shelter-in-place), `_earthquake` (drop-cover-hold + nearest open
  ground + USGS confirmation). `build_plan()` turns the deterministic recommendation into a
  phased slideshow tailored to tier + resources.
- **`ai.py`** - All OpenRouter calls. `analyze_screenshot()` (vision → `Situation`),
  `synthesize()` (the one Stage-5 call: builds a compact JSON context from module data + RAG +
  news, enforces a strict JSON contract, falls back to deterministic on any failure),
  `follow_up()` (RAG-grounded add-a-step or answer-a-question). `_timing_context()` turns the
  client `now` + alert `expires` into a `timing` block (minutes until/since expiry, active/expired
  status) injected into both call sites. Contains the SYSTEM prompt with the expert FEMA/NWS/USGS
  constraints and the tier rules - including a **vulnerability rule** (adapt to `mobilityLimited` /
  `medicalNeeds` / `dependents` / no-vehicle) and a **route-advisory rule** (don't route through the
  warned polygon, using the per-candidate `path_crosses_warned_area` flags `_candidates()` injects
  from `Calc/route.py`). When `runFollowOn` is set, `_candidates()` injects the hazard's immediate
  life-safety lines as `immediate_actions_underway` and `synthesize()` swaps in a prompt *lead*
  telling the model to assume those are done and plan the next steps. The **Recover** flow adds more
  OpenRouter call sites here: `synthesize_cleanup()` (clean-up / re-entry plan; takes an optional
  `doc_analysis` of an attached letter and weaves its computed deadlines into the plan),
  `recovery_follow_up()`, `analyze_paperwork()` (paperwork extraction, with the LLM-extracts /
  code-computes deadline reconciliation), and `ocr_document_text()` (vision OCR of a photographed
  letter → plain text) - each enforcing a strict JSON contract and falling back to `recovery.py`.
- **`recovery.py`** - The deterministic floor for the Recover flow, mirroring how `modules.py` is the
  floor under `synthesize()`. `cleanup_fallback()` returns a hazard-keyed, four-phase clean-up plan in
  the Slideshow `{summary, steps[]}` shape. The **paperwork engine**: `paperwork_mock()` extracts a
  full analysis from a document; `extract_deadline_details()` **computes** deadlines (absolute +
  relative resolved against trigger dates → date, days-remaining, urgency), with `reconcile_deadlines()`
  / `merge_deadlines()` running the LLM-extracts/code-computes hybrid on the AI path;
  `classify_document()` scores the document type; `extract_contact_details()` / `identify_issuer_details()`
  pull classified, trap-filtered contacts + the issuer with confidence; `has_meaningful_extracted_text()`
  flags scanned-only uploads. `redact_sensitive_data()` is the **privacy guardrail** - it scrubs likely
  SSNs, bank/card/account numbers, full policy/claim numbers, exact addresses, and login credentials to
  `[REDACTED]` *before* any text reaches the AI (auto-redact-and-continue, not reject). Bilingual
  `human_review_required()` / `responsible_ai_note()`. Never touches the network.
- **`Calc/triage.py`** - Pure function mapping `(situation, hazard)` → `(tier, reason)`.
  Earthquakes are always `RUN`; tornado warnings are `RUN`; flash-flood/extreme + immediate is
  `RUN`; watches/future are `PREPARE`; warnings with lead time are `ACT`.
- **`Calc/guidance.py`** - Hardcoded, authoritative RUN-tier guidance per hazard. Also the last
  line of defense if everything else fails.
- **`Calc/geo.py`** - `offset_point`, `haversine_m`, `bearing_to_compass`, `point_in_polygon`,
  and the `COMPASS` table. Used across modules, elevation, and places. **`point_in_polygon()` is
  the threat-geometry primitive** (see below).
- **`Calc/route.py`** - Pure hazard-avoidance geometry. `segment_crosses_ring()` samples the
  user→destination line and tests whether it passes through the warned polygon; `route_advisory()`
  annotates the candidate destinations so the planner prefers one with a clear path instead of
  routing through the danger to save distance.
- **`Calc/watch.py`** - Pure alert-state comparison behind `/api/alert/status`. `evaluate()` diffs
  the alert a user is viewing against a freshly-fetched one (or its expiry clock in demo) and returns
  `state` (active / escalated / downgraded / changed / cleared / expired) + `recoverSuggested` for the
  Respond→Recover handoff.

#### Threat geometry - "am I in the warned area?"

Official weather warnings ship a **warned-area polygon** - the exact shape the alert applies to,
not a circle or a county name. Every weather feed is normalized to a single ring of `[lon, lat]`
vertices: NWS `_extract_polygon`, ECCC `_geom_to_ring` (`discover.py`), and the demo's `_box`
(`mock.py`). Earthquakes are the exception - a quake has no meaningful warning polygon, so that
module reasons from the epicentre and proximity instead.

- **In-zone test** - `geo.point_in_polygon(lat, lon, ring)` is a dependency-free **ray-casting**
  test: cast a ray east from the point and count polygon-edge crossings - **odd = inside,
  even = outside**. O(n) over the ring's vertices, exact, no geometry library.
- **Fail-safe default** - `nws.compute_in_zone()` wraps it; if a warning carries no polygon it
  returns `True` (assume affected). Under-warning someone is never the safe error.
- **Centroid anchor** - the ring's vertex average (`discover._centroid`) anchors the simulated
  user in the "stand me inside a real warning" demo and seeds the public-place search.
- **Place selection** - `places._select()` reuses the same test: candidate buildings *inside*
  the polygon are preferred, then ranked by distance to the centroid, so the person is dropped
  somewhere real and genuinely within the warned area.
- **Drawn, not zoomed** - the client (`CrisisMap.jsx`) renders the ring as a translucent red fill
  for context but deliberately does **not** let it drive the map zoom (a county-sized polygon
  would zoom the view uselessly far out); it fits the action points instead.
- **`APIs/alerts.py`** - The live-alert **dispatcher** behind "check live alerts near me".
  `fetch_alert(lat, lon)` tries sources in precedence order and returns the first hit: NWS (US
  weather; 400s outside the US, caught and skipped) → ECCC (Canada weather) → USGS (recent quake
  near the point, global) → FIRMS (active fire near the point, global, needs key). Quake and fire
  hits are wrapped into `Situation`s via `_quake_situation()` / `_fire_situation()`. Never raises.
- **`APIs/nws.py`** - Fetches `api.weather.gov/alerts/active`, parses features into
  `Situation`s, detects evacuation orders by keyword, extracts the alert polygon, and picks the
  most severe. `compute_in_zone()` ray-casts the user against the polygon.
- **`APIs/eccc.py`** - Environment Canada GeoMet city-page warnings. Resolves the nearest city
  page within a bounding box, normalizes its warnings, and maps them into a `Situation`. Returns
  nothing over US bboxes, so it never collides with NWS.
- **`APIs/discover.py`** - Powers the **"simulate a real, active disaster"** flow.
  `_nws_candidates()` pulls every active severe/extreme US warning with a polygon (placing the
  user at the polygon centroid); `_quake_candidates()` pulls recent significant global quakes
  (placing the user a few km off the epicentre). `find_active_disasters(limit=5)` groups
  candidates by hazard, shuffles the strong head of each group for run-to-run variety, then
  **round-robins across hazard types** so the returned list is diversified rather than five of the
  same kind. `find_active_disaster()` is the single-pick wrapper (random choice from the pool).
- **`APIs/elevation.py`** - Samples concentric rings (150/400/800 m) in 8 directions via
  Open-Meteo, averages gain per direction, and emits a `highGroundVector` + flat-terrain flag +
  per-ring samples for the map.
- **`APIs/places.py`** - Overpass queries (3 mirrors, failover) for hospitals / fire stations /
  community centres / schools (safe), pharmacies / supermarkets (supplies), and genuinely open
  land (grass / meadow / park) for earthquake assembly. Scores safe buildings by type,
  elevation gain, and distance.
- **`APIs/firms.py`** - NASA FIRMS VIIRS active-fire CSV within a bounding box; returns
  detections sorted by distance. Requires a free `FIRMS_MAP_KEY` (else the wildfire demo uses
  seeded fires).
- **`APIs/wind.py`** - Open-Meteo current wind; converts the "from" direction into the "toward"
  direction the fire is being pushed.
- **`APIs/usgs.py`** - USGS 2.5+/day GeoJSON feed; returns the nearest recent quake within range
  for confirmation context.
- **`APIs/rag.py`** - `HTMLParser`-based text extractor + keyword scorer over a curated list of
  government safety pages, behind a two-tier cache (24 h in-memory + 30-day file) with
  urgency-aware selection (see [Caching](#caching-strategy)). Carries a **second source set** for the
  Recover flow (`GOV_SOURCES_RECOVERY` - official return-home / clean-up pages: Ready.gov, CDC, EPA,
  Earthquake Country Alliance) read via `fetch_recovery_rag()`, cached under a namespaced
  `recovery:<hazard>` key so it never collides with the response-flow cache.
- **`APIs/news.py`** - Key-free Google News RSS search; cleans and returns a few recent
  headlines + snippets for the live flow.

### Frontend, in detail

- **`Landing.jsx`** - The standalone marketing landing page rendered before the app shell:
  a hero, the product thesis, and one scroll-animated SVG scene per hazard. **Launch Prepaster**
  hands off into `App.jsx`.
- **`App.jsx`** - The orchestrator. A phase state machine
  (`home → instructions | screenshot | demo → picker → notification → run | resource → result`,
  plus the parallel Recover branch `home → recover → recover_cleanup → recover_cleanup_result`),
  the live alert-watching poll + all-clear handoff banner (`getAlertStatus` every 30s while a plan is open),
  all the fetch flows, plan persistence to `localStorage`, offline resume, the ticking clock,
  reverse-geocoded location label (Nominatim), the share-plan logic, and demo news fake-fetch.
  Holds the **RUN follow-on** logic: `generateRunPlan()` fires once on entering the `run` phase
  (guarded by `runPlanStartedRef`), running the module + `/api/recommend` with `runFollowOn:true`
  and rendering the result under the instant `RunGuidance`. Also owns the live-simulate state
  (`liveOptions`) and `chooseLiveDisaster()`.
- **`api.js`** - `getHealth/getAlert/getAlertStatus/findLiveDisaster/findLiveDisasters/
  resolveLivePlace/analyzeScreenshot/runModule/getRecommendation/followUp` plus the Recover wrappers
  `getCleanupPlan/recoveryFollowUp/analyzePaperwork`, each emitting request/response events to the
  log bus with timings. `getRecommendation` passes its payload through unchanged, so `runFollowOn`
  flows to the backend without any wrapper change.
- **`CrisisMap.jsx`** - Leaflet map with switchable Satellite / Topo / Streets base layers,
  hillshade + contour overlays, and a redraw effect that lays down the danger polygon, elevation
  rings, fires, wind arrow, candidate buildings, open spaces, the destination pin, and a real
  OSRM road route (with a straight-line fallback). Includes a static compass rose. The "you are
  here" marker carries a **live facing cone**: a `deviceorientation` listener (iOS
  `webkitCompassHeading`, others derive from `alpha`, corrected for screen-rotation angle) rotates
  the cone via the DOM (ref-driven, throttled - no React re-render per tick) so heading updates
  stay cheap. iOS's permission gate is satisfied on first tap; with no sensor/permission the cone
  stays hidden.
- **`Slideshow.jsx`** - Summary slide + one slide per step, progress dots, "mark done"
  tracking, the "Need more guidance?" add-step panel, and the plan-updated badge. Each slide has a
  **read-aloud** button, and the add-step box has a **voice-dictation** mic; navigating away or
  between slides cancels narration.
- **`i18n.js` / `speech.js` / `MicButton.jsx`** - The accessibility layer. `i18n.js` is the EN/FR
  string table behind `makeT(lang)` (with `{var}` interpolation, falling back EN → key).
  `speech.js` wraps Web Speech: `speak()` / `stopSpeaking()` for read-aloud (TTS, broad support)
  and a `useDictation()` hook for voice input (STT, Chrome/Edge). `MicButton.jsx` is the
  self-hiding mic - it renders `null` where `SpeechRecognition` is unsupported - reused by the
  question, add-a-step, and "something changed" boxes.
- **`InstructionsLanding.jsx`** - The "How it works" page: official-guidance grounding (with a
  row of source chips), the four-phase plan, the time tiers, map mechanics, the questions box,
  plan updates, and the offline/share/fallback guarantees. Links through to **`TechnicalDocs.jsx`**,
  the full system spec rendered as a page with visual diagrams.
- **`StartScreen.jsx`** - Demo config with a segmented **synthetic-alert / real-active-disaster**
  toggle. Synthetic mode is the hazard/tier/location builder; real mode triggers the live scan and
  hands off to the picker.
- **`DisasterPicker.jsx`** - Renders up to 5 live disasters as selectable cards (hazard icon,
  event, location, severity, tier badge); choosing one simulates the user next to it.
- **`NotificationCard.jsx`** - Alert preview before analysis. In Demo Mode it renders the
  generated synthetic alert as a phone-style "screenshot" beside the matching real NWS example
  image (`/examples/*.jpg`) for a side-by-side comparison (no example → falls back to the plain
  card; wildfire has none).
- **`RecoverHub.jsx` / `RecoverCleanupIntake.jsx` / `PaperworkBox.jsx` / `PaperworkResult.jsx`** -
  the Recover flow. `RecoverHub` is the post-disaster landing: pick the hazard you went through and
  open the **clean-up & re-entry guide**. `RecoverCleanupIntake` collects damage categories, a
  free-text note, optional damage photos, **and an optional insurance/FEMA/aid letter** (paste, or
  upload a photo via the corner button), then hits `/api/recover/cleanup`. The result page renders
  the plan through the same `Slideshow`, the **"Ask anything" recovery assistant**, and a standalone
  `PaperworkBox` (paste or analyze a letter → structured result via `PaperworkResult`: the computed
  deadline cards with urgency, classification, classified contacts). Auto-redaction of sensitive data
  is surfaced as a notice rather than blocking. (`RecoverPaperwork.jsx` is the former standalone page,
  now superseded by the assistant + box and left dormant.) Recover phases live in `App.jsx` and keep
  `recoverHazard` apart from the response flow's `hazardType` so the two can't cross-contaminate.
- **`QuestionsBox.jsx`** - the **"Ask anything" assistant**: a chat-style box with a robot mark,
  tappable suggestion chips, and (when given a `paperwork` capability) an inline letter-analysis
  panel. Used on both Respond (FAQ chips) and Recover (recovery chips). Drop a `public/robot.png` to
  replace the built-in fallback glyph.
- **`HomeLanding / ScreenshotIntake / ResourceCheck / RunGuidance / ConcernsBox / ActivityLog /
  Icon`** - focused presentational components described in the tree above. `ResourceCheck` now also
  asks the vulnerability questions (limited mobility, medical / powered equipment).

---

## Technical specification

### System
- **Architecture** - SPA frontend + stateless REST backend. Vite dev-proxies `/api` to the
  backend; in production they're same-origin.
- **Backend** - Python 3.10+ / FastAPI / Uvicorn (ASGI). Fully `async` end-to-end; concurrent
  outbound calls via `asyncio.gather`. No database - state lives in the request, in two file/
  memory caches, and in the browser's `localStorage`.
- **Frontend** - React 18 (function components + hooks), Vite 6 build, Leaflet 1.9 for mapping.
  No global state library; `App.jsx` owns state and passes props down. A PWA via a hand-rolled
  service worker + web manifest.

### AI
- **Provider** - OpenRouter (OpenAI-compatible API), via the `openai` async SDK.
- **Model** - `nex-agi/nex-n2-pro:free` (configurable via `OPENROUTER_MODEL`; vision via
  `OPENROUTER_VISION_MODEL`, defaults to the same model). Reasoning enabled on the synthesis
  call.
- **Seven call sites** - the response flow's vision screenshot parse, Stage-5 plan synthesis, and
  follow-up step/question; plus the Recover flow's `synthesize_cleanup`, `recovery_follow_up`,
  `analyze_paperwork`, and `ocr_document_text` (vision OCR of a photographed letter → plain text
  before the text-level redact/extract pipeline). Every one enforces a strict JSON contract and a
  defensive parser; **any** failure mode (no key, timeout, bad JSON, missing keys) falls back to
  the matching deterministic function (`modules.build_plan` for response, `recovery.*` for Recover).
- **Time context** - synthesis and follow-up both receive a `timing` block built by
  `ai._timing_context()` from the client's `now` and the alert `expires`: `minutes_until_expiry`
  / `minutes_since_expiry` and a `status` of `active`/`expired`. The prompt instructs the model
  to ground time estimates in real clock time and to answer timing questions with concrete
  remaining minutes. Follow-ups additionally carry a human `planAge` ("8 minutes ago").

### Caching strategy
RAG context is cached in two tiers, selected by urgency:

| | In-memory (24 h) | File `rag_monthly_cache.json` (30 d) |
|---|---|---|
| **Purpose** | Hot reuse within a session/day | Survive restarts; long-lived baseline |
| **Written** | After any successful fetch | Only when entry is missing or > 30 d old |

- **Urgent tiers (`RUN`/`ACT`)** never block on the network: use the newer of the two caches;
  only fetch live if nothing usable exists.
- **`PREPARE`** fetches fresh for accuracy, but skips the fetch if the 24 h cache is already
  newer than the monthly one; on fetch failure it falls back to whatever cache exists.
- **Prewarm** - `/api/module` kicks off a background fetch so the cache is usually warm by the
  time `/api/recommend` runs.

### Resilience contract
- Every `APIs/*` adapter returns an `{ok: False, ...}` shape on failure rather than raising.
- The map renders from module data without waiting for the AI.
- The last plan is persisted client-side and resumable offline; the service worker serves the
  app shell + fonts offline (live tiles/API still need network).

### Performance characteristics
- Stage 4 outbound calls run concurrently; the dominant cost is Overpass (multi-mirror).
- Stage 5 = one RAG fetch (usually cached/prewarmed) + one AI call, run sequentially because
  the AI consumes the RAG context.

### Security
The API is public and unauthenticated, and several endpoints make *paid / quota-limited* calls
(OpenRouter, NASA FIRMS, Overpass). The key string itself never leaves the server - it lives only
in a server-side env var, is used only in backend calls, and no endpoint returns it (`/api/health`
exposes only booleans). The remaining risk is *budget abuse*, defended in depth:

- **Rate limiting** (`ratelimit.py`) - per-IP + a global ceiling on the AI endpoints, so scripted
  abuse (even with rotated/forged IPs) can't run up the OpenRouter bill.
- **Origin-restricted CORS** - browser access limited to the known frontends (override with
  `CORS_ALLOW_ORIGINS`).
- **Bounded inputs** - request payloads are capped in `models.py` (image size, free-text fields,
  polygon vertices) so endpoints can't be used as a free vision proxy or to inflate prompt cost.
- **PII guardrail (Recover)** - `recovery.redact_sensitive_data()` runs *before* any analysis and
  scrubs likely SSNs, bank/card/account numbers, full policy/claim numbers, exact addresses, and
  login credentials to `[REDACTED]`, then continues (auto-redact, not reject) and reports what it
  removed - so flagged personal data is never forwarded to the model, without making the user
  hand-edit the document. (Detection is pattern-based, so best-effort; for a photographed letter the
  image reaches the vision model for OCR before text-level redaction runs.)

### Feature internals

A closer look at the mechanisms behind the less-obvious features.

#### RUN-tier follow-on plan
The RUN tier is the one case where the life-safety reflex (drop/cover/flee) must be shown with
**zero latency**, yet a full plan is still valuable once the person is moving. The two are
decoupled end-to-end:

1. **Instant render.** `Calc/guidance.run_guidance(hazard)` returns a hardcoded
   `{headline, lines}` dict that ships in the `/api/alert` response (`payload["runGuidance"]`).
   `RunGuidance.jsx` renders it with no further network dependency.
2. **Background trigger.** On entering the `run` phase, an effect in `App.jsx` calls
   `generateRunPlan()` exactly once - guarded by `runPlanStartedRef` (reset in `storeAlert`/
   `goHome`) so React StrictMode's double-invoke and re-render re-fires can't double-trigger it.
   Module fetches are additionally deduped by `getOrFetchModule`/`modulePromiseRef`.
3. **Prompt steering.** The call hits `/api/recommend` with `runFollowOn:true`. Server-side,
   `_candidates()` adds `immediate_actions_underway` (the same `run_guidance` lines) to the model
   context, and `synthesize()` swaps the prompt *lead* to: *"assume those actions are underway -
   do NOT repeat them as the first step or headline; generate the plan for what they do NEXT."*
   The existing SYSTEM prompt already skips PHASE 1 (Preparation) for RUN/ACT, so the plan starts
   at the evacuation/brace phase naturally.
4. **Resources.** RUN uses `DEFAULT_RESOURCES` - there is no time to ask the resource check.

The same `rec`/`recLoading`/`planVersion`/`Slideshow` state is reused, so the RUN plan supports
the identical Share / Questions / Concerns / Map affordances as the result phase.

#### Live "active disasters now" discovery & diversification
`discover.find_active_disasters(limit=5)` builds the picker list:

- **Gather.** `_nws_candidates()` (every active severe/extreme US warning that carries a polygon)
  and `_quake_candidates()` (recent significant global quakes, < 24 h, M ≥ 4.5) run concurrently
  via `asyncio.gather`. Each candidate is scored by severity/magnitude and tagged with a point to
  place the user (NWS: polygon centroid; quake: a deterministic 3–8 km offset from the epicentre).
- **Diversify.** Candidates are grouped by hazard type; the strong head of each group is shuffled
  for run-to-run variety, then the final list is built by **round-robin across hazard types** -
  so five active floods don't crowd out the lone quake. This is intentionally non-deterministic
  (see Known limitations).
- **Reuse.** `find_active_disaster()` (single pick) is now just `random.choice` over the same
  pool, so `/api/demo/live` and `/api/demo/live/list` share one code path, each shaped by
  `main._live_payload()` into the standard alert envelope.

#### Live-alert dispatch precedence
`alerts.fetch_alert()` deliberately orders sources so there are **no cross-border false
positives**: NWS 400s outside the US (caught, fall through), ECCC returns nothing over US bboxes,
and USGS/FIRMS are pure proximity detections that only fill gaps the weather feeds don't carry
(any earthquake; Canadian wildfire). Weather warnings therefore always win where they exist.

#### Demo generated-vs-real comparison
The demo notification doubles as a credibility check on the synthetic generator. When
`situation.source === "mock"` and an example exists for the hazard, `NotificationCard.jsx` renders
the generated alert as a phone-style "screenshot" mock (built from the live `situation` fields)
beside the real NWS screenshot served from `/public/examples/{hazard}.jpg`. Wildfire is omitted
on purpose: NWS issues no "wildfire warning" - only fire-*weather* products - so there's no
apples-to-apples real example to show.

---

## Built with

**Languages & frameworks:** Python, FastAPI, Uvicorn · JavaScript (ES modules), React 18,
Vite 6 · Leaflet.

**Python libraries:** `fastapi`, `uvicorn[standard]`, `httpx` (async HTTP), `openai` (async
SDK for OpenRouter), `pydantic` v2, `python-dotenv`. Standard library: `asyncio`, `html.parser`,
`xml.etree`, `csv`, `json`, `math`, `re`.

**JS libraries:** `react`, `react-dom`, `leaflet`; `@vitejs/plugin-react`, `vite` (dev).

**External data & services (all free; most key-free):**

| Service | Used for | Key? |
|---|---|---|
| OpenRouter (`nex-agi/nex-n2-pro:free`) | Vision parse + plan synthesis + follow-up | Yes |
| NWS `api.weather.gov` | Live active alerts (US) | No |
| ECCC GeoMet `api.weather.gc.ca` | Live active alerts (Canada, city-page warnings) | No |
| Open-Meteo Elevation | High-ground reasoning (flood) | No |
| Open-Meteo Forecast | Current wind (wildfire) | No |
| Overpass API (3 mirrors) | Safe buildings / supplies / open spaces | No |
| NASA FIRMS | Active-fire detections (wildfire) | Free key (optional) |
| USGS Earthquake feed | Recent-quake confirmation | No |
| Nominatim (OpenStreetMap) | Reverse-geocode the location label (frontend) | No |
| OSRM | Road routing for the map (frontend) | No |
| Google News RSS | Local headlines for the live flow | No |
| Esri / OpenTopoMap / OSM tiles | Map base layers + hillshade (frontend) | No |
| Google Fonts | Typography | No |

---

## Running it locally

**Prerequisites:** Python 3.10+ and Node.js 18+.

> **Use a virtual environment** for the backend. The app needs `httpx>=0.28`, which can conflict
> with other globally-installed packages; a venv keeps it isolated.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env              # then add your OPENROUTER_API_KEY (see Configuration)
uvicorn app.main:app --reload --port 8000
```

Up when `http://127.0.0.1:8000/api/health` returns
`{"ok": true, "ai_configured": true|false, "firms_configured": true|false}`. Interactive docs
at `/docs`.

### Frontend

```powershell
cd frontend
npm install
npm run dev                         # http://localhost:5173  (proxies /api → :8000)
```

Open **http://localhost:5173**. For a production build: `npm run build` then `npm run preview`.
(The service worker only activates on a served build or after a reload, since it registers on
`window.load`.)

---

## Configuration

Backend reads from `backend/.env`:

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | For AI features | Enables vision parse + AI synthesis + follow-up. Without it, the app uses the deterministic engine only (and the screenshot path is disabled, since it must read an image). |
| `OPENROUTER_MODEL` | No (default `nex-agi/nex-n2-pro:free`) | Override the synthesis/follow-up model. |
| `OPENROUTER_VISION_MODEL` | No (defaults to `OPENROUTER_MODEL`) | Override the screenshot-reading model. |
| `FIRMS_MAP_KEY` | No | Enables live NASA FIRMS fire detections; without it the wildfire demo uses seeded fires. |
| `CORS_ALLOW_ORIGINS` | No | Comma-separated allowed origins for CORS. Defaults to the known frontends (Vercel site + localhost dev). |

The app degrades gracefully with **none** of these set - it falls back to the deterministic
engine and seeded demo data.

---

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + which optional keys are configured |
| `POST` | `/api/alert` | Stage 1+2: situation + hazard + time tier (+ RUN guidance) |
| `POST` | `/api/alert/status` | Re-check the viewed alert → state (escalated/cleared/…) + `recoverSuggested` |
| `POST` | `/api/analyze_screenshot` | Real flow: vision-parse a screenshot → situation + triage |
| `POST` | `/api/module` | Stage 4: run the hazard module → map data + deterministic plan (warms RAG) |
| `POST` | `/api/recommend` | Stage 5: RAG + news + one AI synthesis call → refined plan (`runFollowOn:true` for the RUN next-steps plan) |
| `POST` | `/api/follow-up` | Add a plan step (`mode=instruction`) or answer a question (`mode=question`), RAG-grounded |
| `POST` | `/api/recover/cleanup` | Recover: clean-up / re-entry slideshow plan; folds in an attached letter's computed deadlines (auto-redacted; OCRs a photo) |
| `POST` | `/api/recover/followup` | Recover: add a step / answer a question on the clean-up plan, RAG-grounded |
| `POST` | `/api/recover/paperwork` | Recover: analyze an insurance/FEMA/aid letter (auto-redacts sensitive data, then continues) → computed deadlines, classification, contacts |
| `GET` | `/api/demo/live` | Simulate flow: find **one** active disaster now + a point to stand next to |
| `GET` | `/api/demo/live/list` | Simulate flow: find **up to 5** active disasters now (diversified) for the picker |
| `POST` | `/api/demo/live/place` | Simulate flow: resolve a real public place to stand at for a chosen live disaster |
| `GET` | `/api/demo/coords` | The curated demo coordinates per hazard |
| `GET` | `/` | Service banner |

### Quick smoke test

```bash
curl http://127.0.0.1:8000/api/health

# Stage 1+2 - generate a demo flood alert at the ACT tier
curl -X POST http://127.0.0.1:8000/api/alert -H "Content-Type: application/json" \
  -d '{"lat":40.015,"lon":-105.2705,"demo":true,"hazard":"flood","tier":"ACT"}'

# Stage 4 - run the hazard module (live elevation + Overpass)
curl -X POST http://127.0.0.1:8000/api/module -H "Content-Type: application/json" \
  -d '{"lat":40.015,"lon":-105.2705,"hazardType":"flood","timeTier":"ACT","situation":{"event":"Flood Warning","hazardType":"flood","severity":"Severe","urgency":"Expected","certainty":"Likely","officialEvacOrder":false,"inZone":true,"source":"mock"},"resources":{"mobility":"foot","hasSlowMovers":false,"hasSupplies":false}}'
```

Full schemas at `http://127.0.0.1:8000/docs`.

---

## Design philosophy

> The full rationale - visual minimalism, the single-green color language, the landing page,
> and AI safety by design - is in [`DESIGN_PHILOSOPHY.md`](DESIGN_PHILOSOPHY.md). The essentials:

- **Calm, plain, one action.** The reader is frightened. Short sentences, no jargon, one clear
  move - with the detail available on demand, not forced.
- **Never invent.** Destinations are chosen only from real candidates; the AI is forbidden from
  improvising escape directions; debunked advice (highway-overpass sheltering, earthquake
  doorways) is explicitly banned in the prompt and contradicted in the deterministic copy.
- **Tier-correct.** A `PREPARE` plan is about readiness; shelter/hide actions in it must be
  conditional ("*if* a warning is issued"), never immediate imperatives. The deterministic plan
  and the AI plan are built from the *same* tier so they can never disagree.
- **Defers to officials.** Evacuation orders are surfaced first and marked overriding.
- **No accounts, no database, no tracking.** Four hazards, by design.
- **Honest about constraints.** A web app can't receive an OS-level emergency push when closed -
  real alerts go through the Wireless Emergency Alert system. This demonstrates the decision
  engine, triggered by an alert you provide or simulate; production would be a native app / PWA
  that wakes on the WEA alert.

---

## Known limitations

- **Live alerts: weather is US + Canada; quakes/fires are global.** The live-alert button
  dispatches in order - NWS (US weather), ECCC (Canada weather), USGS (recent significant
  earthquakes near you, worldwide, key-free), then NASA FIRMS (active fire detections near you,
  worldwide - needs `FIRMS_MAP_KEY`). So earthquakes and wildfires are detected even where no
  national weather feed is wired; only *weather* warnings (flood/tornado) are limited to US +
  Canada. Without a FIRMS key, live wildfire detection is skipped (the screenshot flow still
  works anywhere). Each source returns one alert - simultaneous multi-hazard isn't merged.
- **Screenshot flow has no machine-readable expiry.** The AI is always given the current clock
  time and grounds remaining/elapsed time against the alert's `expires` when it's present (Demo
  Mode seeds it; live NWS/ECCC carry it). The vision parser doesn't yet extract `expires` from a
  screenshot *image*, so uploaded alerts get current-time context but no countdown.
- **Offline ≠ fully offline.** The app shell and last plan work offline, but live map tiles,
  routing, and any fresh API call still require the network.
- **Overpass latency.** Place lookups can be slow (multi-mirror failover with generous
  timeouts); this is the dominant cost in Stage 4.
- **Elevation is ~90 m resolution** (Copernicus via Open-Meteo) - good for which way the ground
  trends higher, not fine detail; this caveat is carried into the plan's confidence.
- **Demo news is synthetic.** Demo Mode uses curated fake headlines; only the live flow fetches
  real news.
- **Demo compare has no wildfire example.** The generated-vs-real screenshot comparison ships
  real examples for flood / tornado / earthquake only. NWS issues no "wildfire warning" (only
  fire-*weather* products like Red Flag Warnings), so there's no equivalent real screenshot - the
  wildfire demo falls back to the plain alert card.
- **The simulate picker is intentionally non-deterministic.** `/api/demo/live/list` diversifies
  by hazard and shuffles the strong head of each group, so the five offered events vary between
  runs by design (good for a demo, not a stable list). It also inherits every live-feed limit
  above - quakes/fires are global, weather warnings are US + Canada.
- **Recover is explain-only, and US-leaning.** The paperwork helper extracts and explains - it
  **does not decide** insurance coverage, aid eligibility, legal rights, or structural safety, and
  every response says so and names who must confirm each decision. It now frames aid for both the US
  (FEMA) and Canada (provincial disaster assistance), but the clean-up RAG sources and the extraction
  patterns are still tuned for US/English documents and agencies; the deterministic fallbacks work
  elsewhere but the grounding is US-shaped.
- **Auto-redaction is best-effort, and photos are sent to the vision model.** Sensitive data is
  scrubbed by pattern-matching before any text reaches the AI, but detection isn't exhaustive (it
  catches what the patterns catch). For a **photographed** letter, OCR sends the image to the vision
  model *before* text-level redaction can run, so the guardrail there protects the extracted text,
  not the image itself.
```
