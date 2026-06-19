// The disaster notification - shown before analysis. For demo it's the generated
// synthetic alert; for the real flow it's what we read from the screenshot.
//
// In Demo Mode we render the generated alert as a phone-style "screenshot" beside a
// real NWS alert example for the same hazard, so you can compare how close the
// synthetic generator is to the real thing. (No example for wildfire/fire-weather.)

import Icon from "./Icon.jsx";
import { HAZARDS, hazardLabel, alertEventLabel, severityLabel, urgencyLabel } from "../hazards.js";

// Real-world alert screenshots, served from /public/examples. Keyed by hazard.
// BASE_URL keeps these correct when the app is hosted under a subpath (e.g. /usaii/).
const B = import.meta.env.BASE_URL;
const EXAMPLE_IMAGES = {
  flood: `${B}examples/flood.jpg`,
  tornado: `${B}examples/tornado.jpg`,
  earthquake: `${B}examples/earthquake.jpg`,
};

const STR = {
  en: {
    back: "Back",
    synthetic: "Synthetic alert",
    detected: "Detected alert",
    generated: "Generated",
    generatedSub: "our synthetic alert",
    emergencyAlert: "Emergency Alert",
    real: "Real",
    realSub: (label) => `actual ${label} alert`,
    realAlt: (label) => `Real ${label} alert example`,
    officialGuidance: "Official guidance:",
    analyze: "Analyze this alert",
  },
  fr: {
    back: "Retour",
    synthetic: "Alerte synthétique",
    detected: "Alerte détectée",
    generated: "Générée",
    generatedSub: "notre alerte synthétique",
    emergencyAlert: "Alerte d'urgence",
    real: "Réelle",
    realSub: (label) => `vraie alerte ${label}`,
    realAlt: (label) => `Exemple de vraie alerte ${label}`,
    officialGuidance: "Consignes officielles :",
    analyze: "Analyser cette alerte",
  },
};

// "in effect until 4:45 PM · about 50 min" from an ISO expiry timestamp.
function formatWindow(expires, language) {
  if (!expires) return null;
  const exp = new Date(expires);
  if (isNaN(exp)) return null;
  const clock = exp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mins = Math.round((exp - Date.now()) / 60000);
  if (language === "fr") {
    if (mins < 0) return `expirée à ${clock}`;
    let rel;
    if (mins < 1) rel = "moins d'une minute";
    else if (mins < 60) rel = `environ ${mins} min`;
    else {
      const hrs = Math.round(mins / 60);
      rel = hrs === 1 ? "environ 1 heure" : `environ ${hrs} heures`;
    }
    return `en vigueur jusqu'à ${clock} · ${rel}`;
  }
  if (mins < 0) return `expired at ${clock}`;
  let rel;
  if (mins < 1) rel = "less than a minute";
  else if (mins < 60) rel = `about ${mins} min`;
  else {
    const hrs = Math.round(mins / 60);
    rel = hrs === 1 ? "about 1 hour" : `about ${hrs} hours`;
  }
  return `in effect until ${clock} · ${rel}`;
}

export default function NotificationCard({ situation, onAnalyze, onBack, busy, language = "en" }) {
  const t = STR[language] || STR.en;
  const meta = HAZARDS[situation.hazardType];
  const isDemo = situation.source === "mock";
  const exampleImg = isDemo ? EXAMPLE_IMAGES[situation.hazardType] : null;
  const window = formatWindow(situation.expires, language);
  const hazLabel = hazardLabel(meta, language);
  const eventLabel = alertEventLabel(situation.event, language);
  const sevLabel = severityLabel(situation.severity, language);
  const urgLabel = urgencyLabel(situation.urgency, language);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {t.back}
        </button>
        <span className="event">
          {isDemo ? t.synthetic : t.detected}
        </span>
      </header>

      <div className="notif rise">
        <div className="notif-top">
          <span className="notif-glyph"><Icon name={meta?.icon || "warning"} size={20} /></span>
          <div>
            <div className="notif-event">{eventLabel}</div>
            <div className="notif-meta">
              {hazLabel} · {sevLabel} · {urgLabel}
            </div>
            {window && (
              <div className="notif-window">
                <Icon name="warning" size={12} /> {window}
              </div>
            )}
          </div>
          {isDemo && <span className="badge-demo">DEMO</span>}
        </div>

        {exampleImg ? (
          <div className="alert-compare">
            <figure className="compare-col">
              <figcaption className="compare-cap">
                <span className="compare-tag compare-tag-gen">{t.generated}</span> {t.generatedSub}
              </figcaption>
              <div className="alert-mock">
                <div className="alert-mock-bar">
                  <Icon name="warning" size={13} /> {t.emergencyAlert}
                </div>
                <div className="alert-mock-body">
                  <div className="alert-mock-title">{eventLabel}</div>
                  <div className="alert-mock-sub">
                    {sevLabel} · {urgLabel}
                  </div>
                  {situation.headline && situation.headline !== situation.event && (
                    <div className="alert-mock-head">{situation.headline}</div>
                  )}
                  {situation.description && <p>{situation.description}</p>}
                  {situation.instruction && (
                    <p className="alert-mock-instr">{situation.instruction}</p>
                  )}
                </div>
              </div>
            </figure>

            <figure className="compare-col">
              <figcaption className="compare-cap">
                <span className="compare-tag compare-tag-real">{t.real}</span> {t.realSub(hazLabel)}
              </figcaption>
              <img
                className="compare-img"
                src={exampleImg}
                alt={t.realAlt(hazLabel)}
              />
            </figure>
          </div>
        ) : (
          <>
            {situation.headline && situation.headline !== situation.event && (
              <div className="notif-headline">{situation.headline}</div>
            )}
            {situation.description && <p className="notif-desc">{situation.description}</p>}
            {situation.instruction && (
              <p className="notif-instruction">
                <strong>{t.officialGuidance}</strong> {situation.instruction}
              </p>
            )}
          </>
        )}

        <button className="primary" onClick={onAnalyze} disabled={busy}>
          {t.analyze} <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
