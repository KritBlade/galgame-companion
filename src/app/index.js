// ============================================================
// galgame-companion — School v3's HUD layer over bigmalove/galgame. v0.2
// ------------------------------------------------------------
// A Tavern-Helper script (SAME runtime as galgame — NOT an ST extension). Third
// independent entry in TH's script library alongside galgame + mvu; reaches galgame's
// GUI in the parent ST document via window.parent.document (same origin). galgame is
// imported from CDN untouched — zero upstream coupling (GCP §1).
//
// Capabilities (GCP): 1 i18n overlay · 2 toolbar Menu button · 3 StatusMenu popup (G3)
//                     · 4 image seam: saveBackground writer + ForceImageType flip (G4b)
// ============================================================

import { SCRIPT_NAME, VERSION, BUILD, topWindow, log } from '../env.js';
import { startGalgameDefaults } from './galgame-defaults.js';
import { injectStyle } from './style.js';
import { startI18n } from '../features/i18n/index.js';
import { startToolbar } from '../features/menu/index.js';
import { startFullscreenGuard, startGeneratingGuard } from '../features/galgame-quirks/index.js';
import { startImageSeam, startImageViewer, startImageRegen } from '../features/image/index.js';
import { startBeatShaper } from '../features/beat-shaper/index.js';
import { startChoices, startLocationTimeBridge, startNextBlock } from '../features/galgame-bridge/index.js';

// WHICH BUILD IS RUNNING — deliberately UNGATED (not log.info, which needs DEBUG). This is the
// first question every troubleshooting session asks, and gating it behind a flag means the one line
// you need is missing exactly when you need it. One line, once per load. It also lands BEFORE any
// feature starts, so a crash during boot still leaves the build identified.
console.log(`[${SCRIPT_NAME}] v${VERSION} · build ${BUILD}`);

// Same answer, queryable rather than scrolled-for: readable from the ST page (console or an
// automated check) without hunting the log. Lives on the PARENT window because the companion runs
// in its own TH iframe — `globalThis` here is that iframe, which nothing else can see.
// Renamed off `__schoolCompanion` with SCRIPT_NAME (2026-08-11) — same reason, and no alias is left
// behind: nothing outside this repo ever read it, and a second name for one handle is the drift being
// removed, not a migration to soften.
try {
  topWindow.__galgameCompanion = Object.assign(topWindow.__galgameCompanion || {}, {
    name: SCRIPT_NAME, version: VERSION, build: BUILD, loadedAt: new Date().toISOString(),
  });
} catch (e) {
  log.warn('could not publish the build stamp on the parent window (troubleshooting handle unavailable):', e);
}

log.info(`v${VERSION} loading`);

// FIRST: seed galgame's display settings (words/page, immersive, no typewriter/sprites/TTS/BGM/pixi,
// contain-fit), then make galgame READ them — no-op if galgame hasn't initialized yet, else ONE guarded
// full reload (first install only). Once one galgame init reads the seed, its saves preserve it forever;
// user tweaks after that stick. Version-gated by SEED_VERSION (see galgame-defaults.js header).
startGalgameDefaults();

injectStyle();
startI18n();
startToolbar();
startFullscreenGuard(); // release native fullscreen galgame leaks when its "quit mode" is clicked
// Order matters: the shaper MUST register before the seam so that on the same MESSAGE_UPDATED
// (ST awaits listeners sequentially) the text is already shaped — uid-scoped scene names in place —
// when the seam scans it. Seam-side SCENE_NAME_RE filter is the belt-and-braces for other orders.
startBeatShaper();      // dumb-terminal C1: <p>-wrap prose + inject uid-scoped <background scene> per image (scene #1 hoisted)
startImageSeam();       // G4b: mvu-helper images → galgame backdrop DB (uid-scoped names only) + ForceImageType flip
startGeneratingGuard(); // clear galgame's "Generating" indicator when it latches on with no real generation (load-race / 120s-hang)
startLocationTimeBridge(); // feed galgame's location/time pills from stat_data.World (AutoCardUpdaterAPI shim; MVU cards have none)
startChoices();            // A2 all-genre: inject a <choices> format instruction + feed galgame's Story-choices UI via the same shim's 选项表 sheet
startNextBlock();          // surface the engine's manual Next-Block advance (PendingState.BlockDone) top-right, driving the real stat-menu checkbox
startImageViewer();        // top-right button → near-full-viewport lightbox of galgame's current backdrop image
startImageRegen();         // top-right button (under 🖼) → click mvu-helper's regen control for the current backdrop
// G3: StatusMenu bridge wires into menu-modal.js
// G4b: image-seam writer (saveBackground keyed by nearest-preceding <background scene>)
//      + Preferences.ForceImageType flip on immersive enter/exit

log.info(`v${VERSION} ready`);
