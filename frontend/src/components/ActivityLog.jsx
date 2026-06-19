import { useEffect, useRef, useState } from "react";

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EntryRaw({ entry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = entry.detail != null;
  return (
    <div className={`alog-entry alog-${entry.type}`}>
      <div className="alog-row" onClick={() => hasDetail && setOpen((o) => !o)}>
        <span className="alog-time">{fmtTime(entry.ts)}</span>
        <span className="alog-label">{entry.label}</span>
        {hasDetail && <span className="alog-chevron">{open ? "▲" : "▼"}</span>}
      </div>
      {open && hasDetail && (
        <pre className="alog-detail">
          {typeof entry.detail === "string"
            ? entry.detail
            : JSON.stringify(entry.detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EntryTidy({ entry }) {
  const status = entry.status || "done";
  const indicator = status === "error" ? "✕" : "✓";
  return (
    <div className={`alog-entry alog-tidy alog-tidy--${status}`}>
      <span className="alog-tidy-indicator" aria-hidden="true">{indicator}</span>
      <span className="alog-label">{entry.label}</span>
    </div>
  );
}

export default function ActivityLog({ entries }) {
  const [mode, setMode] = useState("tidy");
  const bottomRef = useRef(null);

  const displayed =
    mode === "tidy" ? entries.filter((e) => e.type === "tidy") : entries;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayed.length]);

  return (
    <div className="activity-log">
      <div className="alog-header">
        <span className="alog-title">Activity Log</span>
        <div className="alog-toggle">
          <button
            className={`alog-btn ${mode === "tidy" ? "alog-btn-on" : ""}`}
            onClick={() => setMode("tidy")}
          >
            Tidy
          </button>
          <button
            className={`alog-btn ${mode === "raw" ? "alog-btn-on" : ""}`}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
        </div>
      </div>
      <div className="alog-body">
        {displayed.length === 0 && (
          <div className="alog-empty">Waiting for activity…</div>
        )}
        {displayed.map((e) =>
          mode === "raw" ? (
            <EntryRaw key={e.id} entry={e} />
          ) : (
            <EntryTidy key={e.id} entry={e} />
          )
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
