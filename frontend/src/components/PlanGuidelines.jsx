// Calm "how to use this plan" reminders. The AI plan is guidance, not gospel —
// these tell the user to trust their own judgment, defer to officials and 911,
// and adjust the plan when it doesn't match what they're seeing.
//
// "full"    → collapsible 6-point card, shown under the plan summary (collapsed).
// "compact" → two life-safety lines for the RUN tier, where space is tight.

import { useState } from "react";
import { makeT } from "../i18n.js";

export default function PlanGuidelines({ variant = "full", lang = "en" }) {
  const t = makeT(lang);
  const [open, setOpen] = useState(false);

  if (variant === "compact") {
    return (
      <ul className="plan-guidelines-compact">
        <li>{t("guidelineRunA")}</li>
        <li>{t("guidelineRunB")}</li>
      </ul>
    );
  }

  const points = [
    t("guideline1"),
    t("guideline2"),
    t("guideline3"),
    t("guideline4"),
    t("guideline5"),
    t("guideline6"),
  ];

  return (
    <div className="plan-guidelines">
      <button
        className="plan-guidelines-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? t("guidelinesHide") : t("guidelinesShow")}
      </button>
      {open && (
        <div className="plan-guidelines-body">
          <div className="plan-guidelines-title">{t("guidelinesTitle")}</div>
          <ul className="plan-guidelines-list">
            {points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
