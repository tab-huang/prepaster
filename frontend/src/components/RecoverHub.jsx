// Recover hub — the third act after Receive → Respond. The acute danger has passed;
// now the user picks their hazard and chooses between the two recovery tools:
//   • Clean-up & re-entry guide (AI slideshow grounded in official return-home pages)
//   • Insurance & aid paperwork (analyze a redacted recovery document)

import { useState } from "react";
import { HAZARDS, HAZARD_ORDER, hazardLabel } from "../hazards.js";
import Icon from "./Icon.jsx";
import "../recover.css";

const STR = {
  en: {
    back: "Back",
    chip: "Recover",
    title: "Recover after the disaster",
    sub: "The immediate danger has passed. Get a safe clean-up & re-entry plan — then ask the recovery assistant anything, including help with insurance and FEMA paperwork. Pick what you went through.",
    hazard: "What happened?",
    cleanTitle: "Clean-up & re-entry guide",
    cleanSub: "A step-by-step plan for going back safely — gas leaks, electrical, structure, then cleaning up — built from official return-home guidance. Includes an assistant for your questions and insurance/aid paperwork.",
    paperTitle: "Insurance & aid paperwork",
    paperSub: "Paste a confusing insurance letter, FEMA notice, or claim denial. We pull out the deadlines, required proof, and who to call.",
    pick: "Choose your hazard above first.",
  },
  fr: {
    back: "Retour",
    chip: "Rétablir",
    title: "Se rétablir après la catastrophe",
    sub: "Le danger immédiat est passé. Obtenez un plan de nettoyage et de retour sécuritaire — puis posez vos questions à l'assistant de récupération, y compris pour la paperasse d'assurance et de la FEMA. Choisissez ce que vous avez vécu.",
    hazard: "Que s'est-il passé ?",
    cleanTitle: "Guide de nettoyage et de retour",
    cleanSub: "Un plan étape par étape pour rentrer en sécurité — fuites de gaz, électricité, structure, puis nettoyage — fondé sur les consignes officielles. Comprend un assistant pour vos questions et la paperasse d'assurance et d'aide.",
    paperTitle: "Assurance et aide : la paperasse",
    paperSub: "Collez une lettre d'assurance, un avis de la FEMA ou un refus de réclamation. Nous en extrayons les délais, les preuves requises et qui contacter.",
    pick: "Choisissez d'abord votre danger ci-dessus.",
  },
};

export default function RecoverHub({ onBack, onCleanup, language = "en" }) {
  const [hazard, setHazard] = useState(null);
  const s = STR[language] || STR.en;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="hazard-chip"><Icon name="check" size={16} /> {s.chip}</span>
      </header>

      <div className="rcv rise">
        <h2 className="rcv-title">{s.title}</h2>
        <p className="rcv-sub">{s.sub}</p>

        <div className="rcv-label">{s.hazard}</div>
        <div className="hazard-grid">
          {HAZARD_ORDER.map((h) => (
            <button
              key={h}
              className={`hazard-btn ${hazard === h ? "on" : ""}`}
              onClick={() => setHazard(h)}
            >
              <span className="hz-glyph"><Icon name={HAZARDS[h].icon} size={22} /></span>
              <span className="hz-text">{hazardLabel(HAZARDS[h], language)}</span>
            </button>
          ))}
        </div>

        <div className="rcv-cards">
          <button
            className="rcv-card"
            onClick={() => hazard && onCleanup(hazard)}
            disabled={!hazard}
          >
            <span className="rcv-card-icon"><Icon name="home" size={22} /></span>
            <span className="rcv-card-body">
              <span className="rcv-card-title">{s.cleanTitle}</span>
              <span className="rcv-card-sub">{s.cleanSub}</span>
            </span>
            <span className="rcv-card-arrow"><Icon name="arrow" size={15} /></span>
          </button>
        </div>

        {!hazard && <p className="rcv-hint">{s.pick}</p>}
      </div>
    </div>
  );
}
