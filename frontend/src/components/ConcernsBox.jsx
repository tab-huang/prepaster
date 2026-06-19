// Lets the user tell the AI what changed or what they'd rather do,
// then re-generates the plan with that context included.

import { useState } from "react";
import Icon from "./Icon.jsx";
import MicButton from "./MicButton.jsx";
import { makeT } from "../i18n.js";

export default function ConcernsBox({ onUpdate, loading, lang = "en" }) {
  const t = makeT(lang);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    const note = text.trim();
    if (!note) return;
    setSubmitted(true);
    onUpdate(note);
  }

  function handleChange(e) {
    setText(e.target.value);
    if (submitted) setSubmitted(false);
  }

  return (
    <div className="concerns-box rise">
      <div className="concerns-label">
        <Icon name="warning" size={14} />
        {t("somethingChanged")}
      </div>
      <div className="dictate-wrap">
        <textarea
          className="concerns-input"
          placeholder={t("concernPlaceholder")}
          rows={3}
          value={text}
          onChange={handleChange}
          disabled={loading}
        />
        <MicButton
          lang={lang}
          onText={(v) => { setText(v); if (submitted) setSubmitted(false); }}
          disabled={loading}
          idle={t("voiceIdle")}
          active={t("voiceActive")}
        />
      </div>
      <button
        className="primary concerns-submit"
        onClick={handleSubmit}
        disabled={!text.trim() || loading}
      >
        {loading ? (
          <><Icon name="spinner" className="spinner-sm" size={14} /> {t("updatingPlan")}</>
        ) : (
          <>{t("updateMyPlan")} <Icon name="arrow" size={14} /></>
        )}
      </button>
    </div>
  );
}
