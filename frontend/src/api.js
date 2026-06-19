// Thin fetch wrappers around the Crisis-to-Action API.
// In dev, paths are same-origin (Vite proxies /api -> backend). In production the
// backend lives on a different host, set at build time via VITE_API_BASE
// (e.g. https://tabhuang2.pythonanywhere.com). Empty base => same-origin.

import { emitLog } from "./logBus.js";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const url = (path) => `${API_BASE}${path}`;

async function post(path, body) {
  const start = performance.now();
  emitLog({ type: "raw-req", label: `→ POST ${path}`, detail: body });

  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const ms = Math.round(performance.now() - start);

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    emitLog({ type: "raw-err", label: `← ${res.status} ERROR ${path} (${ms}ms)`, detail });
    throw new Error(`${path} failed: ${res.status} - ${JSON.stringify(detail)}`);
  }

  const data = await res.json();
  emitLog({ type: "raw-res", label: `← ${res.status} OK ${path} (${ms}ms)`, detail: data });
  return data;
}

export const getHealth = () => fetch(url("/api/health")).then((r) => r.json());
export const findLiveDisaster = () => fetch(url("/api/demo/live")).then((r) => r.json());
export const findLiveDisasters = () => fetch(url("/api/demo/live/list")).then((r) => r.json());
export const resolveLivePlace = (payload) => post("/api/demo/live/place", payload);
export const getAlert = (payload) => post("/api/alert", payload);
export const getAlertStatus = (payload) => post("/api/alert/status", payload);
export const analyzeScreenshot = (payload) => post("/api/analyze_screenshot", payload);
export const runModule = (payload) => post("/api/module", payload);
export const getRecommendation = (payload) => post("/api/recommend", payload);
export const followUp = (payload) => post("/api/follow-up", payload);
export const getCleanupPlan = (payload) => post("/api/recover/cleanup", payload);
export const recoveryFollowUp = (payload) => post("/api/recover/followup", payload);
export const analyzePaperwork = (payload) => post("/api/recover/paperwork", payload);
