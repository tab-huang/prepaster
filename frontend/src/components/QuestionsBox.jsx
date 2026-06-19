// "Ask anything" assistant. A chat-style Q&A box with a robot mark, tappable
// suggestion chips, and (on the Recover page) an optional insurance/paperwork
// capability: a chip opens an inline paste panel and the analysis renders as a
// structured bubble. Used on both Respond and Recover.
//
//   onAsk(text) -> Promise<answerString>     general questions (AI, situation-aware)
//   suggestions: [{ label, text }]           tappable FAQ chips -> onAsk
//   paperwork: { label, onAnalyze }          optional; enables the insurance capability
//              onAnalyze({documentText, insurerName, claimStatus}) ->
//                 { ok:true, analysis } | { ok:false, error:"sensitive_data", message, findings }

import { useState } from "react";
import Icon from "./Icon.jsx";
import MicButton from "./MicButton.jsx";
import { makeT } from "../i18n.js";
import PaperworkResult from "./PaperworkResult.jsx";

const CLAIM = [
  { key: "", en: "Claim status —", fr: "État —" },
  { key: "not started", en: "Not started", fr: "Pas commencée" },
  { key: "started", en: "Started", fr: "Commencée" },
  { key: "submitted", en: "Submitted", fr: "Soumise" },
  { key: "denied", en: "Denied", fr: "Refusée" },
  { key: "approved", en: "Approved", fr: "Approuvée" },
];

// Robot mark: drop a hand-drawn /robot.png in frontend/public to override the
// built-in fallback glyph; no rebuild or import needed.
function RobotMark() {
  const [err, setErr] = useState(false);
  if (!err) return <img src="/robot.png" alt="" className="qa-robot" onError={() => setErr(true)} />;
  return (
    <span className="qa-robot qa-robot--fallback" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" />
        <circle cx="9" cy="13" r="1.2" /><circle cx="15" cy="13" r="1.2" /><path d="M9.5 16.5h5" />
      </svg>
    </span>
  );
}

export default function QuestionsBox({ onAsk, suggestions = [], paperwork = null, disabled, lang = "en" }) {
  const t = makeT(lang);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  // Inline paperwork panel state.
  const [pwOpen, setPwOpen] = useState(false);
  const [pwDoc, setPwDoc] = useState("");
  const [pwInsurer, setPwInsurer] = useState("");
  const [pwClaim, setPwClaim] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function ask(q) {
    const question = (q || "").trim();
    if (!question || loading || disabled) return;
    setText("");
    setLoading(true);
    try {
      const answer = await onAsk(question);
      setHistory((h) => [...h, { type: "qa", q: question, a: answer }]);
    } catch {
      setHistory((h) => [...h, { type: "qa", q: question, a: t("qaError") }]);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeDoc() {
    const doc = pwDoc.trim();
    if (!doc || pwBusy || !paperwork?.onAnalyze) return;
    setPwBusy(true);
    try {
      const res = await paperwork.onAnalyze({
        documentText: doc,
        insurerName: pwInsurer.trim(),
        claimStatus: pwClaim,
      });
      if (res?.ok) {
        setHistory((h) => [...h, { type: "paperwork", result: res.analysis }]);
        setPwDoc(""); setPwInsurer(""); setPwClaim(""); setPwOpen(false);
      } else if (res?.error === "sensitive_data") {
        setHistory((h) => [...h, { type: "pw-error", message: res.message, findings: res.findings || [] }]);
      } else {
        setHistory((h) => [...h, { type: "pw-error", message: res?.message || t("qaError"), findings: [] }]);
      }
    } catch (e) {
      setHistory((h) => [...h, { type: "pw-error", message: String(e.message || e), findings: [] }]);
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="questions-box rise">
      <div className="concerns-label qa-title">
        <RobotMark /> {t("askAnything")}
      </div>

      {history.length > 0 && (
        <div className="qa-history">
          {history.map((item, i) => {
            if (item.type === "paperwork") {
              return (
                <div key={i} className="qa-item">
                  <div className="qa-question">{t("pwUploaded")}</div>
                  <div className="qa-answer qa-answer--rich"><PaperworkResult result={item.result} language={lang} /></div>
                </div>
              );
            }
            if (item.type === "pw-error") {
              return (
                <div key={i} className="qa-item">
                  <div className="qa-question">{t("pwUploaded")}</div>
                  <div className="qa-answer pw-error">
                    <p className="error">{item.message}</p>
                    {item.findings?.length > 0 && (
                      <ul className="pw-findings">{item.findings.map((f, j) => <li key={j}>{f}</li>)}</ul>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="qa-item">
                <div className="qa-question">{item.q}</div>
                <div className="qa-answer">{item.a}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Suggestion chips — tappable FAQ + the insurance capability. */}
      {(suggestions.length > 0 || paperwork) && (
        <div className="qa-suggest">
          {suggestions.map((sug, i) => (
            <button key={i} className="qa-chip" onClick={() => ask(sug.text)} disabled={loading || disabled}>
              {sug.label}
            </button>
          ))}
          {paperwork && (
            <button
              className={`qa-chip qa-chip--tool${pwOpen ? " qa-chip--on" : ""}`}
              onClick={() => setPwOpen((v) => !v)}
              disabled={disabled}
            >
              <Icon name="doc" size={13} /> {paperwork.label || t("pwChip")}
            </button>
          )}
        </div>
      )}

      {/* Inline paperwork paste panel. */}
      {paperwork && pwOpen && (
        <div className="qa-pw-panel">
          <p className="qa-pw-hint">{t("pwPasteHint")}</p>
          <textarea
            className="concerns-input pw-doc"
            rows={6}
            placeholder={t("pwPastePh")}
            value={pwDoc}
            onChange={(e) => setPwDoc(e.target.value)}
          />
          <div className="pw-row">
            <input className="text-input" placeholder={t("pwInsurerPh")} value={pwInsurer} onChange={(e) => setPwInsurer(e.target.value)} />
            <select className="text-input" value={pwClaim} onChange={(e) => setPwClaim(e.target.value)}>
              {CLAIM.map((c) => <option key={c.key} value={c.key}>{lang === "fr" ? c.fr : c.en}</option>)}
            </select>
          </div>
          <button className="primary" onClick={analyzeDoc} disabled={!pwDoc.trim() || pwBusy}>
            {pwBusy ? <><Icon name="spinner" className="spinner-sm" size={14} /> {t("pwAnalyzing")}</> : <>{t("pwAnalyze")} <Icon name="arrow" size={14} /></>}
          </button>
        </div>
      )}

      {loading && (
        <div className="qa-loading">
          <Icon name="spinner" className="spinner-sm" size={14} /> {t("thinking")}
        </div>
      )}

      <div className="dictate-wrap">
        <textarea
          className="concerns-input"
          placeholder={t("questionPlaceholder")}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading || disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); }
          }}
        />
        <MicButton
          lang={lang}
          onText={setText}
          disabled={loading || disabled}
          idle={t("voiceIdle")}
          active={t("voiceActive")}
        />
      </div>
      <button
        className="primary concerns-submit"
        onClick={() => ask(text)}
        disabled={!text.trim() || loading || disabled}
      >
        {loading ? (
          <><Icon name="spinner" className="spinner-sm" size={14} /> {t("gettingAnswer")}</>
        ) : (
          <>{t("ask")} <Icon name="arrow" size={14} /></>
        )}
      </button>
    </div>
  );
}
