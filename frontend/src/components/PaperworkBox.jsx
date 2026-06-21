// Optional, standalone "add an insurance / aid letter" box for the recovery page.
// Covers a private insurance letter, a US FEMA decision, or a Canadian provincial
// disaster-assistance letter. Collapsed by default (it's optional); when expanded,
// paste a redacted excerpt and the structured analysis renders inline below.
//
//   onAnalyze({documentText, documentImages, insurerName, claimStatus}) ->
//      { ok:true, analysis } | { ok:false, error:"sensitive_data", message, findings }

import { useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { makeT } from "../i18n.js";
import { filesToImages, isSupportedDoc } from "../lib/docfiles.js";
import PaperworkResult from "./PaperworkResult.jsx";

const CLAIM = [
  { key: "", en: "Claim / file status —", fr: "État du dossier —" },
  { key: "not started", en: "Not started", fr: "Pas commencé" },
  { key: "started", en: "Started", fr: "Commencé" },
  { key: "submitted", en: "Submitted", fr: "Soumis" },
  { key: "denied", en: "Denied", fr: "Refusé" },
  { key: "approved", en: "Approved", fr: "Approuvé" },
];

export default function PaperworkBox({ onAnalyze, disabled, lang = "en" }) {
  const t = makeT(lang);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState("");
  const [docImages, setDocImages] = useState([]); // photos/PDF pages of the letter (data URLs)
  const [insurer, setInsurer] = useState("");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [redactions, setRedactions] = useState([]);
  const docFileRef = useRef(null);

  async function readDocFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.some((f) => !isSupportedDoc(f))) {
      setError(t("pwBoxTypeErr"));
      return;
    }
    setError("");
    try {
      const imgs = await filesToImages(list, 10);
      setDocImages((prev) => [...prev, ...imgs].slice(0, 10));
    } catch {
      setError(t("pwBoxReadErr"));
    }
  }

  async function run() {
    const text = doc.trim();
    if ((!text && !docImages.length) || busy) return;
    setBusy(true); setError(""); setRedactions([]); setResult(null);
    try {
      const res = await onAnalyze({ documentText: text, documentImages: docImages, insurerName: insurer.trim(), claimStatus: claim });
      if (res?.ok) {
        setResult(res.analysis);
        setRedactions(res.redactions || []);
      } else {
        setError(res?.message || t("qaError"));
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pw-box rise">
      <button className="pw-box-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="pw-box-icon"><Icon name="doc" size={20} /></span>
        <span className="pw-box-text">
          <span className="pw-box-title">{t("pwBoxTitle")}</span>
          <span className="pw-box-sub">{t("pwBoxSub")}</span>
        </span>
        <span className="pw-box-chevron"><Icon name={open ? "back" : "arrow"} size={15} /></span>
      </button>

      {open && (
        <div className="pw-box-body">
          <p className="qa-pw-hint">{t("pwPasteHint")}</p>
          <div className="doc-input-wrap">
            <textarea
              className="concerns-input pw-doc"
              rows={6}
              placeholder={t("pwBoxPastePh")}
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              disabled={disabled}
            />
            <button
              type="button"
              className="doc-upload-btn"
              onClick={() => docFileRef.current?.click()}
              title={t("pwBoxUpload")}
              aria-label={t("pwBoxUpload")}
              disabled={disabled}
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
              <span className="doc-attached-label">{t("pwBoxChosen")(docImages.length)}</span>
              <button className="ghost change-img" onClick={() => setDocImages([])}>{t("pwBoxClear")}</button>
            </div>
          )}
          <div className="pw-row">
            <input className="text-input" placeholder={t("pwInsurerPh")} value={insurer} onChange={(e) => setInsurer(e.target.value)} />
            <select className="text-input" value={claim} onChange={(e) => setClaim(e.target.value)}>
              {CLAIM.map((c) => <option key={c.key} value={c.key}>{lang === "fr" ? c.fr : c.en}</option>)}
            </select>
          </div>
          <button className="primary" onClick={run} disabled={(!doc.trim() && !docImages.length) || busy || disabled}>
            {busy ? <><Icon name="spinner" className="spinner-sm" size={14} /> {t("pwAnalyzing")}</> : <>{t("pwAnalyze")} <Icon name="arrow" size={14} /></>}
          </button>

          {error && <div className="pw-error"><p className="error">{error}</p></div>}

          {result && (
            <>
              {redactions.length > 0 && (
                <p className="pw-redacted">{t("redactedPrefix")} {redactions.join(", ")}.</p>
              )}
              <PaperworkResult result={result} language={lang} />
              <button className="ghost" onClick={() => { setResult(null); setDoc(""); setDocImages([]); }}>
                <Icon name="back" size={15} /> {t("pwBoxAgain")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
