// Tiny pub/sub bus - api.js and App.jsx emit; ActivityLog subscribes.
// No React dependency so it works from outside component trees.

const listeners = new Set();
let counter = 0;

export function emitLog(entry) {
  const e = { id: ++counter, ts: new Date(), ...entry };
  listeners.forEach((fn) => fn(e));
}

export function subscribeLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
