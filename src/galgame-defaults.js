// galgame-companion · galgame-defaults — seed galgame's display settings ONCE per install so the
// card's intended VN presentation works out of the box, with NO per-user manual setup.
//
// WHY THIS EXISTS: galgame has no native way to ship these prefs (source-read 2026-07-17). Its Asset
// IO export covers only visual assets (sprites/backgrounds/CG/skin/imagegen); the card-embed config
// (`data.extensions.galgame_ui_plugin`) is read only for titleScreen/custom/enabled/assets — NOT the
// general text-display/visual toggles. So the general settings blob (`galgame-ui-plugin_settings`)
// is per-browser and would otherwise need manual setup on every install. The companion (the bridge)
// seeds it.
//
// APPLY TIMING: galgame loads `_settings` from localStorage ONLY at init (`loadSettings()`,
// galgame/src/init.js) and never re-reads it live, and `_settings` is module-scoped (not reachable to
// mutate). So a seed takes effect on the NEXT galgame init — we write as EARLY as possible (first
// thing in index.js) to win the same-session load race; if galgame already read its settings this
// session, the values apply after the next reload. Either way it's a ONE-TIME thing per install.
//
// GATING: a localStorage version flag. Runs exactly once per browser until SEED_VERSION bumps —
// so a user who later tweaks a galgame setting by hand is NOT overwritten on every load. Bump
// SEED_VERSION when the default set below changes to re-seed once.

import { topWindow, log } from './env.js';

// galgame constants (SCRIPT_ID = 'galgame-ui-plugin'; re-verify on an upstream bump, GCP §10.4).
const GAL_SETTINGS_KEY = 'galgame-ui-plugin_settings';        // main settings blob
const GAL_TTS_ENABLED_KEY = 'galgame-ui-plugin_tts_enabled';  // TTS enable lives OUTSIDE the blob ('true'/'false')
const SEED_FLAG_KEY = 'galgame-companion_seed_version';       // OUR marker (bump SEED_VERSION to re-seed)
const SEED_VERSION = 1;

// Card-intended galgame display defaults (approved screenshot set, 2026-07-17). Tune here + bump
// SEED_VERSION. Field names verified against galgame/src/core/settings.js DEFAULT_SETTINGS.
const SEEDED_SETTINGS = {
  dialogSegLengthOverride: 460,  // Words per page — Auto measures with a CJK glyph, under-counting English ~2× → tiny pages
  hideOtherFloors: true,         // Immersive mode (hide other message floors)
  typewriterEnabled: false,      // Typewriter effect: off
  typewriterSoundEnabled: false, // Typing sound: off
  bgFillMode: 'contain',         // Background fill: Contain (show whole)
  cgAsBackground: false,         // CG replaces background directly: off
  effectsEnabled: false,         // Pixi effects: off
  showSprites: false,            // Show sprites: off
  bgmEnabled: false,             // Enable BGM: off (also drops the <bgm> spec from galgame's COT)
};
const SEEDED_TTS_ENABLED = false; // Enable TTS voice: off (separate key; also drops TTS from galgame's COT)

// galgame's settings share the TOP window's localStorage (srcdoc iframe = parent origin, same store).
function store() {
  try { return topWindow.localStorage; }
  catch (e) { log.warn('galgame-defaults: topWindow.localStorage unreachable — seed skipped:', e); return null; }
}

export function seedGalgameDefaults() {
  const ls = store();
  if (!ls) return;

  let seededVer;
  try { seededVer = Number(ls.getItem(SEED_FLAG_KEY)) || 0; }
  catch (e) { log.warn('galgame-defaults: reading seed flag failed — seed skipped:', e); return; }
  if (seededVer >= SEED_VERSION) return; // already seeded at this version — respect any later manual tweaks

  // 1) MERGE the managed fields into the existing blob (never clobber unrelated settings the user has).
  let blob = {};
  try {
    const raw = ls.getItem(GAL_SETTINGS_KEY);
    if (raw) blob = JSON.parse(raw) || {};
  } catch (e) {
    log.warn('galgame-defaults: existing settings blob unparsable — writing a fresh managed set:', e);
    blob = {};
  }
  Object.assign(blob, SEEDED_SETTINGS);
  try { ls.setItem(GAL_SETTINGS_KEY, JSON.stringify(blob)); }
  catch (e) { log.error('galgame-defaults: could not write settings blob — seed aborted:', e); return; }

  // 2) TTS enable is a separate key (string).
  try { ls.setItem(GAL_TTS_ENABLED_KEY, String(SEEDED_TTS_ENABLED)); }
  catch (e) { log.warn('galgame-defaults: could not write TTS-enable key:', e); }

  // 3) Mark seeded LAST — only after the settings actually landed, so a mid-write failure re-seeds next load.
  try { ls.setItem(SEED_FLAG_KEY, String(SEED_VERSION)); }
  catch (e) { log.warn('galgame-defaults: could not write seed flag (harmless — will re-seed next load):', e); }

  log.info(
    `galgame-defaults: seeded galgame display settings (v${SEED_VERSION}) — words/page=` +
    `${SEEDED_SETTINGS.dialogSegLengthOverride}, immersive=on, typewriter/typing-sound/sprites/TTS/BGM/pixi=off, ` +
    `bgFill=contain. Takes effect on the next galgame load.`,
  );
}
