// Optional, standalone "add an insurance / aid letter" box for the recovery page.
// Covers a private insurance letter, a US FEMA decision, or a Canadian provincial
// disaster-assistance letter. Collapsed by default (it's optional); when expanded,
// paste a redacted excerpt and the structured analysis renders inline below.
//
//   onAnalyze({documentText, insurerName, claimStatus}) ->
//      { ok:true, analysis } | { ok:false, error:"sensitive_data", message, findings }

import { useState } from "react";
import Icon from "./Icon.jsx";
import { makeT } from "../i18n.js";
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
  const [insurer, setInsurer] = useState("");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [redactions, setRedactions] = useState([]);

  async function run() {
    const text = doc.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setRedactions([]); setResult(null);
    try {
      const res = await onAnalyze({ documentText: text, insurerName: insurer.trim(), claimStatus: claim });
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
          <textarea
            className="concerns-input pw-doc"
            rows={6}
            placeholder={t("pwBoxPastePh")}
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            disabled={disabled}
          />
          <div className="pw-row">
            <input className="text-input" placeholder={t("pwInsurerPh")} value={insurer} onChange={(e) => setInsurer(e.target.value)} />
            <select className="text-input" value={claim} onChange={(e) => setClaim(e.target.value)}>
              {CLAIM.map((c) => <option key={c.key} value={c.key}>{lang === "fr" ? c.fr : c.en}</option>)}
            </select>
          </div>
          <button className="primary" onClick={run} disabled={!doc.trim() || busy || disabled}>
            {busy ? <><Icon name="spinner" className="spinner-sm" size={14} /> {t("pwAnalyzing")}</> : <>{t("pwAnalyze")} <Icon name="arrow" size={14} /></>}
          </button>

          {error && <div className="pw-error"><p className="error">{error}</p></div>}

          {result && (
            <>
              {redactions.length > 0 && (
                <p className="pw-redacted">{t("redactedPrefix")} {redactions.join(", ")}.</p>
              )}
              <PaperworkResult result={result} language={lang} />
              <button className="ghost" onClick={() => { setResult(null); setDoc(""); }}>
                <Icon name="back" size={15} /> {t("pwBoxAgain")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
