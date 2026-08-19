// galgame-companion · genre — the live genre profile for whatever engine is loaded. v0.1
//
// The barrel every other feature imports (P6). It is the ONLY place that reaches the host for the
// engine's identity; the decision itself is pure and lives in genre-profile-core.js.
//
// mvu-helper publishes `globalThis.MvuHelper.engineInfo()` — {name, version, packId}, synchronous by
// design (GP3 / gamelogic-pack-plan §24). We read it through topWindow because this companion runs in
// its own Tavern-Helper iframe while mvu-helper is an extension on the parent page.

import { topWindow, log } from '../env.js';
import { profileFor, MAIN } from './genre-profile-core.js';

export { MAIN, SCHOOL, profileFor, genreIds } from './genre-profile-core.js';

// The engine name, or null when nothing answers. Every failure path reads the same to a caller —
// mvu-helper absent, engine not loaded, an older mvu-helper with no engineInfo — because they all
// mean the same thing here: we do not know the genre, so use the ordinary one.
function engineName() {
  try {
    const helper = topWindow.MvuHelper;
    if (!helper || typeof helper.engineInfo !== 'function') return null;
    const info = helper.engineInfo();
    return (info && info.name) || null;
  } catch (e) {
    // NOT swallowed (project rule): reaching the parent window can throw, and a silent catch here
    // would look exactly like "no engine" while actually being a broken bridge.
    log.warn('genre: reading MvuHelper.engineInfo() threw — falling back to the main profile:', e);
    return null;
  }
}

// Live-read per call, deliberately NOT cached: a pack can be installed or switched without reloading
// the companion, and a profile frozen at startup would keep a stale genre's paths for the session.
// The lookup is a lowercase map hit, so calling it per render costs nothing worth caching.
export function activeGenre() {
  return profileFor(engineName());
}

// One line at startup so the console says which profile the page resolves to — the fastest answer to
// "why is this control missing" / "why is the clock reading that field".
//
// ⚠ THIS IS A SNAPSHOT, NOT A VERDICT, and the line says so. The engine loads on chat load, well after
// boot, so at the moment this runs engineName() is normally still null and the answer is the default
// profile — for every game, School included. Reported as a settled fact it would send someone hunting
// a genre-resolution bug that does not exist (and it would hide the real one: a caller that LATCHES
// this answer instead of re-asking, which is exactly what broke next-block).
export function logActiveGenre() {
  const name = engineName();
  const profile = profileFor(name);
  if (!name) {
    log.info(`genre: no engine has answered yet → profile "${profile.name}" for now`
      + ' (re-resolved on every use, so an engine that loads later is picked up)');
    return;
  }
  log.info(`genre: engine "${name}" → profile "${profile.name}"`
    + (profile === MAIN ? ' (no profile for that engine — using the default)' : ''));
}
