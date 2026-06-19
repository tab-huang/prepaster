// Real flow - upload a screenshot of your alert and capture location, then analyze.

import { useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { filesToImages, isSupportedDoc } from "../lib/docfiles.js";

const STR = {
  en: {
    back: "Back",
    chip: "Disaster Response",
    title: "Upload your alert",
    sub: "A screenshot of the emergency alert on your phone. We'll read the hazard, severity, and timing from it.",
    resume: "Resume saved plan",
    lastPlan: "your last plan",
    savedAt: (when) => ` · saved ${when}`,
    worksOffline: " · works offline",
    dropEmpty: "Tap to choose an image, or drag one here",
    chooseDifferent: "Choose a different image",
    yourLocation: "Your location",
    change: "change",
    useMyLocation: "Use my location",
    manualPlaceholder: "or type: latitude, longitude",
    set: "Set",
    reading: "Reading your alert…",
    analyze: "Analyze alert",
    errImage: "Please choose an image or PDF file.",
    errGeoUnavail: "Geolocation unavailable. Enter coordinates below.",
    errGeoFail: "Couldn't get your location. Enter coordinates below.",
    errCoords: "Enter coordinates as: latitude, longitude",
    altScreenshot: "alert screenshot",
  },
  fr: {
    back: "Retour",
    chip: "Réponse à la catastrophe",
    title: "Téléversez votre alerte",
    sub: "Une capture d'écran de l'alerte d'urgence sur votre téléphone. Nous en lirons le danger, la gravité et le délai.",
    resume: "Reprendre le plan enregistré",
    lastPlan: "votre dernier plan",
    savedAt: (when) => ` · enregistré ${when}`,
    worksOffline: " · fonctionne hors ligne",
    dropEmpty: "Touchez pour choisir une image, ou glissez-en une ici",
    chooseDifferent: "Choisir une autre image",
    yourLocation: "Votre position",
    change: "changer",
    useMyLocation: "Utiliser ma position",
    manualPlaceholder: "ou tapez : latitude, longitude",
    set: "Définir",
    reading: "Lecture de votre alerte…",
    analyze: "Analyser l'alerte",
    errImage: "Veuillez choisir un fichier image ou PDF.",
    errGeoUnavail: "Géolocalisation indisponible. Saisissez les coordonnées ci-dessous.",
    errGeoFail: "Impossible d'obtenir votre position. Saisissez les coordonnées ci-dessous.",
    errCoords: "Saisissez les coordonnées comme : latitude, longitude",
    altScreenshot: "capture d'écran de l'alerte",
  },
};

export default function ScreenshotIntake({ onBack, onAnalyze, busy, error, savedPlan, onResume, language = "en" }) {
  const [image, setImage] = useState(null); // data URL
  const [coords, setCoords] = useState(null); // {lat, lon}
  const [manual, setManual] = useState("");
  const [locError, setLocError] = useState("");
  const fileRef = useRef(null);
  const s = STR[language] || STR.en;

  async function readFile(file) {
    if (!isSupportedDoc(file)) {
      setLocError(s.errImage);
      return;
    }
    setLocError("");
    try {
      const [img] = await filesToImages([file], 1);
      if (img) setImage(img);
      else setLocError(s.errImage);
    } catch {
      setLocError(s.errImage);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    readFile(e.dataTransfer.files?.[0]);
  }

  function grabLocation() {
    setLocError("");
    if (!navigator.geolocation) {
      setLocError(s.errGeoUnavail);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setLocError(s.errGeoFail),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function applyManual() {
    const m = manual.split(",").map((v) => parseFloat(v.trim()));
    if (m.length === 2 && Number.isFinite(m[0]) && Number.isFinite(m[1])) {
      setCoords({ lat: m[0], lon: m[1] });
      setLocError("");
    } else {
      setLocError(s.errCoords);
    }
  }

  const ready = image && coords;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="hazard-chip"><Icon name="upload" size={16} /> {s.chip}</span>
      </header>

      <div className="intake rise">
        <h2>{s.title}</h2>
        <p className="intake-sub">{s.sub}</p>

        {savedPlan && (
          <button className="resume-banner" onClick={onResume}>
            <span className="resume-banner-icon"><Icon name="check" size={18} /></span>
            <span className="resume-banner-text">
              <strong>{s.resume}</strong>
              <span className="resume-banner-sub">
                {savedPlan.rec?.headline_action || s.lastPlan}
                {savedPlan.savedAt ? s.savedAt(new Date(savedPlan.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })) : ""}
                {s.worksOffline}
              </span>
            </span>
            <Icon name="arrow" size={16} />
          </button>
        )}

        <div
          className={`dropzone ${image ? "has-image" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {image ? (
            <img src={image} alt={s.altScreenshot} className="preview" />
          ) : (
            <div className="dropzone-empty">
              <Icon name="image" size={28} />
              <span>{s.dropEmpty}</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => readFile(e.target.files?.[0])}
          />
        </div>
        {image && (
          <button className="ghost change-img" onClick={() => setImage(null)}>
            {s.chooseDifferent}
          </button>
        )}

        <div className="intake-loc">
          <div className="demo-label">{s.yourLocation}</div>
          {coords ? (
            <div className="loc-ok">
              <Icon name="pin" size={16} /> {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
              <button className="linklike" onClick={() => setCoords(null)}>{s.change}</button>
            </div>
          ) : (
            <>
              <button className="ghost" onClick={grabLocation}>
                <Icon name="pin" size={16} /> {s.useMyLocation}
              </button>
              <div className="manual-loc">
                <input
                  className="text-input"
                  placeholder={s.manualPlaceholder}
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
                <button className="ghost" onClick={applyManual}>{s.set}</button>
              </div>
            </>
          )}
          {locError && <p className="error">{locError}</p>}
        </div>

        <button
          className="primary"
          disabled={!ready || busy}
          onClick={() => onAnalyze(image, coords)}
        >
          {busy ? s.reading : s.analyze}
          {!busy && <Icon name="arrow" size={16} />}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
