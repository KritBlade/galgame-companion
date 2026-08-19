// galgame-companion · genre/genre-profile-core — pick the profile for the loaded engine. v0.1
//
// WHY THIS DIRECTORY EXISTS. This companion is a BLIND ADAPTER: it adapts interface SHAPES and must
// never learn one game's vocabulary (see SCRIPT_NAME in env.js for the same argument applied to the
// script's own name). Two things had broken that rule by 2026-08-19 — both real, both invisible to a
// grep for "School" because the coupling was in a PATH STRING rather than a name:
//
//   1. the Next-Block control hard-coded `PendingState.BlockDone`, a time-block model only School has
//   2. the location/time pills hard-coded `World.WallDate`/`WallTime`, fields School invented
//
// Neither was wrong for School. Both were wrong HERE, because a game without time blocks got a button
// that writes a path it does not own, and a game without a wall clock had this module reaching for
// fields it should never have heard of. So the genre-specific facts move into `genre/<name>/`, one
// small profile per genre, and everything outside this directory reads the profile instead.
//
// DEFAULT IS `main`. RPG, Love and every other genre are expected to share it: they publish a plain
// World clock and have no manual block advance. School is the exception, not the template — so an
// unknown engine, an engine that never loaded, and a card with no engine at all ALL resolve to `main`
// rather than to nothing. A missing profile must degrade to the ordinary case, never to a broken one.
//
// PURE — no host imports, so the resolution rule is testable. genre/index.js does the lookup with the
// live engine name from mvu-helper's engineInfo().

/**
 * A genre profile.
 *
 * @typedef {object} GenreProfile
 * @property {string} name          the profile's own id (lowercase), for logging
 * @property {string[]} clockDate    World field names to try for the display DATE, in order
 * @property {string[]} clockWeekday  ditto, weekday
 * @property {string[]} clockTime     ditto, time
 * @property {?{bindPath: string, label: string, title: string}} advanceControl
 *        the game's MANUAL time-advance flag, or null when the genre has no such concept. `bindPath`
 *        is the stat_data path the game's own stat-menu checkbox binds; this companion drives THAT
 *        checkbox rather than writing state itself, so the path is the whole contract. `label`/`title`
 *        are the chip's UI text — a genre that advances something other than a time block should not
 *        inherit School's wording, so the words live with the path that gives them meaning.
 */

// The ordinary game. A plain World clock, no manual advance.
export const MAIN = Object.freeze({
  name: 'main',
  clockDate: Object.freeze(['Date']),
  clockWeekday: Object.freeze(['Weekday']),
  clockTime: Object.freeze(['Time']),
  advanceControl: null,
});

// School: a WALL CLOCK distinct from the cursor, plus a manual block advance.
//
// World.Date/Time in School are a CURSOR — where the story RESUMES — so after a reply that ended the
// day they read tomorrow morning rather than the scene just shown. School publishes World.Wall* for
// display and the pills must prefer it. The plain fields stay as the SECOND candidate so a save
// written before the wall clock existed still renders (its first resolve fills them in).
export const SCHOOL = Object.freeze({
  name: 'school',
  clockDate: Object.freeze(['WallDate', 'Date']),
  clockWeekday: Object.freeze(['WallWeekday', 'Weekday']),
  clockTime: Object.freeze(['WallTime', 'Time']),
  advanceControl: Object.freeze({
    bindPath: 'PendingState.BlockDone',
    label: 'Next',
    title: 'Advance one time block — uncheck to cancel (until you send a message)',
  }),
});

// The registry. STATIC on purpose: the bundle is one esbuild IIFE with a single entry, so a dynamic
// import by computed path would silently bundle nothing. Adding a genre means adding a line here.
const PROFILES = Object.freeze({ main: MAIN, school: SCHOOL });

/**
 * The profile for an engine name. Case-insensitive (engineInfo() reports School's as "School" while
 * the folder and id are lowercase), and MAIN for anything unrecognised — including null/absent, which
 * is the ordinary state on a card with no engine.
 * @param {?string} engineName engineInfo().name, or null
 * @returns {GenreProfile}
 */
export function profileFor(engineName) {
  const key = String(engineName == null ? '' : engineName).trim().toLowerCase();
  return PROFILES[key] || MAIN;
}

/** Every registered genre id — for logging and tests, so a new profile cannot be added unnoticed. */
export function genreIds() {
  return Object.keys(PROFILES);
}
