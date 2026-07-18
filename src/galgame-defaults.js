// galgame-companion · galgame-defaults — seed galgame's display settings so the card's intended VN
// presentation works out of the box, with NO per-user manual setup.
//
// WHY THIS EXISTS: galgame has no native way to ship these prefs (source-read 2026-07-17). Its Asset
// IO export covers only visual assets; the card-embed config (`data.extensions.galgame_ui_plugin`) is
// read only for titleScreen/custom/enabled/assets — NOT the general text-display/visual toggles. So
// the settings blob (`galgame-ui-plugin_settings`) is per-browser and would otherwise need manual
// setup on every install. The companion (the bridge) seeds it.
//
// THE STALENESS PROBLEM (root cause, proven on UAT 2026-07-18): galgame reads the blob into its
// module-scoped `_settings` ONCE per page load (`loadSettings()`, galgame/src/init.js:71) and never
// re-reads. If galgame read BEFORE our seed, its memory stays stale all session, and `saveSettings()`
// on ANY interaction (settings panel, wizard, map autopregen, asset ops — 120+ callers) serializes
// that stale memory back over our seed — a CLOBBER. A plain one-shot flag then cemented the failure
// (UAT: flag "1" yet every field at galgame default).
//
// THE FIX — make galgame RE-READ, don't fight its saves: galgame's load-merge is
// `{...DEFAULT_SETTINGS, ...parsed}` (settings.js:1273), so once ONE init reads our values, its memory
// is converged and every later save PRESERVES them. Clobber becomes impossible; the one-shot flag is
// then genuinely one-shot. Two paths to that converged read:
//   a) galgame hasn't initialized yet when we seed → it will read our values this session. Detect via
//      galgame's own cross-iframe init lock `topWindow['__galgame_init_lock__']` (init.js:63-68).
//      RACE-FREE: same-origin iframes share one JS thread, and galgame sets the lock and calls
//      loadSettings() in the same synchronous block (no await between init.js:68 and :71) — so
//      lock absent ⇒ loadSettings has NOT run. No reload needed at all.
//   b) galgame already read (lock present) → ONE full `topWindow.location.reload()`. Reloading only
//      galgame's iframe does NOT work: the topWindow init lock survives, so its init() self-skips;
//      force-clearing the lock leaves dead event bindings behind the *_BOUND_FLAGs (init.js:44-46).
//      Full reload is the supported path — happens once per install, ever.
//
// POST-RELOAD VERIFY (bounded): a save can land in the ms between seed and reload — galgame's ONLY
// unconditional boot-path save is the legacy-skin sanitize (init.js:81, rare), plus early auto-saves
// (map autopregen, comfyui helpers). So after OUR reload (sessionStorage marker) we verify the blob
// actually carries the seed; if it was clobbered pre-reload, re-seed + reload once more. Hard cap 2
// seed-reloads per session, then log.error and give up — never a reload loop.
//
// SEED_VERSION RULE: bump ONLY when the seeded DATA changes (a default value, a managed field added/
// removed, or a forced re-heal of broken installs). A bump re-applies card values ONCE per install,
// overwriting user tweaks to managed fields one time. Logic-only changes ship as a normal script
// release with NO bump — converged installs skip straight through. (1→2 was the UAT re-heal.)

import { topWindow, log } from './env.js';

// galgame constants (SCRIPT_ID = 'galgame-ui-plugin'; lock from init.js. Re-verify BOTH on an
// upstream bump, GCP §10.4 — if the lock is renamed we just reload once unnecessarily, still correct).
const GAL_SETTINGS_KEY = 'galgame-ui-plugin_settings';        // main settings blob
const GAL_TTS_ENABLED_KEY = 'galgame-ui-plugin_tts_enabled';  // TTS enable lives OUTSIDE the blob ('true'/'false')
const GAL_INIT_LOCK = '__galgame_init_lock__';                // set by galgame init, same sync block as loadSettings()
const SEED_FLAG_KEY = 'galgame-companion_seed_version';       // localStorage version gate (see SEED_VERSION RULE)
const RELOAD_MARKER = 'galgame-companion_seed_reload';        // sessionStorage: # of seed-reloads this session
const SEED_VERSION = 2;                                       // bumped 1→2: re-heal installs clobbered under v0.5.15
const MAX_RELOADS = 2;                                        // hard cap per session — never a reload loop

// Card-intended values + galgame's own DEFAULT_SETTINGS value (`def`, verified against
// galgame/src/core/settings.js DEFAULT_SETTINGS 2026-07-18). `def` is used by the post-reload verify:
// fields where value !== def discriminate "seed survived" from "clobbered back to defaults".
const MANAGED = [
  { key: 'dialogSegLengthOverride', value: 460, def: 0 },       // Words per page (Auto under-counts English ~2×)
  { key: 'hideOtherFloors', value: true, def: true },            // Immersive mode
  { key: 'typewriterEnabled', value: false, def: true },         // Typewriter effect off
  { key: 'typewriterSoundEnabled', value: false, def: true },    // Typing sound off
  { key: 'bgFillMode', value: 'contain', def: 'cover' },         // Background fill: show whole image
  { key: 'cgAsBackground', value: false, def: false },           // CG replaces background off
  { key: 'effectsEnabled', value: false, def: true },            // Pixi effects off
  { key: 'showSprites', value: false, def: true },               // Sprites off
  { key: 'bgmEnabled', value: false, def: true },                // BGM off (also drops <bgm> from galgame's COT)
];
const SEEDED_TTS_ENABLED = false; // TTS voice off (separate key; also drops TTS from galgame's COT)

// galgame's settings share the TOP window's storage (srcdoc iframe = parent origin, same store).
function localStore() {
  try { return topWindow.localStorage; }
  catch (e) { log.warn('galgame-defaults: topWindow.localStorage unreachable — seed skipped:', e); return null; }
}
function sessionStore() {
  try { return topWindow.sessionStorage; }
  catch (e) { log.warn('galgame-defaults: topWindow.sessionStorage unreachable:', e); return null; }
}

function readBlob(ls) {
  try {
    const raw = ls.getItem(GAL_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (e) {
    log.warn('galgame-defaults: settings blob unparsable — seeding a fresh managed set:', e);
    return {};
  }
}

// Merge the managed fields into the blob (never clobber unrelated settings) + the TTS key.
// Returns false if the blob write failed (seed not applied).
function seedValues(ls) {
  const blob = readBlob(ls);
  for (const f of MANAGED) blob[f.key] = f.value;
  try { ls.setItem(GAL_SETTINGS_KEY, JSON.stringify(blob)); }
  catch (e) { log.error('galgame-defaults: could not write settings blob — seed aborted:', e); return false; }
  try { ls.setItem(GAL_TTS_ENABLED_KEY, String(SEEDED_TTS_ENABLED)); }
  catch (e) { log.warn('galgame-defaults: could not write TTS-enable key:', e); }
  return true;
}

// True when every discriminating field (value !== def) sits at galgame's default — the signature of a
// stale-memory clobber. Any surviving card value ⇒ galgame's init-merge kept the seed ⇒ converged.
function blobClobbered(ls) {
  const blob = readBlob(ls);
  return MANAGED.filter(f => f.value !== f.def)
    .every(f => blob[f.key] === f.def || blob[f.key] === undefined);
}

function reloadAttempts(ss) {
  if (!ss) return 0;
  try { return Number(ss.getItem(RELOAD_MARKER)) || 0; }
  catch (e) { log.warn('galgame-defaults: reading reload marker failed:', e); return 0; }
}

// Seed, then get galgame to READ it: no-op if galgame hasn't initialized yet (path a), else one
// guarded full reload (path b). Shared by first-seed and the post-reload retry.
function seedAndConverge(ls, ss, why) {
  if (!seedValues(ls)) return; // blob write failed — flag untouched, retried next load

  try { ls.setItem(SEED_FLAG_KEY, String(SEED_VERSION)); }
  catch (e) { log.warn('galgame-defaults: could not write seed flag (will re-seed next load):', e); }

  if (!topWindow[GAL_INIT_LOCK]) {
    // galgame's loadSettings() has NOT run yet (lock+load are one sync block) — it will read the
    // seeded blob this session. Converged with zero disruption.
    log.info(`galgame-defaults: seeded v${SEED_VERSION} (${why}) before galgame init — no reload needed.`);
    return;
  }

  const attempts = reloadAttempts(ss);
  if (!ss || attempts >= MAX_RELOADS) {
    log.error(
      `galgame-defaults: seeded v${SEED_VERSION} (${why}) but galgame already read stale settings and ` +
      (ss ? `${attempts} reload(s) did not converge` : 'sessionStorage is unavailable to guard a reload') +
      ' — giving up. Reload SillyTavern manually; values apply on the next clean load.',
    );
    return;
  }
  try { ss.setItem(RELOAD_MARKER, String(attempts + 1)); }
  catch (e) { log.error('galgame-defaults: could not write reload marker — NOT reloading (loop guard):', e); return; }
  log.info(`galgame-defaults: seeded v${SEED_VERSION} (${why}) after galgame init — reloading ST once to apply (${attempts + 1}/${MAX_RELOADS}).`);
  topWindow.location.reload();
}

export function startGalgameDefaults() {
  const ls = localStore();
  if (!ls) return;
  const ss = sessionStore();

  let ver = 0;
  try { ver = Number(ls.getItem(SEED_FLAG_KEY)) || 0; }
  catch (e) { log.warn('galgame-defaults: reading seed flag failed — assuming unseeded:', e); }

  if (ver >= SEED_VERSION) {
    const attempts = reloadAttempts(ss);
    if (!attempts) return; // steady state: converged install, zero work

    // We are the load right after OUR seed-reload — verify the seed survived to galgame's read.
    if (!blobClobbered(ls)) {
      try { ss.removeItem(RELOAD_MARKER); } catch (e) { log.warn('galgame-defaults: could not clear reload marker:', e); }
      log.info('galgame-defaults: converged — galgame read the seeded settings.');
      return;
    }
    // A save clobbered the seed in the seed→reload window (e.g. legacy-skin boot save, init.js:81).
    if (attempts >= MAX_RELOADS) {
      try { ss.removeItem(RELOAD_MARKER); } catch (e) { log.warn('galgame-defaults: could not clear reload marker:', e); }
      log.error(
        `galgame-defaults: seed clobbered again after ${attempts} reload(s) — giving up this session. ` +
        'Something saves galgame settings during boot every load; set the display settings manually once.',
      );
      return;
    }
    seedAndConverge(ls, ss, 'post-reload retry');
    return;
  }

  seedAndConverge(ls, ss, ver ? `upgrade ${ver}→${SEED_VERSION}` : 'first install');
}
