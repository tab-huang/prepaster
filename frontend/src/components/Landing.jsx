// Marketing landing page for ProtectionIV. Standalone - rendered before the app shell.
// Cinematic, scroll-told: a hero, a product overview, then one section per hazard
// where a stylized SVG scene animates as it scrolls into view and reveals its text.
//
// The hazard scenes are pure SVG/CSS (no external/licensed media). Each scene has a
// `.lp-stage` slot where a real green-screen video can later be dropped in to replace
// the drawn animation. The "Launch ProtectionIV" button is always present in the header.
//
// Bilingual: ProtectionIV's coverage is the US + officially-bilingual Canada, so the
// marketing page reads in English or French. The EN/FR toggle in the nav controls the
// same session language as the app (lifted to App.jsx, persisted), so a francophone
// visitor lands in French and stays in French straight into the plan.

import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import "../landing.css";

// Add `.lp-in` to any [data-reveal] element once it scrolls into view, so the CSS
// animations (paused by default) play exactly once, on cue.
function useScrollReveal(rootRef, deps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // `lp-seen` is permanent: text reveals once and never disappears.
            // `lp-in` toggles with visibility: the looping scene runs only while
            // on screen (and restarts cleanly when it re-enters).
            e.target.classList.add("lp-seen", "lp-in");
          } else {
            e.target.classList.remove("lp-in");
          }
        }
      },
      { threshold: 0.3 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, deps]);
}

/* ─────────────── Hazard scenes (stylized SVG) ─────────────── */

function TornadoScene() {
  return (
    <div className="lp-stage lp-stage--tornado" aria-hidden="true">
      <svg className="lp-tornado" viewBox="0 0 220 260" fill="none">
        {/* funnel - stacked tapering bands */}
        <g className="lp-tornado-body" stroke="#2a2a2e" strokeWidth="3" strokeLinecap="round">
          <path d="M40 30 H190" opacity="0.9" />
          <path d="M52 52 H176" opacity="0.85" />
          <path d="M62 76 H160" opacity="0.8" />
          <path d="M72 102 H146" opacity="0.78" />
          <path d="M82 130 H132" opacity="0.75" />
          <path d="M92 160 H120" opacity="0.7" />
          <path d="M100 192 H114" opacity="0.65" />
          <path d="M104 222 H112" opacity="0.6" />
        </g>
        {/* swirl outline */}
        <path className="lp-tornado-swirl" d="M40 30 C90 60 70 110 110 140 C150 170 120 210 108 240"
          stroke="#18181a" strokeWidth="2" opacity="0.5" />
      </svg>
      <span className="lp-debris lp-debris--1" />
      <span className="lp-debris lp-debris--2" />
      <span className="lp-debris lp-debris--3" />
    </div>
  );
}

function WildfireScene() {
  const trees = [0, 1, 2, 3, 4];
  return (
    <div className="lp-stage lp-stage--wildfire" aria-hidden="true">
      <div className="lp-treeline">
        {trees.map((i) => (
          <div className="lp-tree" key={i} style={{ "--t": i }}>
            <svg viewBox="0 0 60 110" fill="none">
              <path className="lp-tree-foliage" d="M30 6 L50 50 H38 L54 86 H6 L22 50 H10 Z" fill="#1f7a4d" />
              <rect className="lp-tree-trunk" x="26" y="84" width="8" height="22" fill="#3a2a1c" />
            </svg>
            <span className="lp-flame lp-flame--a" />
            <span className="lp-flame lp-flame--b" />
            <span className="lp-flame lp-flame--c" />
          </div>
        ))}
      </div>
      <div className="lp-emberfield">
        {Array.from({ length: 10 }).map((_, i) => (
          <span className="lp-ember" key={i} style={{ "--e": i }} />
        ))}
      </div>
    </div>
  );
}

function FloodScene() {
  return (
    <div className="lp-stage lp-stage--flood" aria-hidden="true">
      <div className="lp-water">
        <svg className="lp-wave lp-wave--back" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,60 C150,100 350,20 600,60 C850,100 1050,20 1200,60 L1200,120 L0,120 Z" fill="#3a6f9c" />
        </svg>
        <svg className="lp-wave lp-wave--front" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,70 C200,30 400,110 600,70 C800,30 1000,110 1200,70 L1200,120 L0,120 Z" fill="#2b6ca8" />
        </svg>
      </div>
    </div>
  );
}

function EarthquakeScene() {
  return (
    <div className="lp-stage lp-stage--quake" aria-hidden="true">
      <div className="lp-quake-scene">
        {/* buildings sitting on the ground; they sway, then tilt toward the rupture */}
        <span className="lp-bldg lp-bldg--1" />
        <span className="lp-bldg lp-bldg--2" />
        <span className="lp-bldg lp-bldg--3" />
        <span className="lp-bldg lp-bldg--4" />
        {/* the ground, with a jagged crack that tears open through it */}
        <div className="lp-ground">
          <svg className="lp-crack" viewBox="0 0 60 80" preserveAspectRatio="none">
            <path d="M30 0 L38 16 L22 32 L40 48 L18 64 L28 80" />
          </svg>
        </div>
        <span className="lp-rubble lp-rubble--1" />
        <span className="lp-rubble lp-rubble--2" />
      </div>
    </div>
  );
}

const SCENES = {
  tornado: TornadoScene,
  wildfire: WildfireScene,
  flood: FloodScene,
  earthquake: EarthquakeScene,
};

/* ─────────────── Localized copy (EN / FR) ─────────────── */

const CONTENT = {
  en: {
    navCta: "Launch app",
    heroSub: "Turn a stressful disaster alert into a manageable plan.",
    launch: "Launch ProtectionIV",
    seeHow: "See how it works",
    overviewTitle: (
      <>
        Currently, warnings tell you <em>that</em> something is coming.
        ProtectionIV tells you <em>what to do</em> about it.
      </>
    ),
    overviewBody:
      "It takes your location and an alert, works out how much time you actually have, " +
      "runs a hazard-specific decision engine over live geospatial data, surrounding area, disaster " +
      "facts, and returns one simple, direct, usable action plan: drawn path over a live map, " +
      "grounded in official safety guidance from government sources.",
    howTitle: "How it works",
    howSub: "The pipeline, time tiers, and how the plan is built",
    techTitle: "Technical specifications",
    techSub: "Architecture, data flow, API reference, and limitations",
    hazards: [
      { id: "tornado", flip: false,
        title: "A tornado is on the ground.",
        body: "No time to think. ProtectionIV puts you in the lowest, most interior room, walks the drop-and-cover sequence, and points to the nearest sturdy building if you can still reach it.",
        action: "If it strikes: get to the lowest, most interior room and cover your head and neck. Never shelter under a highway overpass!" },
      { id: "wildfire", flip: true,
        title: "The fire is moving with the wind.",
        body: "It reads live fire detections and wind direction, then routes you away from the front, never downwind and never toward the flames, to real shelter along official evacuation routes.",
        action: "If it strikes: leave early and drive away from the smoke, never toward it, and follow official evacuation routes!" },
      { id: "flood", flip: false,
        title: "The water is rising fast.",
        body: "ProtectionIV knows which way the ground actually rises from where you stand, finds higher floors or higher ground, and keeps you off flooded roads and creek crossings.",
        action: "If it strikes: move to higher ground and never walk or drive through moving water, just six inches can sweep you off your feet!" },
      { id: "earthquake", flip: true,
        title: "The shaking won't stop.",
        body: "Drop, cover, hold. Then what? It confirms the quake against USGS, checks for aftershock guidance, and finds open ground away from buildings and power lines once it's safe to move.",
        action: "If it strikes: drop, cover, and hold on, then once the shaking stops move to an open area away from buildings, power lines, and possible debris!" },
    ],
    dataTitle: "Every plan is built on real data and official guidance.",
    dataIntro:
      "ProtectionIV never improvises. The moment an alert fires, it reads live feeds at your " +
      "exact coordinates and grounds every critical instruction in the agencies that write " +
      "the rules. Here is exactly what it pulls, and what each source does.",
    block1: "Live data pulled",
    block2: "Official guidance reference",
    liveData: [
      ["NWS (National Weather Service)", "Official US watches and warnings for floods, tornadoes, and severe weather, pulled with their exact warned-area polygon so ProtectionIV can tell whether you are actually standing inside the alert zone, not just nearby."],
      ["Environment and Climate Change Canada", "The Canadian counterpart, providing live regional weather warnings for users north of the border, normalized into the same alert shape so the rest of the engine treats them identically."],
      ["USGS Earthquake Feed", "Real-time global earthquake detections (magnitude, epicentre, depth, and time), used to confirm a quake actually happened near you and to ground the plan in its real size and distance."],
      ["NASA FIRMS", "Satellite thermal detections of active fire, refreshed through the day, so the plan reacts to where flames are burning right now, not just where a fire was first reported hours ago."],
      ["Open-Meteo Elevation", "Samples the terrain in eight directions and three rings around your exact coordinates to compute which way the ground genuinely rises, the high-ground vector that drives flood routing."],
      ["Open-Meteo Wind", "Current wind speed and the direction the fire is being pushed, so a wildfire route sends you away from the front and never into the path of the smoke."],
      ["Overpass / OpenStreetMap", "Live queries for real structures near you (hospitals, fire stations, schools, community centres), pharmacies and supermarkets for supplies, and genuinely open land for earthquake assembly points."],
      ["OSRM Routing", "Traces your escape route along the actual road network rather than a straight line, with a straight-line fallback drawn if the routing service is unreachable."],
      ["Google News", "During a live alert it pulls recent local headlines so the plan can reference real road closures, rescues, and open shelters happening in your area."],
      ["Nominatim", "Reverse-geocodes your coordinates into a readable place name and selects the correct local emergency number to show throughout the plan."],
    ],
    guidance: [
      ["Ready.gov", "Department of Homeland Security national preparedness guidance for each of the four hazards."],
      ["FEMA", "Federal flood-risk and emergency-management guidance, including evacuation and re-entry advice."],
      ["National Weather Service safety", "Hazard-specific safety pages for floods, tornadoes, and wildfire, used for the wording that has to be exact."],
      ["USGS Earthquake preparedness", "The authoritative Drop, Cover, and Hold On sequence and aftershock guidance, with debunked myths (doorways) explicitly excluded."],
      ["CAL FIRE", "Wildfire protection and evacuation specifics, including what to do if you are trapped in a vehicle."],
      ["NOAA Storm Prediction Center", "The tornado safety FAQ, including why a highway overpass is one of the worst places to shelter."],
      ["American Red Cross", "Sheltering, supply, and recovery guidance for the after phase of every plan."],
      ["Earthquake Country Alliance", "The Seven Steps to Earthquake Safety that structure the earthquake plan."],
    ],
    ctaTitle: "Know your next move before you need it.",
    ctaSub: "Turn a stressful alert into a manageable plan.",
    foot: "ProtectionIV is a decision engine for the moment an alert fires. This demonstrates the engine, triggered by an alert you provide or simulate.",
  },

  fr: {
    navCta: "Lancer l'app",
    heroSub: "Transformez une alerte de catastrophe stressante en un plan gérable.",
    launch: "Lancer ProtectionIV",
    seeHow: "Voir comment ça marche",
    overviewTitle: (
      <>
        Aujourd'hui, les alertes vous disent <em>qu'un danger</em> approche.
        ProtectionIV vous dit <em>quoi faire</em> face à lui.
      </>
    ),
    overviewBody:
      "Il prend votre position et une alerte, calcule le temps dont vous disposez réellement, " +
      "exécute un moteur de décision spécifique au danger sur des données géospatiales en direct, " +
      "les environs et les faits de la catastrophe, et renvoie un plan d'action simple, direct et " +
      "utilisable : un trajet tracé sur une carte en direct, fondé sur les consignes de sécurité " +
      "officielles des sources gouvernementales.",
    howTitle: "Comment ça marche",
    howSub: "Le pipeline, les paliers de temps et la construction du plan",
    techTitle: "Spécifications techniques",
    techSub: "Architecture, flux de données, référence d'API et limites",
    hazards: [
      { id: "tornado", flip: false,
        title: "Une tornade touche le sol.",
        body: "Aucun temps pour réfléchir. ProtectionIV vous place dans la pièce la plus basse et la plus intérieure, déroule la séquence « baissez-vous et couvrez-vous », et indique le bâtiment solide le plus proche si vous pouvez encore l'atteindre.",
        action: "Si elle frappe : gagnez la pièce la plus basse et la plus intérieure et protégez votre tête et votre nuque. Ne vous abritez jamais sous un viaduc d'autoroute !" },
      { id: "wildfire", flip: true,
        title: "Le feu avance avec le vent.",
        body: "Il lit les détections d'incendie en direct et la direction du vent, puis vous éloigne du front, jamais sous le vent ni vers les flammes, vers un véritable abri le long des routes d'évacuation officielles.",
        action: "S'il frappe : partez tôt et éloignez-vous de la fumée, jamais vers elle, et suivez les routes d'évacuation officielles !" },
      { id: "flood", flip: false,
        title: "L'eau monte rapidement.",
        body: "ProtectionIV sait de quel côté le terrain s'élève réellement depuis l'endroit où vous vous tenez, trouve des étages ou des terrains plus élevés, et vous tient à l'écart des routes inondées et des passages de cours d'eau.",
        action: "Si elle frappe : gagnez les hauteurs et ne marchez ni ne conduisez jamais dans une eau en mouvement — quinze centimètres suffisent à vous emporter !" },
      { id: "earthquake", flip: true,
        title: "Les secousses ne s'arrêtent pas.",
        body: "Baissez-vous, couvrez-vous, agrippez-vous. Et ensuite ? Il confirme le séisme auprès de l'USGS, vérifie les consignes sur les répliques et trouve un terrain dégagé, loin des bâtiments et des lignes électriques, dès qu'il est sûr de bouger.",
        action: "S'il frappe : baissez-vous, couvrez-vous et agrippez-vous, puis, une fois les secousses arrêtées, gagnez un espace dégagé loin des bâtiments, des lignes électriques et des débris possibles !" },
    ],
    dataTitle: "Chaque plan repose sur des données réelles et des consignes officielles.",
    dataIntro:
      "ProtectionIV n'improvise jamais. Dès qu'une alerte se déclenche, il lit des flux en direct à " +
      "vos coordonnées exactes et fonde chaque instruction critique sur les agences qui écrivent les " +
      "règles. Voici exactement ce qu'il consulte, et le rôle de chaque source.",
    block1: "Données en direct utilisées",
    block2: "Référence des consignes officielles",
    liveData: [
      ["NWS (National Weather Service)", "Veilles et avertissements officiels américains pour inondations, tornades et intempéries, récupérés avec leur polygone exact de zone avertie pour que ProtectionIV sache si vous vous trouvez réellement à l'intérieur de la zone d'alerte, et pas seulement à proximité."],
      ["Environnement et Changement climatique Canada", "L'équivalent canadien, fournissant des avertissements météo régionaux en direct pour les utilisateurs au nord de la frontière, normalisés dans la même forme d'alerte pour que le reste du moteur les traite à l'identique."],
      ["Flux sismique de l'USGS", "Détections sismiques mondiales en temps réel (magnitude, épicentre, profondeur et heure), utilisées pour confirmer qu'un séisme s'est réellement produit près de vous et fonder le plan sur sa taille et sa distance réelles."],
      ["NASA FIRMS", "Détections thermiques satellites des incendies actifs, actualisées au fil de la journée, pour que le plan réagisse à l'endroit où les flammes brûlent maintenant, et non là où un feu a été signalé il y a des heures."],
      ["Open-Meteo Altitude", "Échantillonne le terrain dans huit directions et trois anneaux autour de vos coordonnées exactes pour calculer de quel côté le sol s'élève vraiment — le vecteur de hauteur qui guide le routage en cas d'inondation."],
      ["Open-Meteo Vent", "Vitesse actuelle du vent et direction vers laquelle le feu est poussé, pour qu'un itinéraire d'incendie vous éloigne du front et jamais sur le trajet de la fumée."],
      ["Overpass / OpenStreetMap", "Requêtes en direct sur les vraies structures près de vous (hôpitaux, casernes, écoles, centres communautaires), pharmacies et supermarchés pour les provisions, et terrains réellement dégagés comme points de rassemblement en cas de séisme."],
      ["Routage OSRM", "Trace votre itinéraire de fuite le long du vrai réseau routier plutôt qu'en ligne droite, avec un repli en ligne droite tracé si le service de routage est injoignable."],
      ["Google News", "Pendant une alerte en direct, il récupère les titres d'actualité locaux récents pour que le plan puisse mentionner de vraies fermetures de routes, des secours et des refuges ouverts dans votre secteur."],
      ["Nominatim", "Convertit vos coordonnées en un nom de lieu lisible et sélectionne le bon numéro d'urgence local à afficher tout au long du plan."],
    ],
    guidance: [
      ["Ready.gov", "Consignes nationales de préparation du Department of Homeland Security pour chacun des quatre dangers."],
      ["FEMA", "Consignes fédérales sur le risque d'inondation et la gestion des urgences, dont les conseils d'évacuation et de retour."],
      ["Sécurité du National Weather Service", "Pages de sécurité spécifiques aux inondations, tornades et incendies, utilisées pour les formulations qui doivent être exactes."],
      ["Préparation aux séismes de l'USGS", "La séquence officielle « Baissez-vous, Couvrez-vous, Agrippez-vous » et les consignes sur les répliques, les mythes démentis (les embrasures de porte) étant explicitement exclus."],
      ["CAL FIRE", "Spécificités de protection et d'évacuation en cas d'incendie, dont la conduite à tenir si vous êtes piégé dans un véhicule."],
      ["NOAA Storm Prediction Center", "La FAQ sécurité tornades, expliquant notamment pourquoi un viaduc d'autoroute est l'un des pires endroits où s'abriter."],
      ["Croix-Rouge américaine", "Consignes d'hébergement, de provisions et de rétablissement pour la phase « après » de chaque plan."],
      ["Earthquake Country Alliance", "Les Sept étapes vers la sécurité sismique qui structurent le plan en cas de séisme."],
    ],
    ctaTitle: "Sachez quoi faire avant d'en avoir besoin.",
    ctaSub: "Transformez une alerte stressante en un plan gérable.",
    foot: "ProtectionIV est un moteur de décision pour le moment où une alerte se déclenche. Ceci démontre le moteur, déclenché par une alerte que vous fournissez ou simulez.",
  },
};

export default function Landing({ onLaunch, language = "en", onLanguage }) {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  // Re-run the reveal observer when language changes, since the DOM text nodes
  // (and their heights) change.
  useScrollReveal(rootRef, language);
  const c = CONTENT[language] || CONTENT.en;

  // React doesn't reliably apply the `muted` attribute to <video>, so the hero clip
  // can play its audio track. Force it silent imperatively (muted + zero volume).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
  }, []);

  return (
    <div className="lp-root" ref={rootRef} lang={language}>

      {/* ── Top bar - language + Launch always present ── */}
      <header className="lp-nav">
        <span className="lp-nav-mark">
          <img
            className="lp-nav-logo"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width="28"
            height="28"
          />
          ProtectionIV
        </span>
        <div className="lp-nav-right">
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
          <button className="lp-nav-cta" onClick={() => onLaunch()}>{c.navCta}</button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <video
          ref={videoRef}
          className="lp-hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster={`${import.meta.env.BASE_URL}landing/hero.jpg`}
        >
          <source src={`${import.meta.env.BASE_URL}hero.mp4`} type="video/mp4" />
        </video>
        <div className="lp-hero-bg" />
        <div className="lp-hero-veil" />
        <div className="lp-hero-inner">
          <h1 className="lp-hero-title" data-reveal>ProtectionIV</h1>
          <p className="lp-hero-sub" data-reveal>{c.heroSub}</p>
          <div className="lp-hero-actions" data-reveal>
            <button className="lp-btn lp-btn--solid" onClick={() => onLaunch()}>{c.launch}</button>
            <a className="lp-btn lp-btn--ghost" href="#overview">{c.seeHow}</a>
          </div>
        </div>
        <div className="lp-scrollcue" aria-hidden="true"><span /></div>
      </section>

      {/* ── Overview ── */}
      <section className="lp-overview" id="overview">
        <div className="lp-overview-inner">
          <h2 className="lp-overview-title" data-reveal>{c.overviewTitle}</h2>
          <p className="lp-overview-body" data-reveal>{c.overviewBody}</p>

          <div className="lp-overview-links" data-reveal>
            <button className="lp-doclink" onClick={() => onLaunch("instructions")}>
              <span className="lp-doclink-body">
                <span className="lp-doclink-title">{c.howTitle}</span>
                <span className="lp-doclink-sub">{c.howSub}</span>
              </span>
              <Icon name="arrow" size={16} />
            </button>
            <button className="lp-doclink" onClick={() => onLaunch("tech")}>
              <span className="lp-doclink-body">
                <span className="lp-doclink-title">{c.techTitle}</span>
                <span className="lp-doclink-sub">{c.techSub}</span>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Hazards, one by one ── */}
      {c.hazards.map(({ id, title, body, action, flip }) => {
        const Scene = SCENES[id];
        return (
          <section className={`lp-hazard lp-hazard--${id} ${flip ? "lp-hazard--flip" : ""}`} key={id} data-reveal>
            <div className="lp-hazard-inner">
              <Scene />
              <div className="lp-hazard-text">
                <h3 className="lp-hazard-title">{title}</h3>
                <p className="lp-hazard-body">{body}</p>
                <p className="lp-hazard-body lp-hazard-do">{action}</p>
              </div>
            </div>
          </section>
        );
      })}

      {/* ── Why it's strong: live data + official guidance ── */}
      <section className="lp-data">
        <div className="lp-data-inner">
          <h2 className="lp-data-title" data-reveal>{c.dataTitle}</h2>
          <p className="lp-data-intro" data-reveal>{c.dataIntro}</p>

          <div className="lp-data-block" data-reveal>
            <div className="lp-data-block-head">
              <span className="lp-data-num">01</span>
              <h3>{c.block1}</h3>
            </div>
            <div className="lp-data-list">
              {c.liveData.map(([name, desc]) => (
                <div className="lp-data-item" key={name}>
                  <div className="lp-data-name">{name}</div>
                  <div className="lp-data-desc">{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-data-block" data-reveal>
            <div className="lp-data-block-head">
              <span className="lp-data-num">02</span>
              <h3>{c.block2}</h3>
            </div>
            <div className="lp-data-list">
              {c.guidance.map(([name, desc]) => (
                <div className="lp-data-item" key={name}>
                  <div className="lp-data-name">{name}</div>
                  <div className="lp-data-desc">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta-inner" data-reveal>
          <h2 className="lp-cta-title">{c.ctaTitle}</h2>
          <p className="lp-cta-sub">{c.ctaSub}</p>
          <button className="lp-btn lp-btn--solid lp-btn--lg" onClick={() => onLaunch()}>{c.launch}</button>
        </div>
        <footer className="lp-foot">{c.foot}</footer>
      </section>
    </div>
  );
}
