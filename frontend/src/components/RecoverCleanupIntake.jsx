// Recover, Part A — intake for the clean-up / re-entry guide. The user already
// picked their hazard in the hub; here they tell us what was damaged, optionally
// describe what they're seeing, and optionally attach photos. We send it to
// /api/recover/cleanup, which returns a plan rendered by the shared Slideshow.

import { useRef, useState } from "react";
import { HAZARDS, hazardLabel } from "../hazards.js";
import Icon from "./Icon.jsx";
import { filesToImages, isSupportedDoc } from "../lib/docfiles.js";

const DAMAGE = [
  { key: "home", en: "Home / house", fr: "Maison" },
  { key: "apartment", en: "Apartment / rental", fr: "Appartement / location" },
  { key: "car", en: "Vehicle", fr: "Véhicule" },
  { key: "utilities", en: "Utilities (power/gas/water)", fr: "Services (élec./gaz/eau)" },
  { key: "belongings", en: "Personal belongings", fr: "Biens personnels" },
  { key: "documents", en: "Important documents", fr: "Documents importants" },
];

const STR = {
  en: {
    back: "Back",
    chip: "Clean-up guide",
    title: (h) => `Clean up after the ${h}`,
    sub: "Tell us what was hit and what you're seeing. We'll build a safe, step-by-step return-and-clean-up plan from official guidance.",
    damage: "What was damaged?",
    describe: "Describe what you're seeing (optional)",
    describePh: "e.g. \"Water came up about a foot, the basement is soaked and smells musty, power is still off.\"",
    photos: "Add photos of the damage (optional)",
    photosHint: "Helps tailor the plan. Tap to choose images or a PDF, or drag them here.",
    chosen: (n) => `${n} photo${n > 1 ? "s" : ""} added`,
    clear: "Clear photos",
    docs: "Add an insurance / FEMA / aid letter (optional)",
    docsPh: "Paste a redacted excerpt of your insurance letter, FEMA decision, or provincial disaster-assistance letter — or upload a photo or PDF of it →",
    docsHint: "We'll pull out its deadlines, required proof, and contacts and fold them into your plan. Sensitive data (SSNs, full policy/claim numbers, bank details) is automatically removed before analyzing.",
    docUpload: "Upload a photo or PDF of the letter",
    docChosen: (n) => `${n} page${n > 1 ? "s" : ""} of the letter attached`,
    docClear: "Remove letter pages",
    generate: "Build my clean-up plan",
    generating: "Building your plan…",
    errImage: "Please choose image or PDF files only.",
    errRead: "Couldn't read that file. Try a different image or PDF.",
  },
  fr: {
    back: "Retour",
    chip: "Guide de nettoyage",
    title: (h) => `Nettoyer après l'événement (${h})`,
    sub: "Dites-nous ce qui a été touché et ce que vous voyez. Nous bâtirons un plan de retour et de nettoyage sûr, étape par étape, à partir des consignes officielles.",
    damage: "Qu'est-ce qui a été endommagé ?",
    describe: "Décrivez ce que vous voyez (facultatif)",
    describePh: "ex. : « L'eau est montée d'environ 30 cm, le sous-sol est trempé et sent le moisi, le courant est encore coupé. »",
    photos: "Ajouter des photos des dommages (facultatif)",
    photosHint: "Aide à adapter le plan. Touchez pour choisir des images ou un PDF, ou glissez-les ici.",
    chosen: (n) => `${n} photo${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""}`,
    clear: "Effacer les photos",
    docs: "Ajouter une lettre d'assurance / FEMA / d'aide (facultatif)",
    docsPh: "Collez un extrait caviardé de votre lettre d'assurance, décision de la FEMA ou lettre d'aide provinciale — ou téléversez une photo ou un PDF →",
    docsHint: "Nous en extrairons les délais, les preuves requises et les contacts pour les intégrer à votre plan. Les données sensibles (NAS, numéros complets de police/réclamation, données bancaires) sont retirées automatiquement avant l'analyse.",
    docUpload: "Téléverser une photo ou un PDF de la lettre",
    docChosen: (n) => `${n} page${n > 1 ? "s" : ""} de la lettre jointe${n > 1 ? "s" : ""}`,
    docClear: "Retirer les pages de la lettre",
    generate: "Créer mon plan de nettoyage",
    generating: "Création de votre plan…",
    errImage: "Veuillez choisir uniquement des fichiers image ou PDF.",
    errRead: "Impossible de lire ce fichier. Essayez une autre image ou un autre PDF.",
  },
};

export default function RecoverCleanupIntake({ hazard, onBack, onGenerate, busy, error, language = "en", initialText = "" }) {
  const [damage, setDamage] = useState([]);
  const [text, setText] = useState(initialText);
  const [docText, setDocText] = useState("");
  const [docImages, setDocImages] = useState([]); // photos of the letter (data URLs)
  const [images, setImages] = useState([]); // data URLs
  const [locError, setLocError] = useState("");
  const fileRef = useRef(null);
  const docFileRef = useRef(null);
  const s = STR[language] || STR.en;
  const hLabel = hazardLabel(HAZARDS[hazard], language);

  function toggle(key) {
    setDamage((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
  }

  async function readFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.some((f) => !isSupportedDoc(f))) {
      setLocError(s.errImage);
      return;
    }
    setLocError("");
    try {
      const imgs = await filesToImages(list, 4);
      setImages((prev) => [...prev, ...imgs].slice(0, 4));
    } catch {
      setLocError(s.errRead);
    }
  }

  async function readDocFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.some((f) => !isSupportedDoc(f))) {
      setLocError(s.errImage);
      return;
    }
    setLocError("");
    try {
      const imgs = await filesToImages(list, 10);
      setDocImages((prev) => [...prev, ...imgs].slice(0, 10));
    } catch {
      setLocError(s.errRead);
    }
  }

  function submit() {
    const labels = damage.map((k) => DAMAGE.find((d) => d.key === k)?.en || k);
    onGenerate({
      damageCategories: labels,
      situationText: text.trim(),
      documentText: docText.trim(),
      documentImages: docImages,
      images,
    });
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="back" onClick={onBack}>
          <Icon name="back" size={16} /> {s.back}
        </button>
        <span className="hazard-chip">
          <Icon name={HAZARDS[hazard]?.icon || "home"} size={16} /> {s.chip}
        </span>
      </header>

      <div className="intake rise">
        <h2>{s.title(hLabel)}</h2>
        <p className="intake-sub">{s.sub}</p>

        <div className="rcv-label">{s.damage}</div>
        <div className="rcv-chips">
          {DAMAGE.map((d) => (
            <button
              key={d.key}
              className={`rcv-chip ${damage.includes(d.key) ? "on" : ""}`}
              onClick={() => toggle(d.key)}
            >
              {damage.includes(d.key) && <Icon name="check" size={13} />}
              {language === "fr" ? d.fr : d.en}
            </button>
          ))}
        </div>

        <div className="rcv-label">{s.describe}</div>
        <textarea
          className="concerns-input"
          rows={3}
          placeholder={s.describePh}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="rcv-label">{s.photos}</div>
        <div
          className={`dropzone ${images.length ? "has-image" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); readFiles(e.dataTransfer.files); }}
        >
          {images.length ? (
            <div className="rcv-thumbs">
              {images.map((src, i) => (
                <img key={i} src={src} alt="" className="rcv-thumb" />
              ))}
            </div>
          ) : (
            <div className="dropzone-empty">
              <Icon name="image" size={26} />
              <span>{s.photosHint}</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => readFiles(e.target.files)}
          />
        </div>
        {images.length > 0 && (
          <button className="ghost change-img" onClick={() => setImages([])}>{s.clear}</button>
        )}
        {locError && <p className="error">{locError}</p>}

        <div className="rcv-label">{s.docs}</div>
        <div className="doc-input-wrap">
          <textarea
            className="concerns-input pw-doc"
            rows={5}
            placeholder={s.docsPh}
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
          />
          <button
            type="button"
            className="doc-upload-btn"
            onClick={() => docFileRef.current?.click()}
            title={s.docUpload}
            aria-label={s.docUpload}
          >
            <Icon name="image" size={18} />
          </button>
          <input
            ref={docFileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => { readDocFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
        {docImages.length > 0 && (
          <div className="doc-attached">
            <div className="rcv-thumbs">
              {docImages.map((src, i) => <img key={i} src={src} alt="" className="rcv-thumb" />)}
            </div>
            <span className="doc-attached-label">{s.docChosen(docImages.length)}</span>
            <button className="ghost change-img" onClick={() => setDocImages([])}>{s.docClear}</button>
          </div>
        )}
        <p className="rcv-hint" style={{ textAlign: "left", marginTop: 0 }}>{s.docsHint}</p>

        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? s.generating : s.generate}
          {!busy && <Icon name="arrow" size={16} />}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
