// Live-demo chooser. We scan real feeds (NWS warnings, USGS quakes) and surface up
// to 5 disasters happening right now; the user picks which one to simulate standing
// next to. Each option carries a full, pipeline-ready payload from /api/demo/live/list.

import Icon from "./Icon.jsx";
import { HAZARDS, hazardLabel, tierLabel, alertEventLabel, severityLabel } from "../hazards.js";

const TIER_TIME_SHORT = {
  en: { RUN: "Under 10 min", ACT: "Under 1 hour", PREPARE: "Under 6 hours" },
  fr: { RUN: "Moins de 10 min", ACT: "Moins d'1 heure", PREPARE: "Moins de 6 heures" },
};
const TIER_CLASS = { RUN: "tier-run", ACT: "tier-act", PREPARE: "tier-prepare" };

const STR = {
  en: {
    back: "Back",
    tag: "Live · simulated",
    title: "Active disasters right now",
    sub: "Real events from live feeds (NWS, ECCC, USGS). Pick one to simulate standing next to it. Your location is simulated; the data is real.",
  },
  fr: {
    back: "Retour",
    tag: "En direct · simulé",
    title: "Catastrophes actives en ce moment",
    sub: "Événements réels issus de flux en direct (NWS, ECCC, USGS). Choisissez-en un pour simuler que vous vous trouvez à côté. Votre position est simulée ; les données sont réelles.",
  },
};

export default function DisasterPicker({ options, onChoose, onBack, busy, language = "en" }) {
  const s = STR[language] || STR.en;
  const tierTime = TIER_TIME_SHORT[language] || TIER_TIME_SHORT.en;
  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="event">{s.tag}</span>
      </header>

      <div className="picker rise">
        <h2 className="picker-title">{s.title}</h2>
        <p className="picker-sub">{s.sub}</p>

        <div className="picker-list">
          {options.map((opt, i) => {
            const s = opt.situation;
            const meta = HAZARDS[opt.hazardType];
            return (
              <button
                key={i}
                className="picker-card"
                onClick={() => onChoose(opt)}
                disabled={busy}
              >
                <span className="picker-glyph">
                  <Icon name={meta?.icon || "warning"} size={22} />
                </span>
                <span className="picker-body">
                  <span className="picker-event">{alertEventLabel(s.event, language)}</span>
                  <span className="picker-meta">
                    {hazardLabel(meta, language)}
                    {opt.locationLabel ? ` · ${opt.locationLabel}` : ""}
                    {s.severity ? ` · ${severityLabel(s.severity, language)}` : ""}
                  </span>
                </span>
                <span className="picker-right">
                  <span className={`tier ${TIER_CLASS[opt.timeTier]}`}>{tierLabel(opt.timeTier, language)}</span>
                  <span className="picker-time">{tierTime[opt.timeTier]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
