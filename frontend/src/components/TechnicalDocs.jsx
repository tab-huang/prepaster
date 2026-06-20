// Technical documentation - the full system spec, drawn from the README, rendered
// as a proper page with visual (non-ASCII) diagrams. Opened from the "How it works"
// page via its Technical Specifications section.
//
// Bilingual (EN / FR): the descriptive prose is translated; literal code identifiers
// (function names, file names, endpoint paths, model IDs, JSON, HTTP headers) stay as
// written since they are code, not language.

import Icon from "./Icon.jsx";
import "../technical-docs.css";

const C = {
  en: {
    back: "How it works",
    chip: "Technical docs",
    eyebrow: "Technical Specifications",
    title: "How Crisis-to-Action is built",
    lede: "One spine, four hazard modules, two response patterns, three acts (Receive · Respond · Recover). A stateless FastAPI backend and a React SPA, designed so a frightened person always gets one calm action - even when the AI, the network, or an external feed isn't there.",

    coreLabel: "Core ideas",
    principles: [
      { h: "Deterministic first, AI second", p: <>Every hazard module computes a complete, correct, rule-based plan <em>before</em> the AI is called. The AI only refines it into one calm instruction. If the AI is unconfigured, times out, or returns garbage, the deterministic plan shows instead. The app never hangs and never shows nothing.</> },
      { h: "Time is the primary variable", p: <>The same hazard demands different advice at 10 minutes, 1 hour, or 6 hours. Everything is keyed off a three-level time tier - RUN, ACT, PREPARE.</> },
      { h: "From exactly where you stand", p: <>Generic "move to higher ground" is useless. The engine reasons over your coordinates: which way the ground rises, which sturdy building is closest, where the fire sits relative to the wind.</> },
    ],

    pipelineLabel: "The pipeline - five stages",
    pipelineBody: "Both entry paths (real screenshot, demo alert) converge on one spine. For the RUN tier, Stage 2 guidance renders instantly while Stages 4–5 run in the background.",
    stages: [
      { n: 1, name: "Hazard detection", where: "hazards.detect_hazard / ai.analyze_screenshot", what: "Identify which of the four hazards this is" },
      { n: 2, name: "Time triage",      where: "Calc/triage.compute_time_tier", what: "Map alert fields → RUN / ACT / PREPARE" },
      { n: 3, name: "Resource check",   where: "components/ResourceCheck.jsx", what: "Four one-tap questions about the user's situation" },
      { n: 4, name: "Hazard module",    where: "modules.run_module", what: "Gather live geo-data → map data + deterministic plan" },
      { n: 5, name: "Synthesis",        where: "APIs/rag + ai.synthesize", what: "RAG fetch → one AI call → refined plan (deterministic fallback)" },
    ],

    flowLabel: "Workflow & data flow",
    flowEntry: "Entry",
    flowEntryNodes: [
      { t: "Check live alerts", s: "NWS → ECCC → USGS → FIRMS" },
      { t: "Upload screenshot", s: "vision → Situation" },
      { t: "Demo / simulate", s: "synthetic or real-active" },
    ],
    flowTriage: "Stage 2 · Triage",
    flowTriageNode: "compute_time_tier() → RUN / ACT / PREPARE",
    flowRunInstant: { t: "run_guidance()", s: "renders instantly, no network" },
    flowRunBg: { t: "background: runFollowOn=true", s: "plan \"what next\" while moving" },
    flowActNode: { t: "ResourceCheck.jsx", s: "mobility · atHome · slow · supplies" },
    flowModule: "Stage 4 · Module",
    flowModNodes: [
      { t: "flood", s: "elevation + places" },
      { t: "wildfire", s: "firms + wind + places" },
      { t: "tornado", s: "nearest sturdy bldg" },
      { t: "quake", s: "usgs + open spaces" },
    ],
    flowModNote: "build_plan() → deterministic summary + steps · CrisisMap draws immediately (no AI wait)",
    flowSynth: "Stage 5 · Synthesis",
    flowSynthNode: { t: "ai.synthesize() - one AI call", s: "news + RAG + module context → refined plan", fb: "fail / timeout → deterministic plan" },
    flowPlan: "Plan",
    flowPlanNodes: [
      { t: "Slideshow + Map", s: "route via OSRM" },
      { t: "Questions", s: "/follow-up · RAG" },
      { t: "Concerns", s: "/recommend · userNote" },
      { t: "More steps", s: "/follow-up · instruction" },
    ],
    flowPlanNote: "plan persisted to localStorage → offline resume",

    hazLabel: "Four hazards, two patterns",
    hazHead: ["Hazard", "Pattern", "Core action", "Live data"],
    hazards: [
      { name: "Flood",      pattern: "routing", patLabel: "routing", action: "Move to higher ground",            data: "Elevation rings (Open-Meteo), safe buildings (Overpass)" },
      { name: "Wildfire",   pattern: "routing", patLabel: "routing", action: "Move away from the fire, by wind", data: "Fire detections (NASA FIRMS), wind (Open-Meteo), safe buildings" },
      { name: "Tornado",    pattern: "shelter", patLabel: "shelter", action: "Lowest, most interior room",       data: "Nearest sturdy building (Overpass)" },
      { name: "Earthquake", pattern: "shelter", patLabel: "shelter", action: "Drop, cover, hold; then open ground", data: "Recent quakes (USGS), open spaces (Overpass)" },
    ],
    hazNote: "Flood and wildfire do genuine geo-computation; tornado and earthquake provide correct, time-aware shelter guidance plus a nearest-shelter / open-ground lookup. The app never fakes computation where the right answer is \"shelter in place.\"",

    geoLabel: "Threat geometry - are you in the warned area?",
    geoBody: (
      <>
        Official warnings ship a <strong>warned-area polygon</strong> - the exact shape the
        alert applies to, not a circle or a county name. Every weather feed carries one
        (NWS <code>_extract_polygon</code>, ECCC <code>_geom_to_ring</code>, demo
        <code>_box</code>), normalized to a single ring of <code>[lon, lat]</code> vertices.
        Earthquakes are the exception - a quake has no meaningful warning polygon, so that
        module reasons from the epicentre and proximity instead.
      </>
    ),
    geoRows: [
      { k: "In-zone test", v: <><code>geo.point_in_polygon()</code> - a dependency-free <strong>ray-casting</strong> test. Cast a ray east from the user's point and count how many polygon edges it crosses: an <strong>odd</strong> count means inside, <strong>even</strong> means outside. O(n) over the ring's vertices, exact, no geometry library.</> },
      { k: "Fail-safe default", v: <><code>nws.compute_in_zone()</code> wraps the test. If a warning carries <em> no</em> polygon, it returns <code>true</code> - we assume you're affected rather than wave you off. Under-warning is never a safe error.</> },
      { k: "Centroid anchor", v: <>The ring's vertex average gives a centroid that anchors the simulated user (the "stand me inside a real warning" demo) and seeds the public-place search.</> },
      { k: "Place selection", v: <><code>places._select()</code> reuses the same point-in-polygon test - candidate buildings <em>inside</em> the polygon are preferred, then ranked by distance to the centroid - so the person is dropped somewhere real and genuinely within the warned area.</> },
      { k: "Drawn, not zoomed", v: <>The client renders the ring as a translucent red fill for context but deliberately does <em>not</em> let it drive the map zoom - a county-sized polygon would zoom the map uselessly far out. The view fits the action points (you, the route, the destination) instead.</> },
    ],

    tiersLabel: "Time tiers",
    tiers: [
      { label: "RUN",     window: "≈ 10 minutes", cls: "td-tier--run",  desc: "Imminent threat. Hardcoded life-safety guidance renders instantly with zero API dependency; the full plan builds in the background." },
      { label: "ACT",     window: "≈ 1 hour",     cls: "td-tier--act",  desc: "Hazard arriving soon. A one-tap, vulnerability-aware resource check (mobility, medical, dependents, vehicle), then the full module + AI plan." },
      { label: "PREPARE", window: "≈ 6 hours",    cls: "td-tier--prep", desc: "Hazard not here yet. The plan is about readiness - route, supplies, triggers. Shelter actions are conditional, never imperative." },
    ],

    archLabel: "System architecture",
    archFrontH: "Frontend",
    archFront: [
      "React 18 (function components + hooks)",
      "Vite 6 build, Leaflet 1.9 mapping",
      "No global state library - App.jsx owns state, passes props down",
      "PWA: hand-rolled service worker + web manifest",
    ],
    archConn: "/api proxy",
    archBackH: "Backend",
    archBack: [
      "Python 3.10+ / FastAPI / Uvicorn (ASGI)",
      "Fully async; concurrent calls via asyncio.gather",
      "No database - state lives in the request, two caches, and localStorage",
      "Every external adapter returns ok:false on failure, never raises",
    ],

    a11yLabel: "Eyes-free, hands-free, bilingual",
    a11yRows: [
      { k: "Read-aloud", v: <>Every plan slide, the RUN life-safety card, and the fallback plan carry a speaker button (Web Speech <code>SpeechSynthesis</code>) - so a person who is moving, panicking, or can't read the screen still gets the instruction. Narration is cancelled on slide change so one slide's speech never bleeds into the next.</> },
      { k: "Voice input", v: <>The question, add-a-step, and "something changed" boxes accept dictation (<code>SpeechRecognition</code>) - no typing required under stress.</> },
      { k: "Device facing", v: <>The "you are here" marker shows a live facing cone driven by the device compass (<code>deviceorientation</code> / iOS <code>webkitCompassHeading</code>, corrected for screen rotation), so "head NE" maps to a direction the user can physically see.</> },
      { k: "EN / FR", v: <>A language toggle produces the plan, headline, and follow-up Q&amp;A in French (US + Canada coverage; Canada is officially bilingual). The offline deterministic fallback is <em>also</em> bilingual (<code>modules._plan_fr</code>), so French survives a total AI outage.</> },
    ],
    a11yNote: "All of it degrades gracefully: a browser without speech or orientation simply hides those affordances and behaves exactly as before.",

    aiLabel: "AI synthesis",
    aiRows: [
      { k: "Provider", v: <>OpenRouter (OpenAI-compatible), via the <code>openai</code> async SDK</> },
      { k: "Model", v: <><code>anthropic/claude-sonnet-4-6</code> - configurable via <code>OPENROUTER_MODEL</code>; vision via <code>OPENROUTER_VISION_MODEL</code></> },
      { k: "Call sites", v: <>Vision screenshot parse · Stage-5 plan synthesis · follow-up step/question · plus the Recover flow's <code>synthesize_cleanup</code> · <code>recovery_follow_up</code> · <code>analyze_paperwork</code> · <code>ocr_document_text</code> (photo letter → text). Recovery deadlines use an <strong>LLM-extracts / code-computes</strong> hybrid: the model returns the deadline's structure, <code>reconcile_deadlines</code> does the date math and overrides it.</> },
      { k: "Contract", v: <>Strict JSON + defensive parser; any failure falls back to the deterministic plan (<code>modules.build_plan</code> for response, <code>recovery.*</code> for Recover)</> },
      { k: "Time context", v: <><code>_timing_context()</code> builds minutes-until/since-expiry + active/expired status from the client <code>now</code> and alert <code>expires</code>, so plans ground in real clock time and "do I still have time?" gets a concrete answer</> },
    ],

    recLabel: "Recover — the third act",
    recBody: "After Receive and Respond comes Recover. A live plan watches its own alert and offers a one-tap handoff once it clears. The user picks the hazard and gets one cohesive surface — a clean-up guide plus an \"Ask anything\" assistant — reusing the same deterministic-first, RAG-grounded engine (no live alert, no map).",
    recRows: [
      { k: "Clean-up & re-entry", v: <>One recovery-RAG fetch + one AI call (<code>ai.synthesize_cleanup</code>) returns the same <code>{"{summary, steps[]}"}</code> plan the Slideshow renders — <em>before you go back in → document everything → clean up → health &amp; next steps</em>. You can attach an insurance/FEMA/aid letter (paste or photo); it's OCR'd, redacted, extracted, and its computed deadlines are woven into the plan. Falls back to <code>recovery.cleanup_fallback</code>.</> },
      { k: "Paperwork engine", v: <><code>recovery.py</code> + <code>ai.analyze_paperwork</code>. <strong>Computes</strong> deadlines (absolute + relative resolved against trigger dates → date, days-remaining, urgency); <code>classify_document</code> scores the type; <code>extract_contact_details</code> / <code>identify_issuer_details</code> pull classified, trap-filtered contacts + the issuer with confidence; <code>has_meaningful_extracted_text</code> flags scanned-only uploads. It <em>explains</em> — never decides coverage, eligibility, or legal rights — with a bilingual human-review-required list.</> },
      { k: "Privacy guardrail", v: <><code>recovery.redact_sensitive_data()</code> runs <em>before</em> any analysis and scrubs likely SSNs, bank/card/account numbers, full policy/claim numbers, exact addresses, and login credentials to <code>[REDACTED]</code>, then <strong>continues</strong> (auto-redact, not reject) and reports what it removed — so flagged data is never sent, without making the user hand-edit.</> },
      { k: "Recovery RAG", v: <>A second source set (<code>GOV_SOURCES_RECOVERY</code> — Ready.gov, CDC, EPA, Earthquake Country Alliance) read via <code>fetch_recovery_rag()</code>, cached under a namespaced <code>recovery:&lt;hazard&gt;</code> key so it never collides with the response-flow cache.</> },
    ],

    cacheLabel: "RAG caching strategy",
    cacheMem: { badge: "In-memory · 24 h", p: <>Hot reuse within a session/day. Written after any successful fetch.</> },
    cacheFile: { badge: "File · 30 d", p: <><code>rag_monthly_cache.json</code> - survives restarts; long-lived baseline. Written only when missing or &gt; 30 days old.</> },
    cacheLogic: [
      { tag: "URGENT", cls: "td-pat--shelter", v: <>RUN / ACT never block on the network - use the newer cache; fetch live only if nothing usable exists.</> },
      { tag: "PREPARE", cls: "td-pat--routing", v: <>Fetch fresh for accuracy; skip if the 24 h cache is already newer; on failure fall back to any cache.</> },
      { tag: "PREWARM", cls: "td-pat--routing", v: <><code>/api/module</code> kicks off a background fetch so the cache is usually warm by the time <code>/api/recommend</code> runs.</> },
    ],

    svcLabel: "External data & services",
    svcHead: ["Service", "Used for", "Key?"],
    services: [
      { svc: "OpenRouter (anthropic/claude-sonnet-4-6)", use: "Vision parse + plan synthesis + follow-up + recovery", key: "Yes", keyLabel: "Yes" },
      { svc: "NWS api.weather.gov",        use: "Live active alerts (US)", key: "No", keyLabel: "No" },
      { svc: "ECCC GeoMet",                use: "Live active alerts (Canada)", key: "No", keyLabel: "No" },
      { svc: "Open-Meteo Elevation",       use: "High-ground reasoning (flood)", key: "No", keyLabel: "No" },
      { svc: "Open-Meteo Forecast",        use: "Current wind (wildfire)", key: "No", keyLabel: "No" },
      { svc: "Overpass API (3 mirrors)",   use: "Safe buildings / supplies / open spaces", key: "No", keyLabel: "No" },
      { svc: "NASA FIRMS",                 use: "Active-fire detections (wildfire)", key: "Optional", keyLabel: "Optional" },
      { svc: "USGS Earthquake feed",       use: "Recent-quake confirmation", key: "No", keyLabel: "No" },
      { svc: "Nominatim (OSM)",            use: "Reverse-geocode location label", key: "No", keyLabel: "No" },
      { svc: "OSRM",                       use: "Road routing for the map", key: "No", keyLabel: "No" },
      { svc: "Google News RSS",            use: "Local headlines for the live flow", key: "No", keyLabel: "No" },
      { svc: "Esri / OpenTopoMap / OSM",   use: "Map base layers + hillshade", key: "No", keyLabel: "No" },
    ],

    apiLabel: "API reference",
    endpoints: [
      { m: "GET",  path: "/api/health",            purpose: "Liveness + which optional keys are configured" },
      { m: "POST", path: "/api/alert",             purpose: "Stage 1+2: situation + hazard + time tier (+ RUN guidance)" },
      { m: "POST", path: "/api/alert/status",      purpose: "Re-check the viewed alert → state (escalated/cleared/…) + recoverSuggested handoff" },
      { m: "POST", path: "/api/analyze_screenshot", purpose: "Real flow: vision-parse a screenshot → situation + triage" },
      { m: "POST", path: "/api/module",            purpose: "Stage 4: hazard module → map data + deterministic plan (warms RAG)" },
      { m: "POST", path: "/api/recommend",         purpose: "Stage 5: RAG + news + one AI call → refined plan" },
      { m: "POST", path: "/api/follow-up",         purpose: "Add a plan step or answer a question, RAG-grounded" },
      { m: "POST", path: "/api/recover/cleanup",   purpose: "Recover: clean-up plan; folds in an attached letter's computed deadlines (auto-redacted; OCRs a photo)" },
      { m: "POST", path: "/api/recover/followup",  purpose: "Recover: add a step / answer a question on the clean-up plan" },
      { m: "POST", path: "/api/recover/paperwork", purpose: "Recover: analyze a letter (auto-redacts, then continues) → computed deadlines, classification, contacts" },
      { m: "GET",  path: "/api/demo/live",         purpose: "Find one active disaster now + a point to stand next to" },
      { m: "GET",  path: "/api/demo/live/list",    purpose: "Find up to 5 active disasters now (diversified) for the picker" },
      { m: "POST", path: "/api/demo/live/place",   purpose: "Resolve a real public place to stand at for a chosen live disaster" },
      { m: "GET",  path: "/api/demo/coords",       purpose: "The curated demo coordinates per hazard" },
    ],

    resLabel: "Resilience contract",
    resList: [
      <>Every <code>APIs/*</code> adapter returns an <code>{"{ok: false}"}</code> shape on failure rather than raising.</>,
      <>The map renders from module data without waiting for the AI.</>,
      <>The last plan is persisted client-side and resumable offline; the service worker serves the app shell + fonts offline (live tiles/API still need network).</>,
    ],

    rlLabel: "Rate limiting & abuse protection",
    rlBody: "The API is public and unauthenticated, and several endpoints make paid OpenRouter calls. A dependency-free, in-memory sliding-window limiter (ratelimit.RateLimitMiddleware) throttles every /api/* request except /api/health, returning 429 with a Retry-After header when a window is exceeded.",
    rlRows: [
      { k: "Per-IP · all endpoints", v: <><strong>90 requests / minute</strong> per client IP across the whole API — stops a single client from hammering the service.</> },
      { k: "Per-IP · AI paths", v: <><strong>12 requests / minute</strong> on the paid paths (<code>/api/recommend</code>, <code>/api/analyze_screenshot</code>, <code>/api/follow-up</code>), since each call costs real money.</> },
      { k: "Global · AI paths", v: <><strong>90 requests / minute</strong> across <em>all</em> clients combined — a hard ceiling on AI spend. Per-IP limits are spoofable; this global guard is what actually caps the budget, so forging source IPs can't run up the bill.</> },
      { k: "Over-limit response", v: <><code>HTTP 429</code> with an <code>{"{ok: false}"}</code> body and a <code>Retry-After</code> header (seconds until the oldest hit in the window ages out).</> },
      { k: "Client identity", v: <>Resolved from <code>X-Forwarded-For</code> / <code>X-Real-IP</code> (PythonAnywhere terminates TLS at a front proxy), falling back to the socket peer. Stale buckets are swept at most once a minute so memory can't grow unbounded.</> },
      { k: "Scope", v: <>Counters are in-memory, so limits are <em>per worker process</em>. The PythonAnywhere deployment runs a single web worker (so this is effective); scaling to multiple workers/hosts would need shared counters (Redis/Memcached).</> },
    ],

    limLabel: "Known limitations",
    limits: [
      ["Live alerts: weather is US + Canada; quakes/fires are global.", "The live-alert button dispatches NWS → ECCC → USGS → FIRMS. Earthquakes and wildfires are detected anywhere; only weather warnings are limited to US + Canada. Each source returns one alert - simultaneous multi-hazard isn't merged."],
      ["Screenshot flow has no machine-readable expiry.", "The AI always gets the current clock time and grounds remaining time against the alert's expires when present (Demo seeds it; live NWS/ECCC carry it). The vision parser doesn't yet extract expires from an image, so uploads get current-time context but no countdown."],
      ["Offline ≠ fully offline.", "The app shell and last plan work offline, but live map tiles, routing, and any fresh API call still require the network."],
      ["Overpass latency.", "Place lookups can be slow (multi-mirror failover with generous timeouts); this is the dominant cost in Stage 4."],
      ["Elevation is ~90 m resolution.", "Copernicus via Open-Meteo - good for which way the ground trends higher, not fine detail. Carried into the plan's confidence."],
      ["Demo news is synthetic.", "Demo Mode uses curated fake headlines; only the live flow fetches real news."],
      ["The simulate picker is non-deterministic.", "/api/demo/live/list diversifies by hazard and shuffles, so the five offered events vary between runs by design."],
      ["Recover auto-redaction is best-effort; photos hit the vision model.", "Sensitive data is scrubbed by pattern-matching before any text reaches the AI, but detection isn't exhaustive. A photographed letter is OCR'd by the vision model before text-level redaction runs, so the guardrail there protects the extracted text, not the image."],
    ],

    backToHow: "Back to How it works",
  },

  fr: {
    back: "Comment ça marche",
    chip: "Doc technique",
    eyebrow: "Spécifications techniques",
    title: "Comment Crisis-to-Action est construit",
    lede: "Une colonne vertébrale, quatre modules de danger, deux schémas de réponse, trois actes (Recevoir · Répondre · Rétablir). Un backend FastAPI sans état et une SPA React, conçus pour qu'une personne effrayée obtienne toujours une action calme — même quand l'IA, le réseau ou un flux externe est absent.",

    coreLabel: "Idées maîtresses",
    principles: [
      { h: "Déterministe d'abord, IA ensuite", p: <>Chaque module de danger calcule un plan complet, correct et fondé sur des règles <em>avant</em> d'appeler l'IA. L'IA ne fait que l'affiner en une consigne calme. Si l'IA n'est pas configurée, expire ou renvoie n'importe quoi, le plan déterministe s'affiche à la place. L'application ne se fige jamais et ne montre jamais rien de vide.</> },
      { h: "Le temps est la variable première", p: <>Le même danger exige des conseils différents à 10 minutes, 1 heure ou 6 heures. Tout est indexé sur un palier de temps à trois niveaux — RUN, ACT, PREPARE.</> },
      { h: "Depuis l'endroit exact où vous êtes", p: <>Un « gagnez les hauteurs » générique est inutile. Le moteur raisonne sur vos coordonnées : de quel côté le sol s'élève, quel bâtiment solide est le plus proche, où se trouve le feu par rapport au vent.</> },
    ],

    pipelineLabel: "Le pipeline — cinq étapes",
    pipelineBody: "Les deux points d'entrée (vraie capture d'écran, alerte de démo) convergent vers une seule colonne. Pour le palier RUN, les consignes de l'étape 2 s'affichent instantanément pendant que les étapes 4–5 tournent en arrière-plan.",
    stages: [
      { n: 1, name: "Détection du danger", where: "hazards.detect_hazard / ai.analyze_screenshot", what: "Identifier lequel des quatre dangers il s'agit" },
      { n: 2, name: "Triage temporel",      where: "Calc/triage.compute_time_tier", what: "Champs de l'alerte → RUN / ACT / PREPARE" },
      { n: 3, name: "Vérification situation",   where: "components/ResourceCheck.jsx", what: "Quatre questions en un geste sur la situation de l'utilisateur" },
      { n: 4, name: "Module de danger",    where: "modules.run_module", what: "Collecte de géo-données en direct → données carte + plan déterministe" },
      { n: 5, name: "Synthèse",        where: "APIs/rag + ai.synthesize", what: "Récupération RAG → un appel IA → plan affiné (repli déterministe)" },
    ],

    flowLabel: "Flux de travail et de données",
    flowEntry: "Entrée",
    flowEntryNodes: [
      { t: "Vérifier les alertes en direct", s: "NWS → ECCC → USGS → FIRMS" },
      { t: "Téléverser une capture", s: "vision → Situation" },
      { t: "Démo / simuler", s: "synthétique ou réel-actif" },
    ],
    flowTriage: "Étape 2 · Triage",
    flowTriageNode: "compute_time_tier() → RUN / ACT / PREPARE",
    flowRunInstant: { t: "run_guidance()", s: "s'affiche instantanément, sans réseau" },
    flowRunBg: { t: "arrière-plan : runFollowOn=true", s: "planifie « la suite » pendant le mouvement" },
    flowActNode: { t: "ResourceCheck.jsx", s: "mobilité · à la maison · lents · provisions" },
    flowModule: "Étape 4 · Module",
    flowModNodes: [
      { t: "inondation", s: "altitude + lieux" },
      { t: "incendie", s: "firms + vent + lieux" },
      { t: "tornade", s: "bâtiment solide le plus proche" },
      { t: "séisme", s: "usgs + espaces dégagés" },
    ],
    flowModNote: "build_plan() → résumé déterministe + étapes · CrisisMap se dessine immédiatement (sans attendre l'IA)",
    flowSynth: "Étape 5 · Synthèse",
    flowSynthNode: { t: "ai.synthesize() — un appel IA", s: "actualités + RAG + contexte du module → plan affiné", fb: "échec / expiration → plan déterministe" },
    flowPlan: "Plan",
    flowPlanNodes: [
      { t: "Diaporama + carte", s: "itinéraire via OSRM" },
      { t: "Questions", s: "/follow-up · RAG" },
      { t: "Préoccupations", s: "/recommend · userNote" },
      { t: "Étapes supplémentaires", s: "/follow-up · instruction" },
    ],
    flowPlanNote: "plan persisté dans localStorage → reprise hors ligne",

    hazLabel: "Quatre dangers, deux schémas",
    hazHead: ["Danger", "Schéma", "Action centrale", "Données en direct"],
    hazards: [
      { name: "Inondation", pattern: "routing", patLabel: "routage", action: "Gagner les hauteurs",            data: "Anneaux d'altitude (Open-Meteo), bâtiments sûrs (Overpass)" },
      { name: "Incendie",   pattern: "routing", patLabel: "routage", action: "S'éloigner du feu, selon le vent", data: "Détections d'incendie (NASA FIRMS), vent (Open-Meteo), bâtiments sûrs" },
      { name: "Tornade",    pattern: "shelter", patLabel: "abri", action: "Pièce la plus basse et intérieure",       data: "Bâtiment solide le plus proche (Overpass)" },
      { name: "Séisme",     pattern: "shelter", patLabel: "abri", action: "Baissez-vous, couvrez-vous ; puis terrain dégagé", data: "Séismes récents (USGS), espaces dégagés (Overpass)" },
    ],
    hazNote: "L'inondation et l'incendie font un vrai calcul géospatial ; la tornade et le séisme fournissent des consignes d'abri correctes et adaptées au temps, plus une recherche d'abri / terrain dégagé le plus proche. L'application ne simule jamais un calcul là où la bonne réponse est « s'abriter sur place ».",

    geoLabel: "Géométrie de la menace — êtes-vous dans la zone avertie ?",
    geoBody: (
      <>
        Les avertissements officiels embarquent un <strong>polygone de zone avertie</strong> — la
        forme exacte à laquelle l'alerte s'applique, et non un cercle ou un nom de comté. Chaque flux
        météo en porte un (NWS <code>_extract_polygon</code>, ECCC <code>_geom_to_ring</code>, démo
        <code>_box</code>), normalisé en un seul anneau de sommets <code>[lon, lat]</code>.
        Les séismes font exception — un séisme n'a pas de polygone d'avertissement pertinent, ce module
        raisonne donc plutôt à partir de l'épicentre et de la proximité.
      </>
    ),
    geoRows: [
      { k: "Test « dans la zone »", v: <><code>geo.point_in_polygon()</code> — un test de <strong>lancer de rayon</strong> sans dépendance. On lance un rayon vers l'est depuis le point de l'utilisateur et on compte les arêtes du polygone qu'il croise : un nombre <strong>impair</strong> signifie à l'intérieur, <strong>pair</strong> à l'extérieur. O(n) sur les sommets de l'anneau, exact, sans bibliothèque géométrique.</> },
      { k: "Valeur sûre par défaut", v: <><code>nws.compute_in_zone()</code> encapsule le test. Si un avertissement ne porte <em>aucun</em> polygone, il renvoie <code>true</code> — on suppose que vous êtes concerné plutôt que de vous écarter. Sous-avertir n'est jamais une erreur sûre.</> },
      { k: "Ancrage au centroïde", v: <>La moyenne des sommets de l'anneau donne un centroïde qui ancre l'utilisateur simulé (la démo « placez-moi dans une vraie alerte ») et amorce la recherche de lieu public.</> },
      { k: "Sélection du lieu", v: <><code>places._select()</code> réutilise le même test point-dans-polygone — les bâtiments candidats <em>à l'intérieur</em> du polygone sont préférés, puis classés par distance au centroïde — pour que la personne soit déposée à un endroit réel et véritablement dans la zone avertie.</> },
      { k: "Dessiné, pas zoomé", v: <>Le client rend l'anneau en remplissage rouge translucide pour le contexte, mais le laisse délibérément <em>ne pas</em> piloter le zoom de la carte — un polygone de la taille d'un comté zoomerait inutilement loin. La vue cadre plutôt les points d'action (vous, l'itinéraire, la destination).</> },
    ],

    tiersLabel: "Paliers de temps",
    tiers: [
      { label: "RUN",     window: "≈ 10 minutes", cls: "td-tier--run",  desc: "Menace imminente. Les consignes vitales codées en dur s'affichent instantanément, sans aucune dépendance d'API ; le plan complet se construit en arrière-plan." },
      { label: "ACT",     window: "≈ 1 heure",    cls: "td-tier--act",  desc: "Danger arrivant bientôt. Une vérification de situation en un geste et adaptée aux vulnérabilités (mobilité, médical, personnes à charge, véhicule), puis le module complet + le plan IA." },
      { label: "PREPARE", window: "≈ 6 heures",   cls: "td-tier--prep", desc: "Danger pas encore là. Le plan porte sur la préparation — itinéraire, provisions, signaux. Les actions d'abri sont conditionnelles, jamais impératives." },
    ],

    archLabel: "Architecture du système",
    archFrontH: "Frontend",
    archFront: [
      "React 18 (composants fonctionnels + hooks)",
      "Build Vite 6, cartographie Leaflet 1.9",
      "Aucune bibliothèque d'état global — App.jsx détient l'état et le passe en props",
      "PWA : service worker artisanal + manifeste web",
    ],
    archConn: "proxy /api",
    archBackH: "Backend",
    archBack: [
      "Python 3.10+ / FastAPI / Uvicorn (ASGI)",
      "Entièrement asynchrone ; appels concurrents via asyncio.gather",
      "Aucune base de données — l'état vit dans la requête, deux caches et localStorage",
      "Chaque adaptateur externe renvoie ok:false en cas d'échec, sans jamais lever d'exception",
    ],

    a11yLabel: "Sans les yeux, sans les mains, bilingue",
    a11yRows: [
      { k: "Lecture à voix haute", v: <>Chaque diapositive du plan, la carte vitale RUN et le plan de repli portent un bouton haut-parleur (Web Speech <code>SpeechSynthesis</code>) — pour qu'une personne en mouvement, paniquée ou incapable de lire l'écran reçoive quand même la consigne. La narration est annulée au changement de diapositive pour qu'une voix ne déborde jamais sur la suivante.</> },
      { k: "Saisie vocale", v: <>Les zones de question, d'ajout d'étape et « quelque chose a changé » acceptent la dictée (<code>SpeechRecognition</code>) — aucune saisie requise sous stress.</> },
      { k: "Orientation de l'appareil", v: <>Le repère « vous êtes ici » affiche un cône d'orientation en direct piloté par la boussole de l'appareil (<code>deviceorientation</code> / iOS <code>webkitCompassHeading</code>, corrigé pour la rotation de l'écran), pour que « dirigez-vous au NE » corresponde à une direction que l'utilisateur peut physiquement voir.</> },
      { k: "EN / FR", v: <>Un sélecteur de langue produit le plan, le titre et les questions-réponses de suivi en français (couverture US + Canada ; le Canada est officiellement bilingue). Le repli déterministe hors ligne est <em>aussi</em> bilingue (<code>modules._plan_fr</code>), pour que le français survive à une panne totale de l'IA.</> },
    ],
    a11yNote: "Tout cela se dégrade en douceur : un navigateur sans synthèse vocale ni orientation masque simplement ces options et se comporte exactement comme avant.",

    aiLabel: "Synthèse IA",
    aiRows: [
      { k: "Fournisseur", v: <>OpenRouter (compatible OpenAI), via le SDK asynchrone <code>openai</code></> },
      { k: "Modèle", v: <><code>anthropic/claude-sonnet-4-6</code> — configurable via <code>OPENROUTER_MODEL</code> ; vision via <code>OPENROUTER_VISION_MODEL</code></> },
      { k: "Points d'appel", v: <>Analyse visuelle de la capture · synthèse du plan (étape 5) · étape/question de suivi · plus le flux Rétablir : <code>synthesize_cleanup</code> · <code>recovery_follow_up</code> · <code>analyze_paperwork</code> · <code>ocr_document_text</code> (photo de lettre → texte). Les délais de rétablissement utilisent un modèle <strong>l'IA extrait / le code calcule</strong> : le modèle renvoie la structure du délai, <code>reconcile_deadlines</code> fait le calcul de date et le remplace.</> },
      { k: "Contrat", v: <>JSON strict + analyseur défensif ; tout échec retombe sur le plan déterministe (<code>modules.build_plan</code> pour la réponse, <code>recovery.*</code> pour Rétablir)</> },
      { k: "Contexte temporel", v: <><code>_timing_context()</code> calcule les minutes avant/depuis l'expiration + le statut actif/expiré à partir du <code>now</code> du client et de l'<code>expires</code> de l'alerte, pour que les plans s'ancrent dans l'heure réelle et que « ai-je encore le temps ? » obtienne une réponse concrète</> },
    ],

    recLabel: "Rétablir — le troisième acte",
    recBody: "Après Recevoir et Répondre vient Rétablir. Un plan en direct surveille sa propre alerte et propose un passage en un toucher dès qu'elle se dissipe. L'utilisateur choisit le danger vécu et obtient une surface cohérente — un guide de nettoyage et un assistant « Demandez n'importe quoi » — réutilisant le même moteur déterministe-d'abord, fondé sur le RAG (sans alerte en direct ni carte).",
    recRows: [
      { k: "Nettoyage & retour", v: <>Une récupération RAG de rétablissement + un appel IA (<code>ai.synthesize_cleanup</code>) renvoie le même plan <code>{"{summary, steps[]}"}</code> que le diaporama affiche — <em>avant de rentrer → tout documenter → nettoyer → santé &amp; suite</em>. Vous pouvez joindre une lettre d'assurance/FEMA/d'aide (collée ou photographiée) : elle est lue (OCR), caviardée, extraite, et ses délais calculés sont intégrés au plan. Repli sur <code>recovery.cleanup_fallback</code>.</> },
      { k: "Moteur de paperasse", v: <><code>recovery.py</code> + <code>ai.analyze_paperwork</code>. <strong>Calcule</strong> les délais (absolus + relatifs résolus par rapport aux dates déclencheuses → date, jours restants, urgence) ; <code>classify_document</code> note le type ; <code>extract_contact_details</code> / <code>identify_issuer_details</code> extraient des contacts classés et filtrés + l'émetteur avec confiance ; <code>has_meaningful_extracted_text</code> repère les téléversements scannés. Il <em>explique</em> — ne décide jamais de la couverture, de l'éligibilité ni des droits — avec une liste de vérification humaine bilingue.</> },
      { k: "Garde-fou de confidentialité", v: <><code>recovery.redact_sensitive_data()</code> s'exécute <em>avant</em> toute analyse et caviarde les NAS probables, numéros de banque/carte/compte, numéros complets de police/réclamation, adresses exactes et identifiants en <code>[REDACTED]</code>, puis <strong>continue</strong> (caviardage automatique, pas de rejet) et indique ce qui a été retiré — les données signalées ne sont jamais envoyées, sans obliger l'utilisateur à les modifier à la main.</> },
      { k: "RAG de rétablissement", v: <>Un second jeu de sources (<code>GOV_SOURCES_RECOVERY</code> — Ready.gov, CDC, EPA, Earthquake Country Alliance) lu via <code>fetch_recovery_rag()</code>, mis en cache sous une clé <code>recovery:&lt;hazard&gt;</code> pour ne jamais entrer en collision avec le cache du flux de réponse.</> },
    ],

    cacheLabel: "Stratégie de cache RAG",
    cacheMem: { badge: "En mémoire · 24 h", p: <>Réutilisation à chaud au sein d'une session/journée. Écrit après toute récupération réussie.</> },
    cacheFile: { badge: "Fichier · 30 j", p: <><code>rag_monthly_cache.json</code> — survit aux redémarrages ; base de référence durable. Écrit seulement s'il manque ou s'il a &gt; 30 jours.</> },
    cacheLogic: [
      { tag: "URGENT", cls: "td-pat--shelter", v: <>RUN / ACT ne bloquent jamais sur le réseau — utilisent le cache le plus récent ; ne récupèrent en direct que si rien d'utilisable n'existe.</> },
      { tag: "PREPARE", cls: "td-pat--routing", v: <>Récupère du frais pour la précision ; ignore si le cache de 24 h est déjà plus récent ; en cas d'échec, retombe sur n'importe quel cache.</> },
      { tag: "PRÉCHAUFFE", cls: "td-pat--routing", v: <><code>/api/module</code> lance une récupération en arrière-plan pour que le cache soit généralement chaud quand <code>/api/recommend</code> s'exécute.</> },
    ],

    svcLabel: "Données et services externes",
    svcHead: ["Service", "Utilisé pour", "Clé ?"],
    services: [
      { svc: "OpenRouter (anthropic/claude-sonnet-4-6)", use: "Analyse visuelle + synthèse du plan + suivi + rétablissement", key: "Yes", keyLabel: "Oui" },
      { svc: "NWS api.weather.gov",        use: "Alertes actives en direct (US)", key: "No", keyLabel: "Non" },
      { svc: "ECCC GeoMet",                use: "Alertes actives en direct (Canada)", key: "No", keyLabel: "Non" },
      { svc: "Open-Meteo Elevation",       use: "Raisonnement sur les hauteurs (inondation)", key: "No", keyLabel: "Non" },
      { svc: "Open-Meteo Forecast",        use: "Vent actuel (incendie)", key: "No", keyLabel: "Non" },
      { svc: "Overpass API (3 miroirs)",   use: "Bâtiments sûrs / provisions / espaces dégagés", key: "No", keyLabel: "Non" },
      { svc: "NASA FIRMS",                 use: "Détections d'incendie actif (incendie)", key: "Optional", keyLabel: "Optionnelle" },
      { svc: "USGS Earthquake feed",       use: "Confirmation de séisme récent", key: "No", keyLabel: "Non" },
      { svc: "Nominatim (OSM)",            use: "Géocodage inverse du libellé de lieu", key: "No", keyLabel: "Non" },
      { svc: "OSRM",                       use: "Routage routier pour la carte", key: "No", keyLabel: "Non" },
      { svc: "Google News RSS",            use: "Titres locaux pour le flux en direct", key: "No", keyLabel: "Non" },
      { svc: "Esri / OpenTopoMap / OSM",   use: "Fonds de carte + ombrage du relief", key: "No", keyLabel: "Non" },
    ],

    apiLabel: "Référence d'API",
    endpoints: [
      { m: "GET",  path: "/api/health",            purpose: "Disponibilité + quelles clés optionnelles sont configurées" },
      { m: "POST", path: "/api/alert",             purpose: "Étapes 1+2 : situation + danger + palier de temps (+ consignes RUN)" },
      { m: "POST", path: "/api/alert/status",      purpose: "Revérifier l'alerte consultée → état (escaladé/dissipé/…) + transfert recoverSuggested" },
      { m: "POST", path: "/api/analyze_screenshot", purpose: "Flux réel : analyse visuelle d'une capture → situation + triage" },
      { m: "POST", path: "/api/module",            purpose: "Étape 4 : module de danger → données carte + plan déterministe (préchauffe le RAG)" },
      { m: "POST", path: "/api/recommend",         purpose: "Étape 5 : RAG + actualités + un appel IA → plan affiné" },
      { m: "POST", path: "/api/follow-up",         purpose: "Ajouter une étape ou répondre à une question, fondé sur le RAG" },
      { m: "POST", path: "/api/recover/cleanup",   purpose: "Rétablir A : plan diaporama de nettoyage / retour (RAG de rétablissement + IA, repli déterministe)" },
      { m: "POST", path: "/api/recover/followup",  purpose: "Rétablir A : ajouter une étape / répondre à une question sur le plan de nettoyage" },
      { m: "POST", path: "/api/recover/paperwork", purpose: "Rétablir : analyser une lettre (caviardage automatique, puis continue) → délais calculés, classification, contacts" },
      { m: "GET",  path: "/api/demo/live",         purpose: "Trouver une catastrophe active maintenant + un point où se placer" },
      { m: "GET",  path: "/api/demo/live/list",    purpose: "Trouver jusqu'à 5 catastrophes actives (diversifiées) pour le sélecteur" },
      { m: "POST", path: "/api/demo/live/place",   purpose: "Résoudre un lieu public réel où se placer pour une catastrophe en direct choisie" },
      { m: "GET",  path: "/api/demo/coords",       purpose: "Les coordonnées de démo soignées par danger" },
    ],

    resLabel: "Contrat de résilience",
    resList: [
      <>Chaque adaptateur <code>APIs/*</code> renvoie une forme <code>{"{ok: false}"}</code> en cas d'échec plutôt que de lever une exception.</>,
      <>La carte se rend à partir des données du module sans attendre l'IA.</>,
      <>Le dernier plan est persisté côté client et reprenable hors ligne ; le service worker sert le shell de l'app + les polices hors ligne (les tuiles/API en direct nécessitent toujours le réseau).</>,
    ],

    rlLabel: "Limitation de débit & protection anti-abus",
    rlBody: "L'API est publique et non authentifiée, et plusieurs points d'accès déclenchent des appels OpenRouter payants. Un limiteur à fenêtre glissante en mémoire et sans dépendance (ratelimit.RateLimitMiddleware) régule chaque requête /api/* sauf /api/health, renvoyant un 429 avec un en-tête Retry-After quand une fenêtre est dépassée.",
    rlRows: [
      { k: "Par IP · tous les points d'accès", v: <><strong>90 requêtes / minute</strong> par IP cliente sur toute l'API — empêche un seul client de marteler le service.</> },
      { k: "Par IP · chemins IA", v: <><strong>12 requêtes / minute</strong> sur les chemins payants (<code>/api/recommend</code>, <code>/api/analyze_screenshot</code>, <code>/api/follow-up</code>), car chaque appel coûte de l'argent réel.</> },
      { k: "Global · chemins IA", v: <><strong>90 requêtes / minute</strong> pour <em>tous</em> les clients confondus — un plafond strict sur la dépense IA. Les limites par IP sont falsifiables ; ce garde-fou global est ce qui plafonne réellement le budget, donc usurper des IP source ne peut pas faire grimper la facture.</> },
      { k: "Réponse en cas de dépassement", v: <><code>HTTP 429</code> avec un corps <code>{"{ok: false}"}</code> et un en-tête <code>Retry-After</code> (secondes avant que le plus ancien appel de la fenêtre n'expire).</> },
      { k: "Identité du client", v: <>Résolue depuis <code>X-Forwarded-For</code> / <code>X-Real-IP</code> (PythonAnywhere termine le TLS à un proxy frontal), avec repli sur le pair socket. Les compartiments périmés sont balayés au plus une fois par minute pour que la mémoire ne croisse pas sans borne.</> },
      { k: "Portée", v: <>Les compteurs sont en mémoire, donc les limites sont <em>par processus worker</em>. Le déploiement PythonAnywhere ne fait tourner qu'un seul worker web (c'est donc efficace) ; passer à plusieurs workers/hôtes nécessiterait des compteurs partagés (Redis/Memcached).</> },
    ],

    limLabel: "Limites connues",
    limits: [
      ["Alertes en direct : la météo couvre US + Canada ; séismes/incendies sont mondiaux.", "Le bouton d'alerte en direct enchaîne NWS → ECCC → USGS → FIRMS. Les séismes et incendies sont détectés partout ; seuls les avertissements météo sont limités au US + Canada. Chaque source renvoie une alerte — les multi-dangers simultanés ne sont pas fusionnés."],
      ["Le flux par capture n'a pas d'expiration lisible par machine.", "L'IA reçoit toujours l'heure actuelle et ancre le temps restant sur l'expiration de l'alerte quand elle est présente (la démo l'amorce ; le NWS/ECCC en direct la portent). L'analyseur visuel n'extrait pas encore l'expiration d'une image, donc les téléversements ont le contexte de l'heure actuelle mais pas de compte à rebours."],
      ["Hors ligne ≠ totalement hors ligne.", "Le shell de l'app et le dernier plan fonctionnent hors ligne, mais les tuiles de carte en direct, le routage et tout nouvel appel d'API nécessitent encore le réseau."],
      ["Latence d'Overpass.", "Les recherches de lieux peuvent être lentes (bascule multi-miroirs avec délais généreux) ; c'est le coût dominant de l'étape 4."],
      ["L'altitude est à ~90 m de résolution.", "Copernicus via Open-Meteo — bon pour savoir de quel côté le sol monte, pas pour le détail fin. Reporté dans la confiance du plan."],
      ["Les actualités de démo sont synthétiques.", "Le mode démo utilise des titres fictifs soignés ; seul le flux en direct récupère de vraies actualités."],
      ["Le sélecteur de simulation est non déterministe.", "/api/demo/live/list diversifie par danger et mélange, donc les cinq événements proposés varient d'une exécution à l'autre, à dessein."],
      ["Le caviardage automatique du rétablissement est au mieux ; les photos passent par le modèle de vision.", "Les données sensibles sont supprimées par correspondance de motifs avant que tout texte n'atteigne l'IA, mais la détection n'est pas exhaustive. Une lettre photographiée est lue (OCR) par le modèle de vision avant que la suppression au niveau texte n'intervienne, donc la protection porte sur le texte extrait, pas sur l'image."],
    ],

    backToHow: "Retour à Comment ça marche",
  },
};

export default function TechnicalDocs({ onBack, language = "en" }) {
  const c = C[language] || C.en;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {c.back}
        </button>
        <span className="hazard-chip"><Icon name="info" size={16} /> {c.chip}</span>
      </header>

      <div className="td-root rise">

        {/* ── Title ── */}
        <div className="td-hero">
          <div className="td-eyebrow">{c.eyebrow}</div>
          <h1 className="td-title">{c.title}</h1>
          <p className="td-lede">{c.lede}</p>
        </div>

        {/* ── Core ideas ── */}
        <section className="td-section">
          <div className="td-label">{c.coreLabel}</div>
          <div className="td-principles">
            {c.principles.map((pr) => (
              <div className="td-principle" key={pr.h}>
                <div className="td-principle-h">{pr.h}</div>
                <p>{pr.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pipeline (visual graph) ── */}
        <section className="td-section">
          <div className="td-label">{c.pipelineLabel}</div>
          <p className="td-body">{c.pipelineBody}</p>
          <div className="td-pipeline">
            {c.stages.map((s, i) => (
              <div className="td-stage-wrap" key={s.n}>
                <div className="td-stage">
                  <div className="td-stage-num">{s.n}</div>
                  <div className="td-stage-body">
                    <div className="td-stage-name">{s.name}</div>
                    <div className="td-stage-where">{s.where}</div>
                    <div className="td-stage-what">{s.what}</div>
                  </div>
                </div>
                {i < c.stages.length - 1 && <div className="td-stage-arrow"><Icon name="arrow" size={16} /></div>}
              </div>
            ))}
          </div>
        </section>

        {/* ── Data-flow (visual graph) ── */}
        <section className="td-section">
          <div className="td-label">{c.flowLabel}</div>
          <div className="td-flow">

            <div className="td-flow-tier">
              <div className="td-flow-tier-label">{c.flowEntry}</div>
              <div className="td-flow-row">
                {c.flowEntryNodes.map((n) => (
                  <div className="td-node td-node--entry" key={n.t}>{n.t}<span>{n.s}</span></div>
                ))}
              </div>
            </div>

            <div className="td-flow-down"><span /></div>

            <div className="td-flow-tier">
              <div className="td-flow-tier-label">{c.flowTriage}</div>
              <div className="td-flow-row">
                <div className="td-node td-node--key">{c.flowTriageNode}</div>
              </div>
            </div>

            <div className="td-flow-split">
              <span className="td-flow-split-line" />
            </div>

            <div className="td-flow-row td-flow-row--branches">
              <div className="td-branch">
                <div className="td-branch-tag td-branch-tag--run">RUN</div>
                <div className="td-node td-node--instant">{c.flowRunInstant.t}<span>{c.flowRunInstant.s}</span></div>
                <div className="td-flow-down td-flow-down--sm"><span /></div>
                <div className="td-node td-node--muted">{c.flowRunBg.t}<span>{c.flowRunBg.s}</span></div>
              </div>
              <div className="td-branch">
                <div className="td-branch-tag td-branch-tag--act">ACT / PREPARE</div>
                <div className="td-node td-node--muted">{c.flowActNode.t}<span>{c.flowActNode.s}</span></div>
              </div>
            </div>

            <div className="td-flow-down"><span /></div>

            <div className="td-flow-tier">
              <div className="td-flow-tier-label">{c.flowModule}</div>
              <div className="td-flow-row">
                {c.flowModNodes.map((n) => (
                  <div className="td-node td-node--mod" key={n.t}>{n.t}<span>{n.s}</span></div>
                ))}
              </div>
              <div className="td-flow-note">{c.flowModNote}</div>
            </div>

            <div className="td-flow-down"><span /></div>

            <div className="td-flow-tier">
              <div className="td-flow-tier-label">{c.flowSynth}</div>
              <div className="td-flow-row">
                <div className="td-node td-node--ai">
                  {c.flowSynthNode.t}
                  <span>{c.flowSynthNode.s}</span>
                  <span className="td-node-fallback">{c.flowSynthNode.fb}</span>
                </div>
              </div>
            </div>

            <div className="td-flow-down"><span /></div>

            <div className="td-flow-tier">
              <div className="td-flow-tier-label">{c.flowPlan}</div>
              <div className="td-flow-row">
                {c.flowPlanNodes.map((n) => (
                  <div className="td-node td-node--out" key={n.t}>{n.t}<span>{n.s}</span></div>
                ))}
              </div>
              <div className="td-flow-note">{c.flowPlanNote}</div>
            </div>

          </div>
        </section>

        {/* ── Hazard matrix ── */}
        <section className="td-section">
          <div className="td-label">{c.hazLabel}</div>
          <div className="td-table">
            <div className="td-tr td-tr--head">
              {c.hazHead.map((h) => <span key={h}>{h}</span>)}
            </div>
            {c.hazards.map((h) => (
              <div className="td-tr" key={h.name}>
                <span className="td-td-strong">{h.name}</span>
                <span><span className={`td-pat td-pat--${h.pattern}`}>{h.patLabel}</span></span>
                <span>{h.action}</span>
                <span className="td-td-muted">{h.data}</span>
              </div>
            ))}
          </div>
          <p className="td-body td-body--note">{c.hazNote}</p>
        </section>

        {/* ── Threat geometry ── */}
        <section className="td-section">
          <div className="td-label">{c.geoLabel}</div>
          <p className="td-body">{c.geoBody}</p>

          <div className="td-kv">
            {c.geoRows.map((r) => (
              <div className="td-kv-row" key={r.k}>
                <span className="td-kv-k">{r.k}</span>
                <span className="td-kv-v">{r.v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Time tiers (visual) ── */}
        <section className="td-section">
          <div className="td-label">{c.tiersLabel}</div>
          <div className="td-tiers">
            {c.tiers.map((t) => (
              <div className={`td-tier ${t.cls}`} key={t.label}>
                <div className="td-tier-top">
                  <span className="td-tier-label">{t.label}</span>
                  <span className="td-tier-window">{t.window}</span>
                </div>
                <p className="td-tier-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── System architecture ── */}
        <section className="td-section">
          <div className="td-label">{c.archLabel}</div>
          <div className="td-arch">
            <div className="td-arch-col">
              <div className="td-arch-h">{c.archFrontH}</div>
              <ul>
                {c.archFront.map((li) => <li key={li}>{li}</li>)}
              </ul>
            </div>
            <div className="td-arch-conn"><span>{c.archConn}</span></div>
            <div className="td-arch-col">
              <div className="td-arch-h">{c.archBackH}</div>
              <ul>
                {c.archBack.map((li) => <li key={li}>{li}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Accessibility ── */}
        <section className="td-section">
          <div className="td-label">{c.a11yLabel}</div>
          <div className="td-kv">
            {c.a11yRows.map((r) => (
              <div className="td-kv-row" key={r.k}>
                <span className="td-kv-k">{r.k}</span>
                <span className="td-kv-v">{r.v}</span>
              </div>
            ))}
          </div>
          <p className="td-body td-body--note">{c.a11yNote}</p>
        </section>

        {/* ── AI ── */}
        <section className="td-section">
          <div className="td-label">{c.aiLabel}</div>
          <div className="td-kv">
            {c.aiRows.map((r) => (
              <div className="td-kv-row" key={r.k}><span className="td-kv-k">{r.k}</span><span className="td-kv-v">{r.v}</span></div>
            ))}
          </div>
        </section>

        {/* ── Recover ── */}
        <section className="td-section">
          <div className="td-label">{c.recLabel}</div>
          <p className="td-body">{c.recBody}</p>
          <div className="td-kv">
            {c.recRows.map((r) => (
              <div className="td-kv-row" key={r.k}><span className="td-kv-k">{r.k}</span><span className="td-kv-v">{r.v}</span></div>
            ))}
          </div>
        </section>

        {/* ── Caching (visual) ── */}
        <section className="td-section">
          <div className="td-label">{c.cacheLabel}</div>
          <div className="td-cache">
            <div className="td-cache-tier">
              <div className="td-cache-badge">{c.cacheMem.badge}</div>
              <p>{c.cacheMem.p}</p>
            </div>
            <div className="td-cache-tier">
              <div className="td-cache-badge">{c.cacheFile.badge}</div>
              <p>{c.cacheFile.p}</p>
            </div>
          </div>
          <div className="td-cache-logic">
            {c.cacheLogic.map((l) => (
              <div className="td-cache-logic-row" key={l.tag}><span className={`td-pat ${l.cls}`}>{l.tag}</span> {l.v}</div>
            ))}
          </div>
        </section>

        {/* ── External services ── */}
        <section className="td-section">
          <div className="td-label">{c.svcLabel}</div>
          <div className="td-table td-table--svc">
            <div className="td-tr td-tr--head">{c.svcHead.map((h) => <span key={h}>{h}</span>)}</div>
            {c.services.map((s) => (
              <div className="td-tr" key={s.svc}>
                <span className="td-td-strong">{s.svc}</span>
                <span className="td-td-muted">{s.use}</span>
                <span><span className={`td-key td-key--${s.key.toLowerCase()}`}>{s.keyLabel}</span></span>
              </div>
            ))}
          </div>
        </section>

        {/* ── API reference ── */}
        <section className="td-section">
          <div className="td-label">{c.apiLabel}</div>
          <div className="td-endpoints">
            {c.endpoints.map((e) => (
              <div className="td-endpoint" key={e.path}>
                <span className={`td-method td-method--${e.m.toLowerCase()}`}>{e.m}</span>
                <code className="td-path">{e.path}</code>
                <span className="td-endpoint-purpose">{e.purpose}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Resilience ── */}
        <section className="td-section">
          <div className="td-label">{c.resLabel}</div>
          <ul className="td-list">
            {c.resList.map((li, i) => <li key={i}>{li}</li>)}
          </ul>
        </section>

        {/* ── Rate limiting ── */}
        <section className="td-section">
          <div className="td-label">{c.rlLabel}</div>
          <p className="td-body">{c.rlBody}</p>
          <div className="td-kv">
            {c.rlRows.map((r) => (
              <div className="td-kv-row" key={r.k}><span className="td-kv-k">{r.k}</span><span className="td-kv-v">{r.v}</span></div>
            ))}
          </div>
        </section>

        {/* ── Known limitations ── */}
        <section className="td-section">
          <div className="td-label">{c.limLabel}</div>
          <div className="td-limits">
            {c.limits.map(([h, d]) => (
              <div className="td-limit" key={h}>
                <div className="td-limit-h">{h}</div>
                <div className="td-limit-d">{d}</div>
              </div>
            ))}
          </div>
        </section>

        <button className="primary" style={{ marginTop: "8px" }} onClick={onBack}>
          <Icon name="back" size={16} /> {c.backToHow}
        </button>
      </div>
    </div>
  );
}
