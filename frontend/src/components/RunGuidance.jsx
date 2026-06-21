// RUN tier - hardcoded life-safety guidance, shown instantly, no API dependency.
// This is the most important text to hear eyes-free (the user may be fleeing, hands
// full, unable to read), so it carries a read-aloud button.
//
// The English copy comes from the backend (run_guidance). It's fetched before the
// language toggle is even on screen, so we hold a French version here keyed by hazard
// and swap it in when the toggle is French — so the card AND its narration are French,
// matching the rest of the app (no English leak).

import Icon from "./Icon.jsx";
import { speak, ttsSupported } from "../speech.js";
import { makeT } from "../i18n.js";
import PlanGuidelines from "./PlanGuidelines.jsx";

const RUN_GUIDANCE_FR = {
  flood: {
    headline: "PARTEZ MAINTENANT — gagnez un terrain élevé",
    lines: [
      "Alerte d'inondation. Il ne reste peut-être que quelques minutes. N'attendez pas.",
      "Gagnez maintenant le terrain ou l'étage le plus élevé que vous pouvez atteindre.",
      "Ne marchez, ne nagez et ne conduisez jamais dans l'eau de crue — quinze centimètres "
      + "vous renversent, trente centimètres emportent une voiture.",
      "Ne contournez pas les barricades.",
      "Si vous êtes piégé, gagnez le point le plus haut et appelez le 911.",
    ],
  },
  wildfire: {
    headline: "PARTEZ MAINTENANT — éloignez-vous du feu",
    lines: [
      "Alerte de feu de forêt. Partez maintenant, loin de la fumée et des flammes.",
      "Déplacez-vous perpendiculairement au vent, pas dans la trajectoire du feu.",
      "Si vous devez conduire, gardez les fenêtres fermées et les évents coupés.",
      "Si vous êtes piégé, appelez le 911. Abritez-vous dans une zone dégagée ou dans un "
      + "véhicule, évents fermés, sous le niveau des fenêtres.",
      "Suivez d'abord les itinéraires et les ordres d'évacuation officiels.",
    ],
  },
  tornado: {
    headline: "METTEZ-VOUS À L'ABRI — bas et à l'intérieur",
    lines: [
      "Alerte de tornade. Gagnez maintenant l'étage le plus bas, la pièce la plus "
      + "intérieure, loin des fenêtres.",
      "Protégez votre tête et votre nuque.",
      "N'essayez pas de distancer une tornade à pied.",
      "Si vous êtes en véhicule ou en maison mobile et qu'un bâtiment solide est à "
      + "quelques secondes, allez-y.",
      "Si vous êtes pris dehors sans abri, allongez-vous dans un creux et couvrez votre tête.",
    ],
  },
  earthquake: {
    headline: "BAISSEZ-VOUS, ABRITEZ-VOUS, TENEZ BON",
    lines: [
      "Mettez-vous à quatre pattes.",
      "Abritez-vous sous un meuble solide ; protégez votre tête et votre nuque.",
      "Tenez bon jusqu'à la fin des secousses.",
      "Restez loin des fenêtres et de tout ce qui peut tomber.",
      "Après les secousses : vérifiez le gaz et les dommages. Si c'est dangereux, gagnez un "
      + "terrain dégagé loin des bâtiments et des lignes électriques. Attendez-vous à des répliques.",
    ],
  },
};

export default function RunGuidance({ guidance, lang = "en", hazardType }) {
  const t = makeT(lang);
  const g = (lang === "fr" && RUN_GUIDANCE_FR[hazardType]) || guidance;
  if (!g) return null;
  const readAloud = () => speak([g.headline, ...g.lines].join(". "), lang);

  return (
    <div className="run rise">
      {ttsSupported() && (
        <button
          className="run-tts-btn"
          onClick={readAloud}
          aria-label={t("readSummaryAloud")}
          title={t("readSummaryAloud")}
        >
          <Icon name="volume" size={16} />
        </button>
      )}
      <div className="run-headline">
        <Icon name="warning" size={26} strokeWidth={2} />
        {g.headline}
      </div>
      <ul className="run-lines">
        {g.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <PlanGuidelines variant="compact" lang={lang} />
    </div>
  );
}
