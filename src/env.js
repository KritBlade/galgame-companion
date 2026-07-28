// galgame-companion · env — shared constants + parent-document access + logging. v0.2
// The companion runs in its OWN Tavern-Helper iframe (same TH runtime as galgame; NOT an ST
// extension). galgame renders its GUI into the PARENT SillyTavern document — same origin,
// so we reach it via window.parent.document (GCP §1).

export const SCRIPT_NAME = 'School-Companion';
export const VERSION = '0.6.11';

// Parent ST document (galgame's overlay lives here). Fallback to own document only if the
// iframe boundary is somehow absent (e.g. pasted into the console for a quick test).
// The `typeof` guards cover BOTH names: a bare `document`/`window` in the fallback position is a
// ReferenceError, not a fallback, and it threw the moment a unit test imported anything that
// transitively reached this module. Callers already null-check DOC (image-regen's `!DOC || !DOC.body`).
export const DOC =
  (typeof window !== 'undefined' && window.parent && window.parent.document)
  || (typeof document !== 'undefined' ? document : null);

export const topWindow =
  (typeof window !== 'undefined' && (window.parent || window)) || globalThis;

// ── logging ──────────────────────────────────────────────────────────────────
// Standalone TH script → no core/log.js here (mvu-helper is a separate bundle in a separate runtime;
// we cannot import it). warn/error always print. NEVER swallow a caught error silently — route it
// through log.warn/log.error with context (project rule).

// ONE CHECKBOX FOR THE WHOLE IMAGE SEAM. The image pipeline spans both extensions — mvu-helper draws
// the image and splices it into the message, then THIS script names its scene and files it into
// galgame's backdrop DB. Debugging one half without the other is exactly the trap that made this worth
// wiring, so log.image() follows mvu-helper's own "Image gen" debug-domain checkbox (Main tab) rather
// than a second local flag the user would have to know about.
//
// Read INLINE off the parent ST context — the same idiom the card-carried EJS/RES code uses for the
// `pipeline` domain (globalLogic.cjs pipeDebugOn). Live-read on every call, so flipping the checkbox
// takes effect without a reload. mvu-helper absent / toggle off → silent, never throws.
const MVU_HELPER_EXT = 'mvu-helper';
function debugDomainOn(name) {
  try {
    const ST = topWindow.SillyTavern || null;
    const settings = ST && (ST.extensionSettings || (ST.getContext && ST.getContext().extensionSettings));
    return settings?.[MVU_HELPER_EXT]?.debug_domain?.[name] === true;
  } catch (e) {
    // EXPECTED: ST/mvu-helper context absent (companion running against a bare galgame) → debug off.
    return false;
  }
}

// Companion-only chatter (i18n, menus, galgame quirks, choices) — no mvu-helper counterpart to ride
// on, so it keeps a local flag. Doubles as a master "everything on" switch for a dev session.
// MUST be false in a tagged release (G5).
export const DEBUG = false;

export const log = {
  info: (...a) => { if (DEBUG) console.log(`[${SCRIPT_NAME}]`, ...a); },
  /** Image seam: beat-shaper scene naming + image-seam DB write/prune/sweep + viewer/regen.
   *  Gated by mvu-helper's "Image gen" domain checkbox, or by the local DEBUG master switch. */
  image: (...a) => { if (DEBUG || debugDomainOn('imagegen')) console.log(`[${SCRIPT_NAME}]`, ...a); },
  warn: (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a),
  error: (...a) => console.error(`[${SCRIPT_NAME}]`, ...a),
};
