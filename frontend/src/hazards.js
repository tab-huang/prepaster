// Hazard metadata shared across the UI. Demo coords mirror backend mock.py.
// `icon` is the key into the SVG set in components/Icon.jsx.

export const HAZARDS = {
  flood: { label: "Flood", labelFr: "Inondation", icon: "flood", pattern: "routing", coords: { lat: 40.015, lon: -105.2705 }, site: "Boulder, CO" },
  wildfire: { label: "Wildfire", labelFr: "Incendie", icon: "wildfire", pattern: "routing", coords: { lat: 38.44, lon: -122.71 }, site: "Santa Rosa, CA" },
  tornado: { label: "Tornado", labelFr: "Tornade", icon: "tornado", pattern: "shelter", coords: { lat: 35.4823, lon: -97.535 }, site: "Oklahoma City, OK" },
  earthquake: { label: "Earthquake", labelFr: "Séisme", icon: "earthquake", pattern: "shelter", coords: { lat: 37.7749, lon: -122.4194 }, site: "San Francisco, CA" },
};

// Localized hazard label. Accepts either the meta object or a hazard key.
export function hazardLabel(metaOrKey, lang = "en") {
  const meta = typeof metaOrKey === "string" ? HAZARDS[metaOrKey] : metaOrKey;
  if (!meta) return "";
  return lang === "fr" && meta.labelFr ? meta.labelFr : meta.label;
}

// Localized response-pattern label (for the demo hazard grid).
export const PATTERN_LABEL = {
  en: { routing: "routing", shelter: "shelter" },
  fr: { routing: "routage", shelter: "abri" },
};

// Localized time-tier badge label. RUN/ACT/PREPARE are the canonical codes; these are
// the human-facing words shown on the badge in the live flow.
export const TIER_LABEL = {
  en: { RUN: "RUN", ACT: "ACT", PREPARE: "PREPARE" },
  fr: { RUN: "IMMÉDIAT", ACT: "AGIR", PREPARE: "PRÉPARER" },
};
export function tierLabel(tier, lang = "en") {
  return (TIER_LABEL[lang] || TIER_LABEL.en)[tier] || tier;
}

// CAP / NWS controlled vocabularies. Live and demo alerts carry these exact strings;
// we map the known values to French and fall back to the original text otherwise (so
// an unmapped real-feed value is shown verbatim rather than dropped).
const SEVERITY_FR = { Extreme: "Extrême", Severe: "Grave", Moderate: "Modérée", Minor: "Mineure", Unknown: "Inconnue" };
const URGENCY_FR = { Immediate: "Immédiate", Expected: "Attendue", Future: "Future", Past: "Passée", Unknown: "Inconnue" };
const EVENT_FR = {
  "Flash Flood Warning": "Alerte de crue soudaine",
  "Flash Flood Watch": "Veille de crue soudaine",
  "Flood Warning": "Alerte d'inondation",
  "Flood Watch": "Veille d'inondation",
  "Fire Warning": "Alerte d'incendie",
  "Fire Weather Warning": "Alerte météo d'incendie",
  "Red Flag Warning": "Alerte de risque d'incendie (Red Flag)",
  "Tornado Warning": "Alerte de tornade",
  "Tornado Watch": "Veille de tornade",
  "Severe Thunderstorm Warning": "Alerte d'orage violent",
  "Severe Thunderstorm Watch": "Veille d'orage violent",
  "Earthquake": "Séisme",
  "Alert": "Alerte",
};

export function severityLabel(sev, lang = "en") {
  if (lang !== "fr" || !sev) return sev || "";
  return SEVERITY_FR[sev] || sev;
}
export function urgencyLabel(urg, lang = "en") {
  if (lang !== "fr" || !urg) return urg || "";
  return URGENCY_FR[urg] || urg;
}
export function alertEventLabel(event, lang = "en") {
  if (lang !== "fr" || !event) return event || "";
  return EVENT_FR[event] || event;
}

export const HAZARD_ORDER = ["flood", "wildfire", "tornado", "earthquake"];
export const TIERS = ["RUN", "ACT", "PREPARE"];
