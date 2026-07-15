// galgame-companion · env — shared constants + parent-document access + logging. v0.1
// The companion runs in its OWN Tavern-Helper iframe (same TH runtime as galgame; NOT an ST
// extension). galgame renders its GUI into the PARENT SillyTavern document — same origin,
// so we reach it via window.parent.document (GCP §1).

export const SCRIPT_NAME = 'School-Companion';
export const VERSION = '0.5';

// Parent ST document (galgame's overlay lives here). Fallback to own document only if the
// iframe boundary is somehow absent (e.g. pasted into the console for a quick test).
export const DOC =
  (typeof window !== 'undefined' && window.parent && window.parent.document) || document;

export const topWindow =
  (typeof window !== 'undefined' && window.parent) || window;

// ── logging ──────────────────────────────────────────────────────────────────
// Standalone TH script → no core/log.js here. warn/error always print; info gated
// by DEBUG so normal play stays quiet. NEVER swallow a caught error silently —
// route it through log.warn/log.error with context (project rule).
export const DEBUG = true; // flip false for release packaging (G5)

export const log = {
  info: (...a) => { if (DEBUG) console.log(`[${SCRIPT_NAME}]`, ...a); },
  warn: (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a),
  error: (...a) => console.error(`[${SCRIPT_NAME}]`, ...a),
};
