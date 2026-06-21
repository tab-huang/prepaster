import { useState } from "react";
import Icon from "./Icon.jsx";
import TechnicalDocs from "./TechnicalDocs.jsx";
import "../home-landing.css";

// Government source links. Titles/URLs are the agencies' own (English) page names and
// stay as-is; only the hazard group label is localized.
const GOV_LINKS = [
  {
    hazard: { en: "Flood", fr: "Inondation" },
    sources: [
      { title: "Ready.gov - Floods",      url: "https://www.ready.gov/floods" },
      { title: "NWS - Flood Safety",      url: "https://www.weather.gov/safety/flood" },
      { title: "FEMA - Flood Risk",       url: "https://www.fema.gov/emergency-managers/risk-management/flood" },
    ],
  },
  {
    hazard: { en: "Wildfire", fr: "Incendie" },
    sources: [
      { title: "Ready.gov - Wildfires",        url: "https://www.ready.gov/wildfires" },
      { title: "CAL FIRE - Protect Yourself",  url: "https://www.fire.ca.gov/ways-to-protect-yourself-from-wildfires/" },
      { title: "NWS - Wildfire Safety",        url: "https://www.weather.gov/safety/wildfire" },
    ],
  },
  {
    hazard: { en: "Tornado", fr: "Tornade" },
    sources: [
      { title: "Ready.gov - Tornadoes",         url: "https://www.ready.gov/tornadoes" },
      { title: "NWS - Tornado Safety",          url: "https://www.weather.gov/safety/tornado" },
      { title: "NOAA SPC - Tornado Safety FAQ", url: "https://www.spc.noaa.gov/faq/tornado/safety.html" },
    ],
  },
  {
    hazard: { en: "Earthquake", fr: "Séisme" },
    sources: [
      { title: "Ready.gov - Earthquakes",               url: "https://www.ready.gov/earthquakes" },
      { title: "USGS - Earthquake Preparedness",        url: "https://www.usgs.gov/programs/earthquake-hazards/prepare" },
      { title: "Earthquake Country Alliance - 7 Steps", url: "https://www.earthquakecountry.org/sevensteps/" },
    ],
  },
];

const STR = {
  en: {
    back: "Back",
    chip: "How it works",
    heroTitle: "What happens when an alert fires",
    heroLede: "The moment an alert comes in, this app turns it into one clear move from exactly where you're standing: a step-by-step plan, a live map, and answers to whatever you ask.",

    s1Label: "Official guidance",
    s1Body: (
      <>
        Your plan isn't improvised. The AI scrapes current guidance from these authoritative
        public-safety pages and uses their exact wording for the details that have to be right -
        floodwater depth thresholds, drop-cover-hold sequences, shelter rules, evacuation routes.
      </>
    ),
    s1Body2: (
      <>
        On top of that guidance it reads <strong>live conditions around you</strong>:
        terrain and elevation, wind direction, active fire detections (NASA FIRMS),
        nearby earthquakes (USGS), safe buildings and open spaces (OpenStreetMap), and
        recent local news.
      </>
    ),

    s2Label: "Technical specifications",
    s2Body: "Want the full picture - the five-stage pipeline, the data-flow graph, the hazard modules, caching, the AI contract, and every external service? The complete technical documentation lays it all out.",
    techLinkTitle: "View technical documentation",
    techLinkSub: "Architecture, pipeline diagrams, API reference, and limitations",

    s3Label: "Your plan, in four phases",
    s3Body: "Every plan is structured into four phases in order. How many steps each phase gets depends on your situation and how much time you have.",
    phases: [
      { name: "Preparation", desc: "Only when you have time. What to grab, what to turn off, who to call, what to pack. Skipped entirely when the hazard is already here." },
      { name: "Evacuation / Brace", desc: "For floods and wildfires: leave now, your route, and what to avoid. For tornadoes and earthquakes: get to the safest spot and follow the exact shelter sequence." },
      { name: "At shelter / Arrival", desc: "What to do once you've reached safety or the hazard has passed its peak. Check in, check for injury, stay put until clear." },
      { name: "After", desc: "Recovery. Check for gas, structural damage, and downed lines. Contact family and follow official re-entry guidance." },
    ],
    s3Body2: "You move through it as a slideshow - one step at a time, each with a rough time estimate and an expandable checklist of concrete actions. Mark steps done as you go. Tap \"Why this plan?\" on the summary to see the few short bullets behind the AI's thinking - and a calm reminder that you know your situation best: if a step doesn't match what you're seeing, trust your eyes, follow official instructions and on-scene responders (they have the final say), and call 911 first in a real emergency.",

    s4Label: "How much time you have",
    s4Body: "Every alert is sorted into a tier that shapes the whole response:",
    tiers: [
      { label: "RUN", cls: "tier-run", desc: "Minutes. Instant life-safety guidance now; full next-steps plan builds in the background while you move." },
      { label: "ACT", cls: "tier-act", desc: "About an hour. A quick one-tap check of your situation — vehicle, mobility, medical needs, dependents — then a plan tailored to it." },
      { label: "PREPARE", cls: "tier-prepare", desc: "Several hours. The hazard isn't here yet - plan a route, gather supplies, know your triggers." },
    ],

    s5Label: "The map",
    s5Body: "The map draws as soon as your surroundings are scanned, without waiting for the AI. What you see depends on the hazard:",
    mapList: [
      <>A blue marker for <strong>you</strong>, a pulsing green marker for your <strong>destination</strong>, and the real road route traced between them.</>,
      <><strong>Floods:</strong> nearby points colored by elevation - green is higher and safer, red is lower. Plus the nearest supply stop.</>,
      <><strong>Wildfire:</strong> active NASA FIRMS fire detections and a wind arrow showing which way the fire is being pushed.</>,
      <><strong>Tornado / earthquake:</strong> safe buildings and open green spaces nearby. If the safest move is to stay put, your location is ringed instead of routed.</>,
      <>Toggle satellite, terrain, streets, elevation relief, and topo contours. A compass keeps you oriented.</>,
    ],

    s6Label: "Ask anything",
    s6Body: (
      <>
        The plan has an <strong>Ask anything</strong> assistant. Tap a suggested question -
        <em>"How much time do I have?"</em>, <em>"What should I bring?"</em> - or type your own
        (<em>"Is it safe to use the elevator?"</em>). Answers are short, calm, grounded in the same
        official guidance, and never disturb your plan. The app also keeps watching the alert: if it
        is upgraded it tells you to act now, and once the danger has passed it offers to carry you
        into Recover.
      </>
    ),

    s7Label: "When your situation changes",
    s7Body: (
      <>
        Tell it what changed: <em>"roads near me are flooded"</em>, <em>"I can't leave, I have
        pets"</em>, <em>"there's a shelter 2 km north"</em>. It rebuilds the whole plan around
        that. Reached the end and need more? Request extra steps too.
      </>
    ),

    s8Label: "Built to work when it matters",
    s8Body: "Your latest plan is saved to your device, so it's there even if you go offline. Share or text the whole plan in one tap. If the AI is ever unreachable, a deterministic engine still produces a safe plan - the app never leaves you with nothing.",

    s9Label: "After the danger passes — Recover",
    s9Body: "Receiving and responding to the alert is only half of it. The app watches the warning and, once the danger has passed, offers to carry you into Recover — or open it yourself from the home screen. Pick what you went through, and it handles the hardest parts of the days that follow:",
    recParts: [
      { name: "Clean-up & re-entry guide", desc: "Tell it what was damaged, describe what you're seeing, and optionally add photos. It builds a step-by-step slideshow — is it safe to go back in, check for gas and electrical, then how to clean up — grounded in official return-home guidance (CDC, Ready.gov, EPA). You can also attach your insurance, FEMA, or aid letter (paste it or photograph it): the app reads it, works out the real deadlines, and folds them right into the plan." },
      { name: "Recovery assistant", desc: "Ask anything about recovery, and decode an insurance / FEMA / provincial disaster-assistance letter: it computes the actual deadlines (with days remaining and urgency), the proof to gather, and who to contact. Sensitive data like SSNs and full policy numbers is removed automatically before anything is analyzed — you never have to redact it yourself." },
    ],

    disclaimer: "Honest constraint: a web app can't receive an OS-level emergency push when closed. Real alerts go through the Wireless Emergency Alert system. This demonstrates the decision engine, triggered by an alert you provide or simulate.",
    gotIt: "Got it",
  },

  fr: {
    back: "Retour",
    chip: "Comment ça marche",
    heroTitle: "Ce qui se passe quand une alerte se déclenche",
    heroLede: "Dès qu'une alerte arrive, cette application la transforme en une action claire depuis l'endroit exact où vous vous tenez : un plan étape par étape, une carte en direct et des réponses à toutes vos questions.",

    s1Label: "Consignes officielles",
    s1Body: (
      <>
        Votre plan n'est pas improvisé. L'IA récupère les consignes à jour de ces pages
        officielles de sécurité publique et reprend leur formulation exacte pour les détails qui
        doivent être justes — seuils de hauteur d'eau, séquences « baissez-vous, couvrez-vous,
        agrippez-vous », règles d'abri, routes d'évacuation.
      </>
    ),
    s1Body2: (
      <>
        En plus de ces consignes, elle lit les <strong>conditions en direct autour de vous</strong> :
        terrain et altitude, direction du vent, détections d'incendie actif (NASA FIRMS),
        séismes à proximité (USGS), bâtiments sûrs et espaces dégagés (OpenStreetMap), et
        l'actualité locale récente.
      </>
    ),

    s2Label: "Spécifications techniques",
    s2Body: "Vous voulez le tableau complet — le pipeline en cinq étapes, le graphe de flux de données, les modules de danger, la mise en cache, le contrat de l'IA et chaque service externe ? La documentation technique complète détaille tout.",
    techLinkTitle: "Voir la documentation technique",
    techLinkSub: "Architecture, diagrammes du pipeline, référence d'API et limites",

    s3Label: "Votre plan, en quatre phases",
    s3Body: "Chaque plan est structuré en quatre phases successives. Le nombre d'étapes de chaque phase dépend de votre situation et du temps dont vous disposez.",
    phases: [
      { name: "Préparation", desc: "Seulement quand vous avez le temps. Quoi prendre, quoi couper, qui appeler, quoi emporter. Entièrement ignorée quand le danger est déjà là." },
      { name: "Évacuation / Mise à l'abri", desc: "Pour les inondations et les incendies : partez maintenant, votre itinéraire et ce qu'il faut éviter. Pour les tornades et les séismes : gagnez l'endroit le plus sûr et suivez la séquence d'abri exacte." },
      { name: "À l'abri / Arrivée", desc: "Quoi faire une fois en sécurité ou le danger passé à son pic. Signalez-vous, vérifiez les blessures, restez sur place jusqu'au feu vert." },
      { name: "Après", desc: "Rétablissement. Vérifiez le gaz, les dommages structurels et les lignes tombées. Contactez vos proches et suivez les consignes officielles de retour." },
    ],
    s3Body2: "Vous le parcourez comme un diaporama — une étape à la fois, chacune avec une estimation de temps approximative et une liste d'actions concrètes dépliable. Cochez les étapes au fur et à mesure. Touchez « Pourquoi ce plan ? » sur le résumé pour voir en quelques puces le raisonnement de l'IA — et un rappel calme : vous connaissez votre situation mieux que quiconque. Si une étape ne correspond pas à ce que vous voyez, fiez-vous à vos yeux, suivez les instructions officielles et les intervenants sur place (ils ont le dernier mot), et appelez le 911 d'abord en cas d'urgence réelle.",

    s4Label: "Le temps dont vous disposez",
    s4Body: "Chaque alerte est classée dans un palier qui façonne toute la réponse :",
    tiers: [
      { label: "RUN", cls: "tier-run", desc: "Quelques minutes. Consignes vitales instantanées maintenant ; le plan complet des prochaines étapes se construit en arrière-plan pendant que vous bougez." },
      { label: "ACT", cls: "tier-act", desc: "Environ une heure. Une vérification rapide de votre situation en un toucher — véhicule, mobilité, besoins médicaux, personnes à charge — puis un plan adapté." },
      { label: "PREPARE", cls: "tier-prepare", desc: "Plusieurs heures. Le danger n'est pas encore là — planifiez un itinéraire, rassemblez des provisions, connaissez vos signaux de départ." },
    ],

    s5Label: "La carte",
    s5Body: "La carte se dessine dès que vos environs sont analysés, sans attendre l'IA. Ce que vous voyez dépend du danger :",
    mapList: [
      <>Un repère bleu pour <strong>vous</strong>, un repère vert pulsant pour votre <strong>destination</strong>, et le vrai trajet routier tracé entre les deux.</>,
      <><strong>Inondations :</strong> les points proches colorés selon l'altitude — le vert est plus haut et plus sûr, le rouge plus bas. Plus l'arrêt de ravitaillement le plus proche.</>,
      <><strong>Incendie :</strong> les détections d'incendie NASA FIRMS actives et une flèche de vent montrant vers où le feu est poussé.</>,
      <><strong>Tornade / séisme :</strong> les bâtiments sûrs et les espaces verts dégagés à proximité. Si le plus sûr est de rester sur place, votre position est cerclée plutôt que routée.</>,
      <>Basculez entre satellite, terrain, rues, relief d'altitude et courbes topographiques. Une boussole vous garde orienté.</>,
    ],

    s6Label: "Demandez n'importe quoi",
    s6Body: (
      <>
        Le plan comporte un assistant <strong>« Demandez n'importe quoi »</strong>. Touchez une
        question suggérée — <em>« Combien de temps ai-je ? »</em>, <em>« Quoi apporter ? »</em> — ou
        tapez la vôtre (<em>« Puis-je utiliser l'ascenseur ? »</em>). Les réponses sont courtes,
        calmes, fondées sur les mêmes consignes officielles, et ne perturbent pas votre plan.
        L'application surveille aussi l'alerte : si elle s'aggrave, elle vous dit d'agir maintenant,
        et une fois le danger passé, elle vous propose de passer à « Se rétablir ».
      </>
    ),

    s7Label: "Quand votre situation change",
    s7Body: (
      <>
        Dites-lui ce qui a changé : <em>« les routes près de chez moi sont inondées »</em>,
        <em>« je ne peux pas partir, j'ai des animaux »</em>, <em>« il y a un refuge à 2 km au nord »</em>.
        Il reconstruit tout le plan autour de cela. Arrivé au bout et besoin de plus ? Demandez aussi des étapes supplémentaires.
      </>
    ),

    s8Label: "Conçu pour fonctionner quand ça compte",
    s8Body: "Votre dernier plan est enregistré sur votre appareil : il reste là même hors ligne. Partagez ou envoyez tout le plan par SMS en un geste. Si l'IA est injoignable, un moteur déterministe produit quand même un plan sûr — l'application ne vous laisse jamais sans rien.",

    s9Label: "Après le danger — Se rétablir",
    s9Body: "Recevoir l'alerte et y répondre n'est que la moitié du parcours. L'application surveille l'alerte et, une fois le danger passé, vous propose de passer à « Se rétablir » — ou ouvrez-le vous-même depuis l'accueil. Choisissez ce que vous avez vécu, et l'outil gère les parties les plus difficiles des jours qui suivent :",
    recParts: [
      { name: "Guide de nettoyage et de retour", desc: "Indiquez ce qui a été endommagé, décrivez ce que vous voyez et, au besoin, ajoutez des photos. Un diaporama étape par étape se construit — est-il sûr de rentrer, vérifier le gaz et l'électricité, puis comment nettoyer — fondé sur les consignes officielles (CDC, Ready.gov, EPA). Vous pouvez aussi joindre votre lettre d'assurance, de la FEMA ou d'aide (collée ou photographiée) : l'application la lit, calcule les vrais délais et les intègre directement au plan." },
      { name: "Assistant de récupération", desc: "Posez n'importe quelle question sur le rétablissement, et décodez une lettre d'assurance / FEMA / d'aide provinciale : l'outil calcule les délais réels (jours restants et urgence), les preuves à rassembler et qui contacter. Les données sensibles comme les NAS et numéros de police complets sont retirées automatiquement avant toute analyse — vous n'avez jamais à les caviarder vous-même." },
    ],

    disclaimer: "Contrainte honnête : une application web ne peut pas recevoir d'alerte d'urgence au niveau du système quand elle est fermée. Les vraies alertes passent par le système d'alerte d'urgence sans fil (WEA). Ceci démontre le moteur de décision, déclenché par une alerte que vous fournissez ou simulez.",
    gotIt: "Compris",
  },
};

export default function InstructionsLanding({ onBack, startOnTech = false, language = "en" }) {
  const [showTech, setShowTech] = useState(startOnTech);
  const s = STR[language] || STR.en;

  if (showTech) return <TechnicalDocs onBack={() => setShowTech(false)} language={language} />;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="hazard-chip"><Icon name="info" size={16} /> {s.chip}</span>
      </header>

      <div className="il-root rise">

        {/* ── Hero ── */}
        <div className="il-hero">
          <h2 className="il-title">{s.heroTitle}</h2>
          <p className="il-lede">{s.heroLede}</p>
        </div>

        {/* ── Section: Official guidance ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s1Label}</div>
          <p className="il-body">{s.s1Body}</p>

          <div className="il-gov-grid">
            {GOV_LINKS.map((group) => (
              <div key={group.hazard.en} className="il-gov-group">
                <div className="il-gov-hazard">{group.hazard[language] || group.hazard.en}</div>
                {group.sources.map((src) => (
                  <a
                    key={src.url}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="il-gov-link"
                  >
                    <span className="il-gov-link-title">{src.title}</span>
                    <span className="il-gov-link-url">{src.url.replace("https://", "")}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>

          <p className="il-body" style={{ marginTop: "16px" }}>{s.s1Body2}</p>
        </div>

        {/* ── Section: Technical specifications ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s2Label}</div>
          <p className="il-body">{s.s2Body}</p>
          <button className="il-tech-link" onClick={() => setShowTech(true)}>
            <span className="il-tech-link-icon"><Icon name="list" size={18} /></span>
            <span className="il-tech-link-body">
              <span className="il-tech-link-title">{s.techLinkTitle}</span>
              <span className="il-tech-link-sub">{s.techLinkSub}</span>
            </span>
            <span className="il-tech-link-arrow"><Icon name="arrow" size={15} /></span>
          </button>
        </div>

        {/* ── Section: Four phases ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s3Label}</div>
          <p className="il-body">{s.s3Body}</p>
          <div className="il-phases">
            {s.phases.map((p, i) => (
              <div key={p.name} className="il-phase">
                <span className="il-phase-num">{i + 1}</span>
                <span className="il-phase-body">
                  <span className="il-phase-name">{p.name}</span>
                  <span className="il-phase-desc">{p.desc}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="il-body" style={{ marginTop: "14px" }}>{s.s3Body2}</p>
        </div>

        {/* ── Section: Time tiers ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s4Label}</div>
          <p className="il-body">{s.s4Body}</p>
          <div className="il-tiers">
            {s.tiers.map((t) => (
              <div key={t.label} className="il-tier-row">
                <span className={`tier ${t.cls} il-tier-badge`}>{t.label}</span>
                <span className="il-tier-desc">{t.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section: Map ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s5Label}</div>
          <p className="il-body">{s.s5Body}</p>
          <ul className="il-list">
            {s.mapList.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>

        {/* ── Section: Questions ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s6Label}</div>
          <p className="il-body">{s.s6Body}</p>
        </div>

        {/* ── Section: Situation changes ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s7Label}</div>
          <p className="il-body">{s.s7Body}</p>
        </div>

        {/* ── Section: Reliability ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s8Label}</div>
          <p className="il-body">{s.s8Body}</p>
        </div>

        {/* ── Section: Recover ── */}
        <div className="il-section">
          <div className="il-section-label">{s.s9Label}</div>
          <p className="il-body">{s.s9Body}</p>
          <ul className="il-list">
            {s.recParts.map((p, i) => (
              <li key={i}><strong>{p.name}.</strong> {p.desc}</li>
            ))}
          </ul>
        </div>

        {/* ── Disclaimer ── */}
        <p className="hl-disclaimer">{s.disclaimer}</p>

        <button className="primary" style={{ marginTop: "20px" }} onClick={onBack}>
          {s.gotIt} <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
