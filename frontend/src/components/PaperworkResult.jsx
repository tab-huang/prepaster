// Shared renderer for a recovery-paperwork analysis result. Used inside the
// Recovery assistant chat so an insurance/FEMA letter analysis shows its full
// structured output (computed deadline cards, contacts, who-must-confirm) as a
// chat bubble — not a flattened paragraph.

import Icon from "./Icon.jsx";

const STR = {
  en: {
    aiBadge: "AI-analyzed", mockBadge: "Rule-based",
    summary: "In plain language", deadlines: "Deadlines",
    computedDeadlines: "Key dates we worked out", daysLeft: "days left", daysPast: "days ago",
    urg: { urgent: "Urgent", upcoming: "Soon", later: "Later", passed: "Passed", unknown: "Date unclear" },
    required: "Proof / documents to gather", actions: "Action steps",
    contacts: "Contacts in the document", appeals: "Appeal / dispute steps",
    unclear: "Terms to ask about", missing: "Not found in the text",
    flags: "Who needs to confirm", review: "Always confirm with a human",
    followups: "Good questions to ask next", note: "About this tool",
  },
  fr: {
    aiBadge: "Analysé par IA", mockBadge: "Basé sur des règles",
    summary: "En langage clair", deadlines: "Délais",
    computedDeadlines: "Dates clés calculées", daysLeft: "jours restants", daysPast: "jours passés",
    urg: { urgent: "Urgent", upcoming: "Bientôt", later: "Plus tard", passed: "Échu", unknown: "Date incertaine" },
    required: "Preuves / documents à rassembler", actions: "Étapes à suivre",
    contacts: "Contacts dans le document", appeals: "Étapes d'appel / de contestation",
    unclear: "Termes à clarifier", missing: "Introuvable dans le texte",
    flags: "Qui doit confirmer", review: "Confirmez toujours avec une personne",
    followups: "Bonnes questions à poser ensuite", note: "À propos de cet outil",
  },
};

// The AI path sometimes returns list items as objects (e.g. a contact as
// {organization, phone, email}). Coerce anything non-string to readable text.
function asText(it) {
  if (it == null) return "";
  if (typeof it === "string") return it;
  if (typeof it === "number" || typeof it === "boolean") return String(it);
  if (typeof it === "object") return Object.values(it).filter((v) => v != null && v !== "").join(" · ");
  return String(it);
}

function DeadlineDetails({ details, s }) {
  if (!details || details.length === 0) return null;
  return (
    <div className="pw-section">
      <div className="pw-section-head"><Icon name="warning" size={15} /> {s.computedDeadlines}</div>
      <ul className="pw-deadlines">
        {details.map((d, i) => {
          const u = d.urgency || "unknown";
          const days = d.days_remaining;
          let when = "";
          if (typeof days === "number") when = days >= 0 ? `${days} ${s.daysLeft}` : `${Math.abs(days)} ${s.daysPast}`;
          return (
            <li key={i} className="pw-deadline">
              <div className="pw-deadline-top">
                <span className={`pw-urg pw-urg--${u}`}>{(s.urg && s.urg[u]) || u}</span>
                {d.normalized_deadline_date && <span className="pw-date">{d.normalized_deadline_date}</span>}
                {when && <span className="pw-days">· {when}</span>}
              </div>
              <div className="pw-deadline-action">{d.action_required}</div>
              <div className="pw-deadline-src">{d.original_sentence}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ icon, title, items }) {
  const rows = (items || []).map(asText).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="pw-section">
      <div className="pw-section-head"><Icon name={icon} size={15} /> {title}</div>
      <ul className="pw-list">{rows.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}

export default function PaperworkResult({ result, language = "en" }) {
  if (!result) return null;
  const s = STR[language] || STR.en;
  return (
    <div className="pw-result">
      <div className="pw-result-head">
        <span className={`pw-engine ${result.response_mode === "ai" ? "pw-engine--ai" : ""}`}>
          {result.response_mode === "ai" ? s.aiBadge : s.mockBadge}
        </span>
      </div>

      {(result.document_type || result.issuing_organization) && (
        <div className="pw-doctype">
          <strong>{result.document_type}</strong>
          {result.issuing_organization ? ` · ${result.issuing_organization}` : ""}
          {result.document_classification?.confidence_score != null && (
            <span className="pw-confidence"> ({Math.round(result.document_classification.confidence_score * 100)}%)</span>
          )}
        </div>
      )}

      {result.plain_language_summary && (
        <div className="pw-section">
          <div className="pw-section-head"><Icon name="info" size={15} /> {s.summary}</div>
          <p className="pw-summary">{result.plain_language_summary}</p>
        </div>
      )}

      {result.deadline_details?.length > 0
        ? <DeadlineDetails details={result.deadline_details} s={s} />
        : <Section icon="warning" title={s.deadlines} items={result.deadlines} />}
      <Section icon="list" title={s.required} items={result.required_documents} />
      <Section icon="check" title={s.actions} items={result.action_steps} />
      <Section icon="pin" title={s.contacts} items={result.contact_information} />
      <Section icon="upload" title={s.appeals} items={result.appeal_or_dispute_steps} />
      <Section icon="info" title={s.unclear} items={result.unclear_terms} />
      <Section icon="warning" title={s.missing} items={result.missing_information} />
      <Section icon="shelter" title={s.flags} items={result.human_review_flags} />
      <Section icon="shelter" title={s.review} items={result.human_review_required} />
      <Section icon="info" title={s.followups} items={result.follow_up_questions} />

      {result.responsible_ai_note && (
        <p className="pw-note"><strong>{s.note}:</strong> {result.responsible_ai_note}</p>
      )}
    </div>
  );
}
