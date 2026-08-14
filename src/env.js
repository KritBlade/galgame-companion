// galgame-companion · env — shared constants + parent-document access + logging. v0.2
// The companion runs in its OWN Tavern-Helper iframe (same TH runtime as galgame; NOT an ST
// extension). galgame renders its GUI into the PARENT SillyTavern document — same origin,
// so we reach it via window.parent.document (GCP §1).

// The companion's ONE name, and it is the repo's: package.json, the dist bundle and the import JSON
// all say `galgame-companion`. It read `School-Companion` until 2026-08-11, which was wrong twice
// over — a second term for one concept, and a genre in the name of the piece that is supposed to be
// blind to genre. This module adapts INTERFACE SHAPES; School is merely the first consumer that
// happens to use it, and a toast titled after one genre tells a player of the next one that some
// other product is warning them.
export const SCRIPT_NAME = 'galgame-companion';

// THE RELEASE NUMBER LIVES IN package.json, AND ONLY THERE. build.mjs reads it and rewrites this
// placeholder in the bundled output, exactly as it does for BUILD below.
//
// It used to be authored here while package.json carried its own copy, which nothing read — so the
// two drifted seven patch versions apart (0.6.12 vs 0.6.19) with no symptom, because the build was
// stamping this one and the stale one was never consulted. Syncing them by hand would have restored
// the same defect the moment someone bumped one and not the other: two places to edit is the bug,
// not the gap between them. Bump package.json; this follows automatically.
export const VERSION = '__VERSION__';

// WHICH BUILD IS ACTUALLY RUNNING — not which release. build.mjs rewrites this placeholder in the
// bundled output on EVERY build (see its stamp plugin). An unbuilt import (a unit test, a direct
// source read) sees the raw placeholder — deliberately un-prettified, so it is obvious the value is
// unstamped rather than a plausible-looking lie.
//
// WHY IT EXISTS (2026-08-02): the dev loop serves dist/ off a local static server, and two different
// builds of the SAME version are indistinguishable — a fix was in dist/ but there was no way to tell
// whether the tab had loaded it or a copy from before the rebuild. VERSION alone could not answer
// that; only a per-BUILD identity can. Shape: `<git-sha>[-dirty]`.
//
// The `@<ISO time>` half was REMOVED 2026-08-14: dist/ is committed, so a stamp that changes on every
// build made every rebuild look like a change and taught everyone to skim past the line — including
// the `-dirty` flag, which is the half worth reading. See build.mjs buildStamp() for the full
// argument. The stamp now moves only when the commit or the clean/dirty state does.
export const BUILD = '__BUILD_STAMP__';

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

/**
 * A visible warning for the PLAYER, not the console. Use ONLY where the player must act — a
 * console line is invisible to someone in galgame mode, so a silent failure there reads as
 * "nothing happened" when the truth is "your turn was lost".
 *
 * Never gated by DEBUG: the cases that reach here are exactly the ones a release build must still
 * surface. Degrades to a console warn when toastr is absent (never throws — this is itself the
 * error path).
 */
export function warnToast(message, title = SCRIPT_NAME, timeOut = 12000) {
  try {
    if (topWindow && topWindow.toastr && typeof topWindow.toastr.warning === 'function') {
      topWindow.toastr.warning(message, title, { timeOut, extendedTimeOut: 4000 });
      return;
    }
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] toastr unavailable — falling back to console:`, e);
  }
  console.warn(`[${SCRIPT_NAME}] ${message}`);
}
