// Stage 3 - 2-3 one-tap questions. No typing: a panicking person won't type.

import Icon from "./Icon.jsx";
import { makeT } from "../i18n.js";

function Choice({ active, onClick, children }) {
  return (
    <button className={`choice ${active ? "choice-on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function ResourceCheck({ resources, setResources, onContinue, lang = "en" }) {
  const t = makeT(lang);
  const set = (patch) => setResources({ ...resources, ...patch });

  return (
    <div className="resource-check rise">
      <h2>{t("quickCheck")}</h2>

      <div className="q">
        <span>{t("qVehicle")}</span>
        <div className="choices">
          <Choice active={resources.mobility === "vehicle"} onClick={() => set({ mobility: "vehicle", hasVehicle: true })}>
            {t("aHaveVehicle")}
          </Choice>
          <Choice active={resources.mobility === "foot"} onClick={() => set({ mobility: "foot", hasVehicle: false })}>
            {t("aOnFoot")}
          </Choice>
        </div>
      </div>

      <div className="q">
        <span>{t("qAtHome")}</span>
        <div className="choices">
          <Choice active={resources.atHome === true} onClick={() => set({ atHome: true })}>
            {t("aAtHome")}
          </Choice>
          <Choice active={resources.atHome === false} onClick={() => set({ atHome: false })}>
            {t("aElsewhere")}
          </Choice>
        </div>
      </div>

      <div className="q">
        <span>{t("qSlowMovers")}</span>
        <div className="choices">
          <Choice active={resources.hasSlowMovers === false} onClick={() => set({ hasSlowMovers: false })}>
            {t("aNo")}
          </Choice>
          <Choice active={resources.hasSlowMovers === true} onClick={() => set({ hasSlowMovers: true, dependents: true })}>
            {t("aSlowMovers")}
          </Choice>
        </div>
      </div>

      <div className="q">
        <span>{t("qSupplies")}</span>
        <div className="choices">
          <Choice active={resources.hasSupplies === true} onClick={() => set({ hasSupplies: true })}>
            {t("aYes")}
          </Choice>
          <Choice active={resources.hasSupplies === false} onClick={() => set({ hasSupplies: false })}>
            {t("aNo")}
          </Choice>
        </div>
      </div>

      <button className="primary continue" onClick={onContinue}>
        {t("showMe")} <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}
