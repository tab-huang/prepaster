import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import "../home-landing.css";

// Service descriptions are localized so the home screen reads coherently in French.
// Source names (NWS, USGS…) are proper nouns and stay as-is.
const SERVICES = (health, s) => [
  { name: "NWS",             desc: s.svcNws,        live: true },
  { name: "ECCC",            desc: s.svcEccc,       live: true },
  { name: "USGS",            desc: s.svcUsgs,       live: true },
  { name: "NASA FIRMS",      desc: s.svcFirms,      live: !!health?.firms_configured, offLabel: s.offSeeded },
  { name: "Open-Meteo",      desc: s.svcMeteo,      live: true },
  { name: "Overpass API",    desc: s.svcOverpass,   live: true },
  { name: "Nominatim",       desc: s.svcNominatim,  live: true },
  { name: "Google News",     desc: s.svcNews,       live: true },
  { name: "Gov. guidance",   desc: s.svcGuidance,   live: true },
  { name: "AI (OpenRouter)", desc: s.svcAi,         live: !!health?.ai_configured, offLabel: s.offAi },
];

const STR = {
  en: {
    tagline: "When a disaster alert fires, what do you actually do? Right now, from exactly where you're standing.",
    liveTitle: "Check live alerts near me",
    liveSub: "Active NWS or ECCC alert at your location right now.",
    realTitle: "Respond to an alert",
    realSub: "Upload a screenshot. We read the hazard and build your plan.",
    recoverTitle: "Recover after a disaster",
    recoverSub: "The danger's passed. Get a safe clean-up & re-entry guide, and make sense of insurance and aid paperwork.",
    demoTitle: "Demo mode",
    demoSub: "Pick a hazard and time window, or simulate a live disaster.",
    howTitle: "How it works",
    howSub: "Modes, time tiers, and how the plan is built.",
    services: "Services",
    live: "live",
    svcNws: "US weather alerts",
    svcEccc: "Canadian weather alerts",
    svcUsgs: "Earthquake detection",
    svcFirms: "Wildfire detection",
    svcMeteo: "Elevation & wind data",
    svcOverpass: "Shelter lookup & surroundings",
    svcNominatim: "Reverse geocoding",
    svcNews: "Local news during live alerts",
    svcGuidance: "FEMA / Ready.gov / NWS safety",
    svcAi: "Generates action plans",
    offSeeded: "demo seeded",
    offAi: "off · deterministic fallback",
    disclaimer: "Real WEA alerts come through your phone's system. This demonstrates the decision engine, triggered by an alert you provide or simulate.",
  },
  fr: {
    tagline: "Quand une alerte de catastrophe se déclenche, que faites-vous vraiment ? Maintenant, depuis l'endroit exact où vous vous tenez.",
    langNote: "Choisissez d'abord votre langue — tout votre plan sera généré dans cette langue.",
    liveTitle: "Vérifier les alertes près de moi",
    liveSub: "Alerte NWS ou ECCC active à votre position en ce moment.",
    realTitle: "Répondre à une alerte",
    realSub: "Téléversez une capture d'écran. Nous lisons le danger et créons votre plan.",
    recoverTitle: "Se rétablir après une catastrophe",
    recoverSub: "Le danger est passé. Obtenez un guide de nettoyage et de retour sécuritaire, et démêlez la paperasse d'assurance et d'aide.",
    demoTitle: "Mode démo",
    demoSub: "Choisissez un danger et un délai, ou simulez une catastrophe réelle.",
    howTitle: "Comment ça marche",
    howSub: "Les modes, les paliers de temps et la façon dont le plan est construit.",
    services: "Services",
    live: "en ligne",
    svcNws: "Alertes météo américaines",
    svcEccc: "Alertes météo canadiennes",
    svcUsgs: "Détection de séismes",
    svcFirms: "Détection d'incendies",
    svcMeteo: "Données d'altitude et de vent",
    svcOverpass: "Recherche d'abris et environs",
    svcNominatim: "Géocodage inverse",
    svcNews: "Actualités locales pendant les alertes",
    svcGuidance: "Sécurité FEMA / Ready.gov / NWS",
    svcAi: "Génère les plans d'action",
    offSeeded: "données de démo",
    offAi: "désactivé · repli déterministe",
    disclaimer: "Les vraies alertes WEA arrivent via le système de votre téléphone. Ceci démontre le moteur de décision, déclenché par une alerte que vous fournissez ou simulez.",
  },
};

export default function HomeLanding({
  onReal,
  onDemo,
  onLive,
  onRecover,
  onInstructions,
  onBack,
  busy,
  error,
  liveMessage,
  health,
  savedPlan,
  onResume,
  language = "en",
  onLanguage,
}) {
  const [liveChecking, setLiveChecking] = useState(false);
  const s = STR[language] || STR.en;

  useEffect(() => {
    if (!busy) setLiveChecking(false);
  }, [busy]);

  function handleLive() {
    setLiveChecking(true);
    onLive();
  }

  return (
    <div className="hl-root rise">

      {/* ── Top bar: back link + language toggle ── */}
      <div className="hl-langbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> Crisis-to-Action
        </button>
        <div className="lang-toggle" role="group" aria-label="Language / Langue">
          <button
            className={`lang-opt${language === "en" ? " lang-opt--on" : ""}`}
            onClick={() => onLanguage?.("en")}
            aria-pressed={language === "en"}
          >EN</button>
          <button
            className={`lang-opt${language === "fr" ? " lang-opt--on" : ""}`}
            onClick={() => onLanguage?.("fr")}
            aria-pressed={language === "fr"}
          >FR</button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="hl-hero">
        <h1 className="hl-wordmark">Crisis&#8203;-to-Action</h1>
        <p className="hl-tagline">{s.tagline}</p>
        <p className="hl-langnote">{s.langNote}</p>
      </div>

      {/* ── Action cards ── */}
      <div className="hl-cards">
        <button className="hl-card" onClick={handleLive} disabled={busy}>
          <span className="hl-card-icon"><Icon name="pin" size={20} /></span>
          <span className="hl-card-body">
            <span className="hl-card-title">{s.liveTitle}</span>
            <span className="hl-card-sub">{s.liveSub}</span>
            {liveMessage && <span className="hl-card-msg">{liveMessage}</span>}
          </span>
          {liveChecking
            ? <svg className="hl-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" strokeOpacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9" /></svg>
            : <span className="hl-card-arrow"><Icon name="arrow" size={14} /></span>
          }
        </button>

        <button className="hl-card" onClick={onReal} disabled={busy}>
          <span className="hl-card-icon"><Icon name="upload" size={20} /></span>
          <span className="hl-card-body">
            <span className="hl-card-title">{s.realTitle}</span>
            <span className="hl-card-sub">{s.realSub}</span>
          </span>
          <span className="hl-card-arrow"><Icon name="arrow" size={14} /></span>
        </button>

        <button className="hl-card" onClick={onRecover} disabled={busy}>
          <span className="hl-card-icon"><Icon name="home" size={20} /></span>
          <span className="hl-card-body">
            <span className="hl-card-title">{s.recoverTitle}</span>
            <span className="hl-card-sub">{s.recoverSub}</span>
          </span>
          <span className="hl-card-arrow"><Icon name="arrow" size={14} /></span>
        </button>

        <button className="hl-card" onClick={onDemo} disabled={busy}>
          <span className="hl-card-icon"><Icon name="beaker" size={20} /></span>
          <span className="hl-card-body">
            <span className="hl-card-title">{s.demoTitle}</span>
            <span className="hl-card-sub">{s.demoSub}</span>
          </span>
          <span className="hl-card-arrow"><Icon name="arrow" size={14} /></span>
        </button>

        <button className="hl-card" onClick={onInstructions} disabled={busy}>
          <span className="hl-card-icon"><Icon name="info" size={20} /></span>
          <span className="hl-card-body">
            <span className="hl-card-title">{s.howTitle}</span>
            <span className="hl-card-sub">{s.howSub}</span>
          </span>
          <span className="hl-card-arrow"><Icon name="arrow" size={14} /></span>
        </button>
      </div>

      {error && <p className="hl-error" role="alert">{error}</p>}

      {/* ── Services ── */}
      <div className="hl-services">
        <div className="hl-services-head">{s.services}</div>
        {SERVICES(health, s).map(({ name, desc, live, offLabel }) => (
          <div key={name} className="hl-svc-row">
            <span className={`hl-dot ${live ? "hl-dot--live" : "hl-dot--warn"}`} />
            <span className="hl-svc-name">{name}</span>
            <span className="hl-svc-desc">{desc}</span>
            {live
              ? <span className="hl-svc-state">{s.live}</span>
              : <span className="hl-svc-badge">{offLabel}</span>
            }
          </div>
        ))}
      </div>

      <p className="hl-disclaimer">{s.disclaimer}</p>
    </div>
  );
}
