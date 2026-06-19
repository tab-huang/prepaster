// Demo config - two ways in:
//   • Synthetic alert: pick a hazard + how much time + where; we generate a
//     realistic alert and run the full pipeline.
//   • Real active disaster: scan live feeds for something happening right now and
//     pick one to simulate standing next to.

import { useState } from "react";
import { HAZARDS, HAZARD_ORDER, TIERS, hazardLabel, PATTERN_LABEL } from "../hazards.js";
import Icon from "./Icon.jsx";

const STR = {
  en: {
    back: "Back",
    demo: "Demo",
    synthetic: "Synthetic alert",
    realActive: "Real active disaster",
    syntheticSub: "Choose a scenario. We generate a realistic alert at a test site with real terrain (or your own location), then run the full pipeline on it.",
    hazard: "Hazard",
    howMuchTime: "How much time",
    runHere: "Run at my current location instead of the test site",
    defaultSite: (site) => ` (default: ${site})`,
    generating: "Generating alert…",
    generate: (label, tier) => `Generate ${label} · ${tier}`,
    realSub: "We scan live feeds for a disaster happening right now. A real US warning (NWS), Canadian alert (ECCC), or earthquake (USGS). Pick one to stand next to. Live data, simulated location.",
    scanning: "Scanning live feeds…",
    findActive: "Find active disasters",
  },
  fr: {
    back: "Retour",
    demo: "Démo",
    synthetic: "Alerte synthétique",
    realActive: "Catastrophe réelle active",
    syntheticSub: "Choisissez un scénario. Nous générons une alerte réaliste sur un site de test au terrain réel (ou votre propre position), puis exécutons tout le pipeline dessus.",
    hazard: "Danger",
    howMuchTime: "Combien de temps",
    runHere: "Exécuter à ma position actuelle plutôt que sur le site de test",
    defaultSite: (site) => ` (par défaut : ${site})`,
    generating: "Génération de l'alerte…",
    generate: (label, tier) => `Générer ${label} · ${tier}`,
    realSub: "Nous scrutons les flux en direct pour une catastrophe en cours. Un vrai avertissement américain (NWS), une alerte canadienne (ECCC) ou un séisme (USGS). Choisissez-en un pour vous placer à côté. Données réelles, position simulée.",
    scanning: "Analyse des flux en direct…",
    findActive: "Trouver des catastrophes actives",
  },
};

export default function StartScreen({ onDemo, onRealDemo, onBack, error, busy, language = "en" }) {
  const [mode, setMode] = useState("synthetic"); // synthetic | real
  const [hazard, setHazard] = useState("flood");
  const [tier, setTier] = useState("ACT");
  const [atMyLocation, setAtMyLocation] = useState(false);
  const s = STR[language] || STR.en;
  const patLabel = PATTERN_LABEL[language] || PATTERN_LABEL.en;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="hazard-chip"><Icon name="beaker" size={16} /> {s.demo}</span>
      </header>

      <div className="demo-box rise">
        <div className="seg">
          <button
            className={`seg-btn ${mode === "synthetic" ? "on" : ""}`}
            onClick={() => setMode("synthetic")}
          >
            <Icon name="beaker" size={16} /> {s.synthetic}
          </button>
          <button
            className={`seg-btn ${mode === "real" ? "on" : ""}`}
            onClick={() => setMode("real")}
          >
            <Icon name="globe" size={16} /> {s.realActive}
          </button>
        </div>

        {mode === "synthetic" ? (
          <>
            <p className="demo-sub">{s.syntheticSub}</p>

            <div className="demo-label">{s.hazard}</div>
            <div className="hazard-grid">
              {HAZARD_ORDER.map((h) => (
                <button
                  key={h}
                  className={`hazard-btn ${hazard === h ? "on" : ""}`}
                  onClick={() => setHazard(h)}
                >
                  <span className="hz-glyph"><Icon name={HAZARDS[h].icon} size={22} /></span>
                  <span className="hz-text">
                    {hazardLabel(HAZARDS[h], language)}
                    <span className="hz-pattern">{patLabel[HAZARDS[h].pattern]}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="demo-label">{s.howMuchTime}</div>
            <div className="demo-tiers">
              {TIERS.map((t) => (
                <button key={t} className={`demo-tier ${tier === t ? "on" : ""}`} onClick={() => setTier(t)}>
                  {t}
                </button>
              ))}
            </div>

            <label className="demo-loc">
              <input
                type="checkbox"
                checked={atMyLocation}
                onChange={(e) => setAtMyLocation(e.target.checked)}
              />
              <span>
                {s.runHere}
                {!atMyLocation && <>{s.defaultSite(HAZARDS[hazard].site)}</>}
              </span>
            </label>

            <button className="primary" onClick={() => onDemo(hazard, tier, atMyLocation)} disabled={busy}>
              {busy ? s.generating : s.generate(hazardLabel(HAZARDS[hazard], language), tier)}
              {!busy && <Icon name="arrow" size={16} />}
            </button>
          </>
        ) : (
          <>
            <p className="demo-sub">{s.realSub}</p>

            <button className="primary" onClick={onRealDemo} disabled={busy}>
              {busy ? s.scanning : s.findActive}
              {!busy && <Icon name="globe" size={16} />}
            </button>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
