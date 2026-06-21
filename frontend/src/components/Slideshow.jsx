// Step-by-step instruction slideshow. Slide 0 is the summary; slides 1+ are steps.
// Used for ACT / PREPARE tiers (RUN tier uses RunGuidance instead).

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import MicButton from "./MicButton.jsx";
import { makeT } from "../i18n.js";
import { speak, stopSpeaking, ttsSupported } from "../speech.js";
import PlanGuidelines from "./PlanGuidelines.jsx";

function ExpandedDetail({ items, t }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <div className="step-expand">
      <button className="step-expand-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? t("hideChecklist") : t("showChecklist")}
      </button>
      {open && (
        <ol className="step-expand-list">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      )}
    </div>
  );
}

// Collapsed-by-default "why this plan" — the model's own bullet-point reasoning
// for how it reached the plan. Short enough to skim; it's transparency, not advice.
function ReasoningSection({ why, t }) {
  const [open, setOpen] = useState(false);
  const points = Array.isArray(why) ? why.filter((p) => p && String(p).trim()) : [];
  if (points.length === 0) return null;
  return (
    <div className="slide-reasoning">
      <button
        className="slide-reasoning-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? t("hideReasoning") : t("showReasoning")}
      </button>
      {open && (
        <div className="slide-reasoning-body">
          <div className="slide-reasoning-title">{t("reasoningTitle")}</div>
          <ul className="slide-reasoning-list">
            {points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <p className="slide-reasoning-hint">{t("reasoningHint")}</p>
        </div>
      )}
    </div>
  );
}

export default function Slideshow({ rec, loading, updating, planUpdated, extraSteps, onRequestStep, stepLoading, onStartRecovery, lang = "en" }) {
  const t = makeT(lang);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const prevExtraLenRef = useRef(0);

  const steps = Array.isArray(rec?.steps) ? rec.steps : [];
  const allSteps = [...steps, ...(extraSteps || [])];
  const total = allSteps.length + 1;

  // Jump to newly added step when extraSteps grows.
  useEffect(() => {
    const len = (extraSteps || []).length;
    if (len > prevExtraLenRef.current) {
      prevExtraLenRef.current = len;
      setIdx(steps.length + len);
      setAddOpen(false);
      setAddText("");
    }
  }, [(extraSteps || []).length, steps.length]);

  // Stop any narration when the plan unmounts (e.g. navigating away). Declared
  // before the early returns below so the hook order is identical on every
  // render (loading → loaded). Moving it after a return breaks the Rules of
  // Hooks and crashes the whole screen when the plan arrives.
  useEffect(() => stopSpeaking, []);

  if (loading) {
    return (
      <div className="instruction instruction-loading rise">
        <Icon name="spinner" className="spinner" size={22} />
        <p>{t("buildingPlan")}</p>
      </div>
    );
  }
  if (!rec) return null;

  const summary = rec.summary || {};
  const onSummary = idx === 0;
  const step = onSummary ? null : allSteps[idx - 1];
  const atEnd = idx === total - 1 && !onSummary;

  const go = (n) => {
    stopSpeaking(); // don't let one slide's narration bleed into the next
    setIdx(Math.max(0, Math.min(total - 1, n)));
  };
  const toggleDone = (i) => setDone((d) => ({ ...d, [i]: !d[i] }));
  const confLevel = rec.confidence || "medium";

  const sayAloud = (parts) => speak(parts.filter(Boolean).join(". "), lang);

  function handleAddStep() {
    const msg = addText.trim();
    if (!msg || stepLoading) return;
    onRequestStep(msg);
  }

  return (
    <div className="slideshow rise">
      <div className="slide-progress">
        <div className="slide-dots">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              className={`dot ${i === idx ? "on" : ""} ${i > 0 && done[i - 1] ? "done" : ""}`}
              onClick={() => go(i)}
              aria-label={`slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="slide-meta">
          {(updating || planUpdated) && (
            <div className={`slide-plan-badge${planUpdated && !updating ? " slide-plan-badge--done" : ""}`}>
              {updating
                ? <><Icon name="spinner" className="spinner-sm" size={12} /> {t("updatingShort")}</>
                : <>&#10003; {t("planUpdatedBadge")}</>
              }
            </div>
          )}
        </div>
      </div>

      {onSummary ? (
        <div className="slide">
          {ttsSupported() && (
            <button
              className="slide-tts-btn"
              onClick={() => sayAloud([rec.headline_action, summary.time_estimate, ...(summary.what_to_do || [])])}
              aria-label={t("readSummaryAloud")}
              title={t("readSummaryAloud")}
            >
              <Icon name="volume" size={16} />
            </button>
          )}
          <div className="slide-kicker">{summary.tier_label || t("yourSituation")}</div>
          <div className="slide-headline">{rec.headline_action}</div>
          {summary.time_estimate && (
            <p className="slide-time">
              <Icon name="warning" size={15} /> {summary.time_estimate}
            </p>
          )}
          {rec.responsePattern === "routing" && rec.destination_name && (
            <p className="slide-dest">
              <b>{rec.direction}</b>
              {rec.distance ? ` · ${rec.distance}` : ""} · {rec.destination_name}
            </p>
          )}
          {Array.isArray(summary.what_to_do) && summary.what_to_do.length > 0 && (
            <>
              <div className="slide-subhead">{t("whatToDo")}</div>
              <ul className="what-list">
                {summary.what_to_do.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </>
          )}
          {rec.engine === "ai" && (
            <div className="slide-ai-footer">
              <span className="slide-ai-dot" />
              <span className="slide-ai-label">{t("aiGenerated")}</span>
              <span className="slide-ai-sources">Ready.gov · NWS · FEMA</span>
            </div>
          )}
          <ReasoningSection why={rec.why} t={t} />
          <PlanGuidelines variant="full" lang={lang} />
        </div>
      ) : (
        <div className="slide">
          {ttsSupported() && (
            <button
              className="slide-tts-btn"
              onClick={() => sayAloud([step.title, step.detail, ...(step.expanded_detail || [])])}
              aria-label={t("readAloud")}
              title={t("readAloud")}
            >
              <Icon name="volume" size={16} />
            </button>
          )}
          <div className="slide-kicker">
            {t("stepXofY", { idx, total: allSteps.length })}
            {idx > steps.length && <span className="slide-kicker-extra">{t("added")}</span>}
          </div>
          <div className="slide-step-title">
            {step.title}
            {step.time_estimate && (
              <span className="slide-step-time">{step.time_estimate}</span>
            )}
          </div>
          <p className="slide-step-detail">{step.detail}</p>
          <ExpandedDetail items={step.expanded_detail} t={t} />
          <button
            className={`step-done ${done[idx - 1] ? "is-done" : ""}`}
            onClick={() => toggleDone(idx - 1)}
          >
            <Icon name="check" size={16} /> {done[idx - 1] ? t("done") : t("markDone")}
          </button>
        </div>
      )}

      <div className="slide-nav">
        <button className="ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>
          <Icon name="back" size={16} /> {t("back")}
        </button>
        {idx < total - 1 ? (
          <button className="primary slide-next" onClick={() => go(idx + 1)}>
            {onSummary ? t("start") : t("nextStep")} <Icon name="arrow" size={16} />
          </button>
        ) : (
          <div className="slide-end-group">
            <span className="slide-end">{t("planEnd")}</span>
            {onRequestStep && !addOpen && (
              <button
                className="ghost slide-more-btn"
                onClick={() => setAddOpen(true)}
                disabled={stepLoading}
              >
                {t("needMore")}
              </button>
            )}
            {onStartRecovery && (
              <button className="slide-recovery-btn" onClick={onStartRecovery}>
                {t("startRecoveryHint")}
              </button>
            )}
          </div>
        )}
      </div>

      {atEnd && addOpen && (
        <div className="add-step-panel">
          <div className="dictate-wrap">
            <textarea
              className="concerns-input"
              placeholder={t("addStepPlaceholder")}
              rows={2}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              disabled={stepLoading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddStep(); }
              }}
            />
            <MicButton
              lang={lang}
              onText={setAddText}
              disabled={stepLoading}
              idle={t("voiceIdle")}
              active={t("voiceActive")}
            />
          </div>
          <div className="add-step-row">
            <button className="ghost" onClick={() => { setAddOpen(false); setAddText(""); }} disabled={stepLoading}>
              {t("cancel")}
            </button>
            <button
              className="primary concerns-submit"
              onClick={handleAddStep}
              disabled={!addText.trim() || stepLoading}
            >
              {stepLoading ? (
                <><Icon name="spinner" className="spinner-sm" size={14} /> {t("addingStep")}</>
              ) : (
                <>{t("addStep")} <Icon name="arrow" size={14} /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
