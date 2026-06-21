import { useEffect, useRef, useState } from "react";
import { getHealth, getAlert, getAlertStatus, findLiveDisasters, resolveLivePlace, analyzeScreenshot, runModule, getRecommendation, followUp, getCleanupPlan, recoveryFollowUp, analyzePaperwork } from "./api.js";
import { emitLog, subscribeLog } from "./logBus.js";
import { HAZARDS, hazardLabel, tierLabel } from "./hazards.js";
import Home from "./components/HomeLanding.jsx";
import Landing from "./components/Landing.jsx";
import StartScreen from "./components/StartScreen.jsx";
import ScreenshotIntake from "./components/ScreenshotIntake.jsx";
import NotificationCard from "./components/NotificationCard.jsx";
import DisasterPicker from "./components/DisasterPicker.jsx";
import Instructions from "./components/InstructionsLanding.jsx";
import ResourceCheck from "./components/ResourceCheck.jsx";
import { makeT } from "./i18n.js";
import RunGuidance from "./components/RunGuidance.jsx";
import Slideshow from "./components/Slideshow.jsx";
import CrisisMap from "./components/CrisisMap.jsx";
import ConcernsBox from "./components/ConcernsBox.jsx";
import QuestionsBox from "./components/QuestionsBox.jsx";
import PaperworkBox from "./components/PaperworkBox.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import RecoverHub from "./components/RecoverHub.jsx";
import RecoverCleanupIntake from "./components/RecoverCleanupIntake.jsx";
import Icon from "./components/Icon.jsx";

const DEFAULT_RESOURCES = {
  mobility: "foot", hasSlowMovers: false, hasSupplies: false, atHome: true,
  hasVehicle: false, mobilityLimited: false, medicalNeeds: false, dependents: false,
};

// "Ask anything" suggestion chips. label = short chip text; text = the question
// actually sent to the AI (answered against the user's live situation/plan).
const RESPOND_SUGGESTIONS = {
  en: [
    { label: "How much time do I have?", text: "How much time do I realistically have before this becomes dangerous?" },
    { label: "What should I bring?", text: "What should I bring with me if I have to leave?" },
    { label: "Is it safe to drive?", text: "Is it safe to drive right now, or should I stay where I am?" },
    { label: "What if I smell gas?", text: "What should I do if I smell gas?" },
  ],
  fr: [
    { label: "Combien de temps ai-je ?", text: "De combien de temps est-ce que je dispose vraiment avant que ce soit dangereux ?" },
    { label: "Quoi apporter ?", text: "Que devrais-je apporter si je dois partir ?" },
    { label: "Puis-je conduire ?", text: "Est-il sécuritaire de conduire maintenant, ou devrais-je rester sur place ?" },
    { label: "Et si je sens du gaz ?", text: "Que dois-je faire si je sens du gaz ?" },
  ],
};
const RECOVER_SUGGESTIONS = {
  en: [
    { label: "Safe to go back in?", text: "Is it safe to go back into my home yet, and what should I check first?" },
    { label: "Dealing with mold", text: "How do I deal with mold after water damage?" },
    { label: "Is my water safe?", text: "Is my tap water safe to drink after this disaster?" },
  ],
  fr: [
    { label: "Puis-je rentrer ?", text: "Est-il sécuritaire de rentrer chez moi, et que devrais-je vérifier en premier ?" },
    { label: "Gérer la moisissure", text: "Comment gérer la moisissure après des dégâts d'eau ?" },
    { label: "Mon eau est-elle sûre ?", text: "Mon eau du robinet est-elle potable après cette catastrophe ?" },
  ],
};

const TIER_TIME_SHORT = {
  en: { RUN: "Under 10 min", ACT: "Under 1 hour", PREPARE: "Under 6 hours" },
  fr: { RUN: "Moins de 10 min", ACT: "Moins d'1 heure", PREPARE: "Moins de 6 heures" },
};

const TIER_CLASS = { RUN: "tier-run", ACT: "tier-act", PREPARE: "tier-prepare" };

// localStorage key for the last generated plan (offline resume).
const PLAN_STORAGE_KEY = "c2a:lastPlan";

// Emergency number by country (from the reverse-geocoded country code). US + Canada
// are the supported scope (both 911); a few common ones are included so the number
// is never wrong if someone runs it elsewhere. Falls back to 112 (GSM standard).
const EMERGENCY_BY_COUNTRY = {
  us: "911", ca: "911", mx: "911",
  gb: "999", ie: "999",
  au: "000", nz: "111",
  in: "112", za: "112",
};
const DEFAULT_EMERGENCY = "112";

const DEMO_NEWS = {
  flood: [
    { title: "Flash flood warning extended through tonight", snippet: "NWS extended the flash flood warning until midnight. Residents in low-lying areas are urged to move to higher ground immediately." },
    { title: "Highway 1 closed: water over road at mile marker 12", snippet: "Fast-moving water reported over the highway at multiple points. One vehicle was swept off; driver rescued by emergency crews." },
    { title: "Red Cross shelter open at Lincoln High School", snippet: "Capacity for 300 people. Pets welcome. Bring medications and important documents. Shelter fills quickly." },
  ],
  wildfire: [
    { title: "Fire doubles in size overnight, 0% containment", snippet: "Strong gusty winds pushed the fire through the eastern perimeter. Embers spotted landing up to 2 miles ahead of the main fire front." },
    { title: "Mandatory evacuation order expanded to Zone B", snippet: "Authorities expanded the order after a spot fire jumped the firebreak near the reservoir. Do not wait to be told to leave." },
    { title: "Air quality hazardous, visibility under 1 mile", snippet: "Smoke pushed AQI to 425 in surrounding communities. Authorities say leaving now is safer than sheltering in place." },
  ],
  tornado: [
    { title: "Tornado confirmed on ground 8 miles southwest", snippet: "Storm chasers and radar confirm a large rain-wrapped tornado moving northeast at 35 mph. EF2 or greater expected." },
    { title: "Mobile home park hit, multiple injuries reported", snippet: "Emergency crews responding to a mobile home community in the tornado's path. Residents urged to seek sturdy shelter now." },
    { title: "Power outages across county, lines down on Main and Oak", snippet: "Downed power lines reported across multiple neighborhoods. Do not approach. Expect emergency vehicles on all roads." },
  ],
  earthquake: [
    { title: "Magnitude 5.8 aftershock recorded 20 minutes ago", snippet: "USGS confirms a significant aftershock. Further aftershocks are expected over the next 24 hours. Avoid damaged structures." },
    { title: "Gas main ruptures reported in downtown district", snippet: "Utility crews responding to multiple gas line breaks. Anyone smelling gas should evacuate and call 911 from a safe distance." },
    { title: "Several bridges closed pending structural inspection", snippet: "Engineers inspecting all major bridges before reopening. Use alternate routes and avoid overpasses where possible." },
  ],
};

export default function App() {
  // home | demo | screenshot | picker | notification | run | resource | result
  const [phase, setPhase] = useState("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);

  const [user, setUser] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [emergencyNumber, setEmergencyNumber] = useState("911");
  const [now, setNow] = useState(() => new Date());
  const [hazardType, setHazardType] = useState(null);
  const [situation, setSituation] = useState(null);
  const [timeTier, setTimeTier] = useState(null);
  const [tierReason, setTierReason] = useState("");
  const [runGuide, setRunGuide] = useState(null);

  const [moduleData, setModuleData] = useState(null);
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [rec, setRec] = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  // Live alert-state watching: while a plan is open we re-check the alert so the
  // plan can react to escalation/clearing and hand off into Recover when it's over.
  const [alertStatus, setAlertStatus] = useState(null);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // User concern / plan-update note.
  const [userNote, setUserNote] = useState("");
  const [concernLoading, setConcernLoading] = useState(false);
  // Increments each time the plan is regenerated - forces Slideshow to reset to slide 0.
  const [planVersion, setPlanVersion] = useState(0);
  // True after the user submits a concern note and the plan regenerates.
  const [planUpdated, setPlanUpdated] = useState(false);
  // News context built during demo fake-fetch, reused on plan updates.
  const [newsContext, setNewsContext] = useState("");
  // UI + AI-output language. ProtectionIV covers the US + bilingual Canada, so a
  // francophone user can switch the plan (and key labels) to French. The choice is
  // made up-front — on the marketing landing and the app home screen — and locked
  // for the session, so the AI is *only ever asked* in the chosen language. (It is
  // deliberately NOT offered mid-pipeline: switching after a plan is generated would
  // leave already-built English text in place. See the language note in App's home.)
  // Persisted so it survives a refresh and carries from the landing into the app.
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem("c2a:lang") || "en"; } catch { return "en"; }
  });
  const t = makeT(language);

  // URL-based routing. Four top-level routes:
  //   /usaii/           → marketing landing
  //   /usaii/app        → the crisis-response app
  //   /usaii/howitworks → How it works page
  //   /usaii/tech       → Technical docs page
  // Internal app phases (screenshot, demo, result, …) remain state-based.
  const BASE = '/usaii';
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function navigate(to) {
    history.pushState(null, '', to);
    setRoutePath(to);
  }
  const route =
    routePath === BASE + '/howitworks' ? 'howitworks' :
    routePath === BASE + '/tech'       ? 'tech' :
    routePath.startsWith(BASE + '/app') ? 'app' :
    'landing';

  useEffect(() => {
    try { localStorage.setItem("c2a:lang", language); } catch { /* storage unavailable */ }
  }, [language]);

  // Extra steps appended via the end-of-plan guidance button.
  const [extraSteps, setExtraSteps] = useState([]);
  const [stepLoading, setStepLoading] = useState(false);

  // Transient confirmation after sharing/copying the plan.
  const [shareMsg, setShareMsg] = useState("");
  // A plan saved to localStorage from a previous session (offline resume).
  const [savedPlan, setSavedPlan] = useState(null);

  // Recover flow (post-disaster). Separate from the alert pipeline above: the user
  // picks a hazard in the hub, then either the clean-up guide (an AI slideshow plan)
  // or the paperwork helper. recoverHazard is kept apart from hazardType so it can't
  // clobber an in-progress response plan.
  const [recoverHazard, setRecoverHazard] = useState(null);
  const [recoverInitialText, setRecoverInitialText] = useState("");
  const [cleanupRec, setCleanupRec] = useState(null);
  const [cleanupRedactions, setCleanupRedactions] = useState([]);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  // The intake that produced the current clean-up plan, kept so "something changed"
  // can regenerate the whole plan with the note folded in.
  const [cleanupInput, setCleanupInput] = useState(null);
  const [cleanupExtraSteps, setCleanupExtraSteps] = useState([]);
  const [cleanupStepLoading, setCleanupStepLoading] = useState(false);
  const [cleanupConcernLoading, setCleanupConcernLoading] = useState(false);
  const [cleanupUpdated, setCleanupUpdated] = useState(false);
  const [cleanupVersion, setCleanupVersion] = useState(0);
  const [cleanupShareMsg, setCleanupShareMsg] = useState("");

  // "No alert at your location" message - shown inside the live-check card, not as a generic error.
  const [liveMessage, setLiveMessage] = useState("");
  // Activity log - demo mode only.
  const [logEntries, setLogEntries] = useState([]);
  // True during the "simulate me next to a real, active disaster" flow. The data
  // is live (real NWS/USGS), but the user's proximity is simulated.
  const [liveDemoActive, setLiveDemoActive] = useState(false);
  // Up to 5 live disasters offered for the user to choose from (picker phase).
  const [liveOptions, setLiveOptions] = useState([]);
  const isDemo = situation?.source === "mock";
  // Show the API activity log for either flavour of demo (synthetic or real-data).
  const showLog = isDemo || liveDemoActive;

  // Dedup concurrent fetchModule calls - both the useEffect and runRecommendation
  // may call fetchModule before the first resolves; share the same promise instead.
  const modulePromiseRef = useRef(null);
  // Guard so the RUN-tier background plan is kicked off exactly once per alert.
  const runPlanStartedRef = useRef(false);
  // Wall-clock time the current plan was generated, so follow-ups can tell the AI
  // how long ago it was built ("you generated this 8 minutes ago").
  const planGeneratedAtRef = useRef(null);
  // Identifies the current disaster/plan context. Bumped whenever a new disaster
  // begins (storeAlert) or we reset (goHome). An in-flight recommendation/follow-up
  // captures this at request time and discards its result if it changed in the
  // meantime — so a slow response from a previous disaster can't clobber the new plan.
  const sessionRef = useRef(0);

  // Human-readable age of the current plan, for follow-up timing context.
  function formatPlanAge() {
    const t = planGeneratedAtRef.current;
    if (!t) return null;
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins <= 0) return "just now";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? "about 1 hour ago" : `about ${hrs} hours ago`;
  }

  useEffect(() => {
    // Only accumulate log entries during a demo session (synthetic or real-data).
    if (!showLog) return;
    const unsub = subscribeLog((entry) => {
      setLogEntries((prev) => [...prev.slice(-300), entry]);
    });
    return unsub;
  }, [showLog]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
  }, []);

  // Keep the topbar clock current (tick every 20s).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);

  // Watch the alert while a plan is open: re-check it (live) or read its expiry
  // clock (demo) every 30s, so the plan can react to escalation/clearing and offer
  // the Recover handoff once the acute threat has passed. Reset on a new alert.
  useEffect(() => {
    setAlertStatus(null);
    setAlertDismissed(false);
  }, [situation?.event, planVersion]);

  useEffect(() => {
    if (phase !== "result" || !situation || !user) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await getAlertStatus({
          lat: user.lat,
          lon: user.lon,
          prior: situation,
          now: new Date().toISOString(),
          demo: situation.source === "mock",
        });
        if (!cancelled && res?.ok) setAlertStatus(res);
      } catch {
        /* transient — keep the last known status */
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase, situation, user]);

  // Load any plan saved from a previous session so it can be resumed offline.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) setSavedPlan(JSON.parse(raw));
    } catch {
      /* corrupt or unavailable storage - ignore */
    }
  }, []);

  // Persist the current plan whenever it changes, so it survives a refresh or
  // going offline. A disaster app's worst case is no connectivity.
  useEffect(() => {
    if (!rec || !situation) return;
    try {
      localStorage.setItem(
        PLAN_STORAGE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          hazardType, timeTier, situation, rec, extraSteps,
          user, accuracy, locationLabel, moduleData, runGuide,
        })
      );
    } catch {
      /* quota or unavailable storage - non-fatal */
    }
  }, [rec, extraSteps, situation, hazardType, timeTier, user, accuracy, locationLabel, moduleData, runGuide]);

  useEffect(() => {
    if (!user) return;
    setLocationLabel("");
    // NB: browsers forbid setting User-Agent on fetch; identify via the query
    // param Nominatim accepts instead.
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${user.lat}&lon=${user.lon}`
    )
      .then((r) => r.json())
      .then((data) => {
        const a = data.address || {};
        const neighborhood = a.suburb || a.neighbourhood || a.city_district || "";
        const city = a.city || a.town || a.village || a.county || "";
        const state = a.state_code || (a.state ? a.state.slice(0, 2).toUpperCase() : "");
        if (neighborhood && city) setLocationLabel(`${neighborhood}, ${city}`);
        else if (city && state) setLocationLabel(`${city}, ${state}`);
        else setLocationLabel(city || neighborhood || "");
        // Drive the emergency number off the country (911 in US + Canada).
        const cc = (a.country_code || "").toLowerCase();
        if (cc) setEmergencyNumber(EMERGENCY_BY_COUNTRY[cc] || DEFAULT_EMERGENCY);
      })
      .catch(() => {});
  }, [user]);

  function goHome() {
    sessionRef.current += 1; // leaving the plan — invalidate any in-flight work
    navigate(BASE + '/app');
    setPhase("home");
    setError("");
    setSituation(null);
    setModuleData(null);
    setRec(null);
    setRunGuide(null);
    setResources(DEFAULT_RESOURCES);
    setUserNote("");
    setNewsContext("");
    setPlanUpdated(false);
    setLogEntries([]);
    setExtraSteps([]);
    setLocationLabel("");
    setEmergencyNumber("911");
    setLiveDemoActive(false);
    setLiveOptions([]);
    setLiveMessage("");
    runPlanStartedRef.current = false;
  }

  function resumeSavedPlan() {
    const p = savedPlan;
    if (!p) return;
    setHazardType(p.hazardType);
    setTimeTier(p.timeTier);
    setSituation(p.situation);
    setRec(p.rec);
    setExtraSteps(p.extraSteps || []);
    setUser(p.user);
    setAccuracy(p.accuracy ?? null);
    setLocationLabel(p.locationLabel || "");
    setModuleData(p.moduleData || null);
    setRunGuide(p.runGuide || null);
    setRecLoading(false);
    setError("");
    setPhase("result");
  }

  function geolocate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
      // A single high-accuracy/8s call failed intermittently: desktops have no GPS
      // chip and indoor GPS cold-starts routinely take >8s, so it timed out. Now we
      // try a precise GPS fix with a generous timeout (and accept a fix up to 1 min
      // old), then fall back to a fast network/Wi-Fi estimate, reusing a cached fix
      // up to 5 min old. That covers the cases where pure GPS is slow or unavailable.
      const tryGet = (opts) =>
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, opts));

      tryGet({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
        .then(resolve)
        .catch(() =>
          tryGet({ enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })
            .then(resolve)
            .catch(reject)
        );
    });
  }

  function storeAlert(alert) {
    sessionRef.current += 1; // new disaster — invalidate any in-flight plan work
    setSituation(alert.situation);
    setHazardType(alert.hazardType);
    setTimeTier(alert.timeTier);
    setTierReason(alert.tierReason);
    setRunGuide(alert.runGuidance || null);
    setModuleData(null);
    setRec(null);
    runPlanStartedRef.current = false;
    setPhase("notification");
  }

  // Demo: generate a synthetic notification, then show it before analysis.
  async function startDemo(hazard, tier, atMyLocation) {
    setBusy(true);
    setError("");
    setLogEntries([]);
    emitLog({ type: "tidy", label: `Starting ${hazard} demo (${tier} tier)` });
    try {
      let lat = HAZARDS[hazard].coords.lat;
      let lon = HAZARDS[hazard].coords.lon;
      let acc = 20;
      if (atMyLocation) {
        try {
          emitLog({ type: "tidy", label: "Getting your GPS location…" });
          const pos = await geolocate();
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          acc = pos.coords.accuracy;
          emitLog({ type: "tidy", label: `Location found (±${Math.round(acc)} m)` });
        } catch {
          setError("Couldn't get your location. Using the test site instead.");
          emitLog({ type: "tidy", label: "GPS unavailable, using demo coordinates" });
        }
      }
      setUser({ lat, lon });
      setAccuracy(acc);
      const alert = await getAlert({ lat, lon, demo: true, hazard, tier });
      if (!alert.ok || !alert.situation) {
        setError(alert.error || "Could not generate the alert.");
        return;
      }
      emitLog({ type: "tidy", label: `Alert ready: ${alert.timeTier} tier` });
      storeAlert(alert);
    } catch (e) {
      setError(String(e.message || e));
      emitLog({ type: "tidy", label: `Error generating alert: ${e.message || e}` });
    } finally {
      setBusy(false);
    }
  }

  // Live: check the user's current location for an active alert (US: NWS, CA: ECCC).
  async function startLive() {
    setBusy(true);
    setError("");
    setLiveMessage("");
    try {
      let coords;
      try {
        const pos = await geolocate();
        coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setAccuracy(pos.coords.accuracy);
      } catch {
        setError(t("locationErrorLive"));
        return;
      }
      setUser(coords);
      const alert = await getAlert({ lat: coords.lat, lon: coords.lon });
      if (!alert.ok) {
        setError(alert.error || "Alert lookup failed.");
        return;
      }
      if (!alert.situation) {
        // Prefer the localized message so a francophone user never gets an English
        // "no alert" line; fall back to the backend's text in English.
        setLiveMessage(language === "fr" ? t("noAlert") : (alert.message || t("noAlert")));
        return;
      }
      storeAlert(alert);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  // Live demo: find up to 5 disasters happening right now anywhere (real NWS/USGS
  // data) and let the user pick which one to simulate standing next to.
  async function startRealDemo() {
    setBusy(true);
    setError("");
    setLiveDemoActive(true);
    setLogEntries([]);
    emitLog({ type: "tidy", label: "Scanning live feeds for active disasters…" });
    try {
      const res = await findLiveDisasters();
      if (!res.ok || !res.options || res.options.length === 0) {
        setError(res.message || res.error || "No active disaster found right now. Try again shortly, or use Demo Mode.");
        setLiveDemoActive(false);
        return;
      }
      emitLog({
        type: "tidy",
        label: `Found ${res.options.length} active disaster${res.options.length !== 1 ? "s" : ""}: choose one to simulate`,
      });
      for (const o of res.options) {
        emitLog({ type: "tidy", label: `• ${o.situation.event}${o.locationLabel ? `, ${o.locationLabel}` : ""}` });
      }
      setLiveOptions(res.options);
      setPhase("picker");
    } catch (e) {
      setError(String(e.message || e));
      setLiveDemoActive(false);
    } finally {
      setBusy(false);
    }
  }

  // The user picked one of the live disasters: place them at a real public place
  // inside the warned area, then run the full pipeline.
  async function chooseLiveDisaster(opt) {
    setError("");
    setBusy(true);
    emitLog({ type: "tidy", label: `Selected: ${opt.situation.event}${opt.locationLabel ? `, ${opt.locationLabel}` : ""}` });
    emitLog({ type: "tidy", label: "Finding a public place to place you near it…" });
    let lat = opt.lat;
    let lon = opt.lon;
    let label = opt.locationLabel || "";
    try {
      const res = await resolveLivePlace({
        lat: opt.lat,
        lon: opt.lon,
        areaPolygon: opt.situation.areaPolygon || null,
        locationLabel: opt.locationLabel || "",
      });
      if (res.ok) {
        lat = res.lat;
        lon = res.lon;
        label = res.locationLabel || label;
      }
    } catch {
      // best-effort - fall back to the centroid placement
    } finally {
      setBusy(false);
    }
    emitLog({ type: "tidy", label: `Placed at: ${label || "the warned area"}` });
    setUser({ lat, lon });
    setAccuracy(30);
    setLocationLabel(label);
    storeAlert({ ...opt, lat, lon, locationLabel: label });
  }

  // Real: read a screenshot of the user's alert.
  async function analyzeReal(image, coords) {
    setBusy(true);
    setError("");
    try {
      setUser(coords);
      setAccuracy(null);
      const alert = await analyzeScreenshot({ image, lat: coords.lat, lon: coords.lon });
      if (!alert.ok) {
        setError(alert.error || "Couldn't read that alert.");
        return;
      }
      storeAlert(alert);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  // From the notification, kick off the per-hazard analysis.
  function proceedToAnalysis() {
    if (timeTier === "RUN") setPhase("run");
    else setPhase("resource");
  }

  function getOrFetchModule(coords, res) {
    if (!modulePromiseRef.current) {
      modulePromiseRef.current = fetchModule(coords, res).finally(() => {
        modulePromiseRef.current = null;
      });
    }
    return modulePromiseRef.current;
  }

  async function fetchModule(coords, res) {
    emitLog({ type: "tidy", label: `Querying conditions near you…` });
    const r = await runModule({
      lat: coords.lat,
      lon: coords.lon,
      accuracy,
      hazardType,
      situation,
      resources: res,
      timeTier,
      language,
    });
    const md = { pattern: r.pattern, data: r.data, deterministic: r.deterministic };
    setModuleData(md);

    const data = r.data || {};

    if (data.elevation) {
      const hgv = data.elevation.highGroundVector;
      if (data.elevation.ok) {
        emitLog({ type: "tidy", label: hgv ? `Elevation API → ${hgv.direction} +${hgv.gain_m}m` : "Elevation API → terrain is flat" });
        emitLog({ type: "raw", label: "Open-Meteo elevation", detail: data.elevation });
      } else {
        emitLog({ type: "tidy", label: `Elevation API → unavailable`, status: "error" });
      }
    }
    if (data.wind) {
      emitLog({
        type: "tidy",
        label: data.wind.ok
          ? `Wind API → ${data.wind.speed_kmh} km/h from ${data.wind.from_compass}, pushing ${data.wind.toward_compass}`
          : "Wind API → unavailable",
        status: data.wind.ok ? "done" : "error",
      });
      if (data.wind.ok) emitLog({ type: "raw", label: "Open-Meteo wind", detail: data.wind });
    }
    if (data.fires != null) {
      const src = data.fires_source === "demo-seeded" ? " (demo-seeded)" : "";
      emitLog({ type: "tidy", label: `NASA FIRMS → ${data.fires.length} fire detection${data.fires.length !== 1 ? "s" : ""}${src}` });
      emitLog({ type: "raw", label: "NASA FIRMS: fire detections", detail: { fires: data.fires, source: data.fires_source } });
    }
    if (data.quake != null) {
      emitLog({
        type: "tidy",
        label: data.quake.ok && data.quake.found
          ? `USGS → M${data.quake.magnitude} quake ${data.quake.distance_km} km away`
          : "USGS → no recent quake within range",
      });
      emitLog({ type: "raw", label: "USGS earthquake feed", detail: data.quake });
    }
    if (data.places) {
      const n = (data.places.safe || []).length;
      emitLog({ type: "tidy", label: `Overpass API → ${n} safe building${n !== 1 ? "s" : ""} found` });
      emitLog({ type: "raw", label: "Overpass API: nearby places", detail: data.places });
    }
    if (data.openSpaces) {
      emitLog({ type: "tidy", label: `Overpass API → ${data.openSpaces.length} open space${data.openSpaces.length !== 1 ? "s" : ""} found` });
      emitLog({ type: "raw", label: "Overpass API: open spaces", detail: { open_spaces: data.openSpaces } });
    }

    emitLog({ type: "tidy", label: `Scan complete: ${r.pattern} pattern` });
    return md;
  }

  // Draw the map by running the module once we reach the resource phase.
  useEffect(() => {
    if (phase === "resource" && situation && user && !moduleData) {
      getOrFetchModule(user, resources).catch((e) => setError(String(e.message || e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, situation, user]);

  async function runRecommendation() {
    const session = sessionRef.current;
    setPhase("result");
    setRecLoading(true);
    setPlanUpdated(false);

    // Demo: fake-fetch local news to enrich the AI plan.
    let nc = "";
    if (situation?.source === "mock") {
      emitLog({ type: "tidy", label: "Scanning local news…" });
      await new Promise((r) => setTimeout(r, 380));
      const articles = DEMO_NEWS[hazardType] || [];
      for (const a of articles) {
        emitLog({ type: "tidy", label: `"${a.title}"` });
      }
      nc = articles.map((a) => `- ${a.title}: ${a.snippet}`).join("\n");
      setNewsContext(nc);
      emitLog({ type: "tidy", label: `${articles.length} articles found, included in analysis` });
      emitLog({ type: "raw", label: "News context - demo articles", detail: articles });
    }

    emitLog({ type: "tidy", label: "Fetching government guidance…" });
    try {
      let md = moduleData;
      if (!md) md = await getOrFetchModule(user, resources);
      const r = await getRecommendation({
        lat: user.lat,
        lon: user.lon,
        accuracy,
        hazardType,
        situation,
        timeTier,
        resources,
        moduleData: md,
        newsContext: nc,
        locationLabel,
        language,
        now: new Date().toISOString(),
      });

      // Moved to a different disaster while this was in flight — drop the stale result.
      if (sessionRef.current !== session) return;

      // Log each government page the RAG fetched.
      const ragSources = r.rag_sources || [];
      for (const src of ragSources) {
        const status = src.ok ? "done" : "error";
        const detail = src.ok ? `: ${src.paragraphs} paragraphs` : ": unreachable";
        emitLog({ type: "tidy", label: `${src.title}${detail}`, status });
      }
      if (ragSources.length > 0) {
        emitLog({ type: "raw", label: "RAG: government sources", detail: ragSources });
      }

      emitLog({ type: "tidy", label: "Generating plan…" });
      setRec(r.recommendation);
      planGeneratedAtRef.current = Date.now();
      setPlanVersion((v) => v + 1);
      emitLog({ type: "tidy", label: `Plan generated: ${r.recommendation.steps?.length ?? 0} steps` });
      emitLog({ type: "raw", label: "AI recommendation", detail: r.recommendation });
    } catch (e) {
      setError(String(e.message || e));
      emitLog({ type: "tidy", label: `Plan generation failed: ${e.message || e}` });
    } finally {
      setRecLoading(false);
    }
  }

  // RUN tier: while the user reads the instant life-safety guidance and starts
  // moving, generate the follow-on plan in the background - assuming the immediate
  // drop/cover/flee action is already underway - so "what next" is ready when they
  // surface. Uses default resources (RUN means no time to ask the resource check).
  async function generateRunPlan() {
    const session = sessionRef.current;
    setRecLoading(true);
    setPlanUpdated(false);

    // Demo: fake-fetch local news to enrich the AI plan (mirrors runRecommendation).
    let nc = "";
    if (situation?.source === "mock") {
      emitLog({ type: "tidy", label: "Scanning local news…" });
      await new Promise((r) => setTimeout(r, 380));
      const articles = DEMO_NEWS[hazardType] || [];
      for (const a of articles) emitLog({ type: "tidy", label: `"${a.title}"` });
      nc = articles.map((a) => `- ${a.title}: ${a.snippet}`).join("\n");
      setNewsContext(nc);
      emitLog({ type: "tidy", label: `${articles.length} articles found, included in analysis` });
      emitLog({ type: "raw", label: "News context - demo articles", detail: articles });
    }

    emitLog({ type: "tidy", label: "Preparing your next steps…" });
    try {
      let md = moduleData;
      if (!md) md = await getOrFetchModule(user, resources);
      const r = await getRecommendation({
        lat: user.lat,
        lon: user.lon,
        accuracy,
        hazardType,
        situation,
        timeTier,
        resources,
        moduleData: md,
        newsContext: nc,
        locationLabel,
        runFollowOn: true,
        language,
        now: new Date().toISOString(),
      });

      // Moved to a different disaster while this was in flight — drop the stale result.
      if (sessionRef.current !== session) return;

      const ragSources = r.rag_sources || [];
      for (const src of ragSources) {
        const status = src.ok ? "done" : "error";
        const detail = src.ok ? `: ${src.paragraphs} paragraphs` : ": unreachable";
        emitLog({ type: "tidy", label: `${src.title}${detail}`, status });
      }
      if (ragSources.length > 0) {
        emitLog({ type: "raw", label: "RAG: government sources", detail: ragSources });
      }

      emitLog({ type: "tidy", label: "Generating next-steps plan…" });
      setRec(r.recommendation);
      planGeneratedAtRef.current = Date.now();
      setPlanVersion((v) => v + 1);
      emitLog({ type: "tidy", label: `Next-steps plan ready: ${r.recommendation.steps?.length ?? 0} steps` });
      emitLog({ type: "raw", label: "AI recommendation (RUN follow-on)", detail: r.recommendation });
    } catch (e) {
      setError(String(e.message || e));
      emitLog({ type: "tidy", label: `Next-steps plan failed: ${e.message || e}` });
    } finally {
      setRecLoading(false);
    }
  }

  // Kick off the RUN-tier follow-on plan as soon as we land on the run screen.
  useEffect(() => {
    if (phase === "run" && situation && user && !runPlanStartedRef.current) {
      runPlanStartedRef.current = true;
      generateRunPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, situation, user]);

  // Re-run the recommendation with a user-supplied concern or preference note.
  async function updatePlan(note) {
    const session = sessionRef.current;
    setUserNote(note);
    setConcernLoading(true);
    setPlanUpdated(false);
    emitLog({ type: "tidy", label: "Updating plan with your note…" });
    try {
      let md = moduleData || await getOrFetchModule(user, resources);
      const r = await getRecommendation({
        lat: user.lat,
        lon: user.lon,
        accuracy,
        hazardType,
        situation,
        timeTier,
        resources,
        moduleData: md,
        userNote: note,
        newsContext,
        locationLabel,
        language,
        now: new Date().toISOString(),
      });
      // Moved to a different disaster while this was in flight — drop the stale result.
      if (sessionRef.current !== session) {
        emitLog({ type: "tidy", label: "Plan update ignored (you moved to a new disaster)" });
        return;
      }
      setRec(r.recommendation);
      planGeneratedAtRef.current = Date.now();
      setExtraSteps([]);
      setPlanVersion((v) => v + 1);
      setPlanUpdated(true);
      emitLog({ type: "tidy", label: "Plan updated" });
    } catch (e) {
      setError(String(e.message || e));
      emitLog({ type: "tidy", label: `Plan update failed: ${e.message || e}` });
    } finally {
      setConcernLoading(false);
    }
  }

  async function handleAddStep(message) {
    const session = sessionRef.current;
    setStepLoading(true);
    try {
      const r = await followUp({
        message,
        mode: "instruction",
        hazardType,
        timeTier,
        headline_action: rec?.headline_action || "",
        existing_steps: [...(rec?.steps || []), ...extraSteps],
        expires: situation?.expires || null,
        now: new Date().toISOString(),
        planAge: formatPlanAge(),
        language,
      });
      // Discard if the user moved to a new disaster while this was in flight.
      if (sessionRef.current !== session) return;
      if (r.step) setExtraSteps((prev) => [...prev, r.step]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setStepLoading(false);
    }
  }

  async function handleAskQuestion(message) {
    const session = sessionRef.current;
    const r = await followUp({
      message,
      mode: "question",
      hazardType,
      timeTier,
      headline_action: rec?.headline_action || "",
      existing_steps: [...(rec?.steps || []), ...extraSteps],
      expires: situation?.expires || null,
      now: new Date().toISOString(),
      planAge: formatPlanAge(),
      language,
    });
    // The answer is about the previous disaster — don't show it against the new one.
    if (sessionRef.current !== session) {
      return "You've moved to a different disaster — ask your question again for this one.";
    }
    return r.answer || "Sorry, couldn't get an answer.";
  }

  // Build a plain-text version of the plan for sharing / SMS.
  function buildPlanText() {
    if (!rec) return "";
    const hazLabel = hazardLabel(meta, language) || hazardType || "Alert";
    const lines = [`${hazLabel} - my action plan${locationLabel ? ` (${locationLabel})` : ""}`];
    if (rec.headline_action) lines.push("", rec.headline_action);
    if (rec.responsePattern === "routing" && rec.destination_name) {
      lines.push(`Go: ${[rec.direction, rec.distance].filter(Boolean).join(" · ")} → ${rec.destination_name}`.trim());
    }
    const steps = [...(rec.steps || []), ...extraSteps];
    if (steps.length) {
      lines.push("", "Steps:");
      steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}${s.detail ? ` - ${s.detail}` : ""}`));
    }
    lines.push("", `Emergency: ${emergencyNumber}`);
    return lines.join("\n");
  }

  async function sharePlan() {
    const text = buildPlanText();
    if (!text) return;
    const title = `${hazardLabel(meta, language) || "Crisis"} action plan`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch {
        /* user dismissed the share sheet - nothing to do */
      }
      return;
    }
    // No native share (most desktops): copy to clipboard, fall back to SMS.
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg(t("planCopied"));
      setTimeout(() => setShareMsg(""), 2500);
    } catch {
      window.open(`sms:?&body=${encodeURIComponent(text)}`);
    }
  }

  // Called from the end of the respond plan — transfers context and jumps straight
  // into cleanup generation, skipping the RecoverHub + intake form.
  function handleStartRecovery() {
    if (!hazardType) return;
    const parts = [];
    // Mark the alert text as the PAST event we're recovering from — otherwise the
    // recovery AI reads its imminent-danger wording ("flooding is expected…") as a
    // current threat and produces an evacuation headline instead of a clean-up one.
    if (situation?.description) parts.push(`The ${hazardType} has now passed. Earlier alert said: "${situation.description.slice(0, 800)}"`);
    if (resources.atHome === true) parts.push("User is currently at home.");
    if (resources.atHome === false) parts.push("User is away from home.");
    if (resources.hasVehicle === true) parts.push("Has a vehicle.");
    if (resources.hasVehicle === false) parts.push("No vehicle — on foot.");
    if (resources.hasSlowMovers) parts.push("Has people with them who can't move quickly.");
    if (resources.hasSupplies === false) parts.push("Did not have emergency supplies on hand.");
    setRecoverHazard(hazardType);
    setRecoverInitialText(parts.join(" "));
    setError("");
    setPhase("recover_cleanup");
  }

  // Recover — Part A: generate the clean-up / re-entry plan, then show it in the
  // shared Slideshow. Falls back to the deterministic plan server-side.
  async function generateCleanup(input) {
    setCleanupLoading(true);
    setError("");
    setCleanupRec(null);
    setCleanupInput(input);
    setCleanupExtraSteps([]);
    setCleanupUpdated(false);
    setCleanupVersion((v) => v + 1);
    setPhase("recover_cleanup_result");
    try {
      const res = await getCleanupPlan({
        hazardType: input.hazard || recoverHazard,
        damageCategories: input.damageCategories,
        situationText: input.situationText,
        documentText: input.documentText || "",
        documentImages: input.documentImages || [],
        now: new Date().toISOString(),
        images: input.images,
        language,
      });
      if (res.ok === false) {
        setError(res.message || "Couldn't build the plan. Please try again.");
        setPhase("recover_cleanup");
        return;
      }
      setCleanupRedactions(res.redactions || []);
      setCleanupRec(res.recommendation);
    } catch (e) {
      setError(String(e.message || e));
      setPhase("recover_cleanup");
    } finally {
      setCleanupLoading(false);
    }
  }

  // "Something changed" — rebuild the whole clean-up plan with the note folded into
  // the description, mirroring updatePlan() in the response flow.
  async function updateCleanup(note) {
    if (!cleanupInput) return;
    setCleanupConcernLoading(true);
    setCleanupUpdated(false);
    const merged = {
      ...cleanupInput,
      situationText: [cleanupInput.situationText, `Update from me: ${note}`].filter(Boolean).join("\n\n"),
    };
    try {
      const res = await getCleanupPlan({
        hazardType: recoverHazard,
        damageCategories: merged.damageCategories,
        situationText: merged.situationText,
        images: merged.images,
        language,
      });
      setCleanupInput(merged);
      setCleanupRec(res.recommendation);
      setCleanupExtraSteps([]);
      setCleanupVersion((v) => v + 1);
      setCleanupUpdated(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCleanupConcernLoading(false);
    }
  }

  // End-of-plan "need more guidance" — append one extra recovery step.
  async function addCleanupStep(message) {
    setCleanupStepLoading(true);
    try {
      const r = await recoveryFollowUp({
        hazardType: recoverHazard,
        mode: "instruction",
        message,
        headline_action: cleanupRec?.headline_action || "",
        existing_steps: [...(cleanupRec?.steps || []), ...cleanupExtraSteps],
        language,
      });
      if (r.step) setCleanupExtraSteps((prev) => [...prev, r.step]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCleanupStepLoading(false);
    }
  }

  // Questions box on the clean-up plan.
  async function askCleanupQuestion(message) {
    const r = await recoveryFollowUp({
      hazardType: recoverHazard,
      mode: "question",
      message,
      headline_action: cleanupRec?.headline_action || "",
      existing_steps: [...(cleanupRec?.steps || []), ...cleanupExtraSteps],
      language,
    });
    return r.answer || "Sorry, couldn't get an answer.";
  }

  // Insurance/paperwork capability inside the recovery assistant. Returns the raw
  // API response so the assistant can render the structured analysis (or the
  // sensitive-data guardrail message) as a chat bubble.
  async function analyzeRecoverDoc({ documentText, documentImages, insurerName, claimStatus }) {
    return analyzePaperwork({
      hazardType: recoverHazard,
      documentText,
      documentImages,
      insurerName,
      claimStatus,
      now: new Date().toISOString(),
      language,
    });
  }

  function shareCleanup() {
    if (!cleanupRec) return;
    const hazLabel = hazardLabel(recoverHazard, language) || recoverHazard || "";
    const lines = [`${hazLabel} — recovery clean-up plan`];
    if (cleanupRec.headline_action) lines.push("", cleanupRec.headline_action);
    const steps = [...(cleanupRec.steps || []), ...cleanupExtraSteps];
    if (steps.length) {
      lines.push("", "Steps:");
      steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}${s.detail ? ` - ${s.detail}` : ""}`));
    }
    const text = lines.join("\n");
    if (navigator.share) {
      navigator.share({ title: `${hazLabel} recovery plan`, text }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(text).then(
      () => { setCleanupShareMsg(t("planCopied")); setTimeout(() => setCleanupShareMsg(""), 2500); },
      () => window.open(`sms:?&body=${encodeURIComponent(text)}`)
    );
  }

  const meta = hazardType ? HAZARDS[hazardType] : null;
  const inPipeline = ["run", "resource", "result"].includes(phase);

  // Route-level rendering for pages that live outside the app shell.
  if (route === 'landing') {
    return (
      <Landing
        language={language}
        onLanguage={setLanguage}
        onLaunch={(target) => {
          if (target === 'instructions') navigate(BASE + '/howitworks');
          else if (target === 'tech') navigate(BASE + '/tech');
          else navigate(BASE + '/app');
        }}
      />
    );
  }
  if (route === 'howitworks') {
    return (
      <div className="app-shell">
        <Instructions onBack={() => history.back()} startOnTech={false} language={language} />
      </div>
    );
  }
  if (route === 'tech') {
    return (
      <div className="app-shell">
        <Instructions onBack={() => history.back()} startOnTech={true} language={language} />
      </div>
    );
  }

  return (
    <div className={`app-shell${showLog && inPipeline ? " app-shell--side" : ""}`}>
    <div className="app">
      {phase === "home" && (
        <Home
          onReal={() => { setError(""); setPhase("screenshot"); }}
          onDemo={() => { setError(""); setPhase("demo"); }}
          onLive={startLive}
          onRecover={() => { setError(""); setRecoverHazard(null); setRecoverInitialText(""); setCleanupRec(null); setPhase("recover"); }}
          onBack={() => navigate(BASE + '/')}
          onInstructions={() => { setError(""); navigate(BASE + '/howitworks'); }}
          busy={busy}
          error={error}
          liveMessage={liveMessage}
          health={health}
          savedPlan={savedPlan}
          onResume={resumeSavedPlan}
          language={language}
          onLanguage={setLanguage}
        />
      )}

      {phase === "recover" && (
        <RecoverHub
          onBack={goHome}
          onCleanup={(h) => { setRecoverHazard(h); setError(""); setPhase("recover_cleanup"); }}
          language={language}
        />
      )}

      {phase === "recover_cleanup" && recoverHazard && (
        <RecoverCleanupIntake
          hazard={recoverHazard}
          onBack={() => { setError(""); setPhase("recover"); }}
          onGenerate={generateCleanup}
          busy={cleanupLoading}
          error={error}
          language={language}
          initialText={recoverInitialText}
        />
      )}

      {phase === "recover_cleanup_result" && (
        <div className="screen">
          <header className="topbar">
            <button className="back" onClick={() => { setError(""); setPhase("recover_cleanup"); }}>
              <Icon name="back" size={16} /> {t("back")}
            </button>
            <span className="hazard-chip">
              <Icon name={HAZARDS[recoverHazard]?.icon || "home"} size={16} /> {hazardLabel(recoverHazard, language)}
            </span>
          </header>
          {!cleanupLoading && cleanupRedactions.length > 0 && (
            <p className="pw-redacted">{t("redactedPrefix")} {cleanupRedactions.join(", ")}.</p>
          )}
          <div className="result-card">
            <Slideshow
              key={cleanupVersion}
              rec={cleanupRec}
              loading={cleanupLoading}
              updating={cleanupConcernLoading}
              planUpdated={cleanupUpdated}
              extraSteps={cleanupExtraSteps}
              onRequestStep={addCleanupStep}
              stepLoading={cleanupStepLoading}
              lang={language}
            />
          </div>

          {!cleanupLoading && cleanupRec && (
            <>
              <div className="plan-actions">
                <button className="ghost plan-share-btn" onClick={shareCleanup}>
                  <Icon name="upload" size={15} /> {t("sharePlan")}
                </button>
                {cleanupShareMsg && <span className="plan-share-msg">{cleanupShareMsg}</span>}
              </div>

              {/* Recovery assistant — general Q&A with suggestion chips. */}
              <QuestionsBox
                onAsk={askCleanupQuestion}
                suggestions={RECOVER_SUGGESTIONS[language] || RECOVER_SUGGESTIONS.en}
                disabled={cleanupConcernLoading}
                lang={language}
              />
              {/* Optional, standalone box: insurance / FEMA / provincial-aid letter. */}
              <PaperworkBox onAnalyze={analyzeRecoverDoc} disabled={cleanupConcernLoading} lang={language} />
              <ConcernsBox onUpdate={updateCleanup} loading={cleanupConcernLoading} lang={language} />
            </>
          )}

          {error && <p className="error">{error}</p>}
        </div>
      )}

      {phase === "demo" && (
        <StartScreen
          onDemo={startDemo}
          onRealDemo={startRealDemo}
          onBack={goHome}
          error={error}
          busy={busy}
          language={language}
        />
      )}

      {phase === "screenshot" && (
        <ScreenshotIntake onBack={goHome} onAnalyze={analyzeReal} busy={busy} error={error} savedPlan={savedPlan} onResume={resumeSavedPlan} language={language} />
      )}

      {phase === "picker" && (
        <DisasterPicker
          options={liveOptions}
          onChoose={chooseLiveDisaster}
          onBack={() => { setLiveOptions([]); setLiveDemoActive(false); setError(""); setPhase("demo"); }}
          busy={busy}
          language={language}
        />
      )}

      {phase === "notification" && situation && (
        <NotificationCard
          situation={situation}
          onAnalyze={proceedToAnalysis}
          onBack={() => setPhase(liveDemoActive ? "picker" : situation.source === "mock" ? "demo" : "screenshot")}
          busy={busy}
          language={language}
        />
      )}

      {inPipeline && situation && (
        <div className="screen">
          <header className="topbar">
            <button className="back" onClick={() => setPhase("notification")}>
              <Icon name="back" size={16} /> {t("back")}
            </button>
            <div className="topbar-right">
              <span className="topbar-location">
                {locationLabel && <>{locationLabel} · </>}
                {accuracy != null
                  ? `±${Math.round(accuracy)} m`
                  : user
                  ? `${user.lat.toFixed(3)}°, ${user.lon.toFixed(3)}°`
                  : ""}
              </span>
              <span className="topbar-time">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </header>

          {phase === "run" && (
            <>
              {timeTier && (
                <div className="status-strip">
                  <div className="status-strip-main">
                    <div className="status-strip-left">
                      {meta && (
                        <span className="hazard-chip status-hazard-chip">
                          <Icon name={meta.icon} size={14} /> {hazardLabel(meta, language)}
                        </span>
                      )}
                      <span className="status-time"><Icon name="warning" size={13} /> {(TIER_TIME_SHORT[language]||TIER_TIME_SHORT.en)[timeTier]}</span>
                      <span className="status-sep">·</span>
                      <span className="status-emergency">{t("emergency")} {emergencyNumber}</span>
                    </div>
                    <div className="status-strip-right">
                      <span className={`tier ${TIER_CLASS[timeTier]}`}>{tierLabel(timeTier, language)}</span>
                      {situation.source === "mock" && <span className="badge-demo">{language === "fr" ? "DÉMO" : "DEMO"}</span>}
                      {liveDemoActive && <span className="badge-demo badge-live">{language === "fr" ? "EN DIRECT · SIMULÉ" : "LIVE · SIMULATED"}</span>}
                    </div>
                  </div>
                </div>
              )}
              <RunGuidance guidance={runGuide} lang={language} hazardType={hazardType} />

              {(recLoading || rec) && (
                <div className="run-next rise">
                  <div className="run-next-head">
                    <Icon name="arrow" size={16} />
                    <span>{t("runNextHead")}</span>
                    <span className="run-next-sub">{t("runNextSub")}</span>
                  </div>
                  <Slideshow
                    key={planVersion}
                    rec={rec}
                    loading={recLoading}
                    updating={concernLoading}
                    planUpdated={planUpdated}
                    extraSteps={extraSteps}
                    onRequestStep={handleAddStep}
                    stepLoading={stepLoading}
                    lang={language}
                  />
                </div>
              )}

              {!recLoading && rec && (
                <>
                  <div className="plan-actions">
                    <button className="ghost plan-share-btn" onClick={sharePlan}>
                      <Icon name="upload" size={15} /> {t("sharePlan")}
                    </button>
                    {shareMsg && <span className="plan-share-msg">{shareMsg}</span>}
                  </div>
                  <QuestionsBox onAsk={handleAskQuestion} suggestions={RESPOND_SUGGESTIONS[language] || RESPOND_SUGGESTIONS.en} disabled={recLoading} lang={language} />
                  <ConcernsBox onUpdate={updatePlan} loading={concernLoading} lang={language} />
                </>
              )}

              {user && (
                <CrisisMap
                  user={user}
                  hazardType={hazardType}
                  polygon={situation.areaPolygon}
                  moduleData={moduleData}
                  recommendation={rec}
                />
              )}
            </>
          )}

          {phase === "resource" && (
            <>
              {timeTier && (
                <div className="status-strip">
                  <div className="status-strip-main">
                    <div className="status-strip-left">
                      {meta && (
                        <span className="hazard-chip status-hazard-chip">
                          <Icon name={meta.icon} size={14} /> {hazardLabel(meta, language)}
                        </span>
                      )}
                      <span className="status-time"><Icon name="warning" size={13} /> {(TIER_TIME_SHORT[language]||TIER_TIME_SHORT.en)[timeTier]}</span>
                      <span className="status-sep">·</span>
                      <span className="status-emergency">{t("emergency")} {emergencyNumber}</span>
                    </div>
                    <div className="status-strip-right">
                      <span className={`tier ${TIER_CLASS[timeTier]}`}>{tierLabel(timeTier, language)}</span>
                      {situation.source === "mock" && <span className="badge-demo">{language === "fr" ? "DÉMO" : "DEMO"}</span>}
                      {liveDemoActive && <span className="badge-demo badge-live">{language === "fr" ? "EN DIRECT · SIMULÉ" : "LIVE · SIMULATED"}</span>}
                    </div>
                  </div>
                </div>
              )}
              <ResourceCheck
                resources={resources}
                setResources={setResources}
                onContinue={runRecommendation}
                lang={language}
              />
              {user && (
                <CrisisMap
                  user={user}
                  hazardType={hazardType}
                  polygon={situation.areaPolygon}
                  moduleData={moduleData}
                  recommendation={null}
                />
              )}
            </>
          )}

          {phase === "result" && (
            <>
              {alertStatus && !alertDismissed
                && !["active", "unknown"].includes(alertStatus.state) && (
                <div className={`alert-watch alert-watch--${alertStatus.recoverSuggested ? "clear" : alertStatus.state}`}>
                  <div className="alert-watch-body">
                    <Icon
                      name={alertStatus.state === "escalated" ? "warning" : alertStatus.recoverSuggested ? "check" : "info"}
                      size={16}
                    />
                    <div>
                      <strong className="alert-watch-title">
                        {alertStatus.state === "escalated"
                          ? (language === "fr" ? "Alerte aggravée — agissez maintenant" : "Warning upgraded — act now")
                          : alertStatus.recoverSuggested
                          ? (language === "fr" ? "Le danger immédiat semble passé" : "The immediate danger appears to have passed")
                          : (language === "fr" ? "L'alerte a changé" : "The alert has changed")}
                      </strong>
                      <p className="alert-watch-msg">{alertStatus.message}</p>
                    </div>
                  </div>
                  <div className="alert-watch-actions">
                    {alertStatus.recoverSuggested && (
                      <button
                        className="primary alert-watch-go"
                        onClick={() => {
                          setError("");
                          setRecoverHazard(hazardType);
                          setCleanupRec(null);
                          setPhase("recover");
                        }}
                      >
                        {language === "fr" ? "Passer à la récupération" : "Start recovery"}
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                    <button className="ghost alert-watch-dismiss" onClick={() => setAlertDismissed(true)}>
                      {language === "fr" ? "Ignorer" : "Dismiss"}
                    </button>
                  </div>
                </div>
              )}
              <div className="result-card">
                {timeTier && (
                  <div className="result-card-strip">
                    <div className="status-strip-main">
                      <div className="status-strip-left">
                        {meta && (
                          <span className="hazard-chip status-hazard-chip">
                            <Icon name={meta.icon} size={14} /> {hazardLabel(meta, language)}
                          </span>
                        )}
                        <span className="status-time"><Icon name="warning" size={13} /> {(TIER_TIME_SHORT[language]||TIER_TIME_SHORT.en)[timeTier]}</span>
                        <span className="status-sep">·</span>
                        <span className="status-emergency">{t("emergency")} {emergencyNumber}</span>
                      </div>
                      <div className="status-strip-right">
                        <span className={`tier ${TIER_CLASS[timeTier]}`}>{tierLabel(timeTier, language)}</span>
                        {situation.source === "mock" && <span className="badge-demo">{language === "fr" ? "DÉMO" : "DEMO"}</span>}
                      {liveDemoActive && <span className="badge-demo badge-live">{language === "fr" ? "EN DIRECT · SIMULÉ" : "LIVE · SIMULATED"}</span>}
                      </div>
                    </div>
                    {(situation.officialEvacOrder || rec?.official_order_present) && (
                      <div className="status-strip-order">
                        <strong>{t("officialOrder")}</strong>{" "}
                        {rec?.official_order_text || t("officialOrderFallback")}
                      </div>
                    )}
                  </div>
                )}
                <Slideshow
                  key={planVersion}
                  rec={rec}
                  loading={recLoading}
                  updating={concernLoading}
                  planUpdated={planUpdated}
                  extraSteps={extraSteps}
                  onRequestStep={handleAddStep}
                  stepLoading={stepLoading}
                  onStartRecovery={handleStartRecovery}
                  lang={language}
                />
              </div>
              {!recLoading && rec && (
                <div className="plan-actions">
                  <button className="ghost plan-share-btn" onClick={sharePlan}>
                    <Icon name="upload" size={15} /> {t("sharePlan")}
                  </button>
                  {shareMsg && <span className="plan-share-msg">{shareMsg}</span>}
                </div>
              )}
              {!recLoading && (
                <>
                  <QuestionsBox onAsk={handleAskQuestion} suggestions={RESPOND_SUGGESTIONS[language] || RESPOND_SUGGESTIONS.en} disabled={recLoading} lang={language} />
                  <ConcernsBox onUpdate={updatePlan} loading={concernLoading} lang={language} />
                </>
              )}
              {user && (
                <CrisisMap
                  user={user}
                  hazardType={hazardType}
                  polygon={situation.areaPolygon}
                  moduleData={moduleData}
                  recommendation={rec}
                />
              )}
            </>
          )}

          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
    {showLog && inPipeline && (
      <aside className="app-sidebar">
        <ActivityLog entries={logEntries} />
      </aside>
    )}
    </div>
  );
}
