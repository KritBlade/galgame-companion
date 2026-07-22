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

import { SCRIPT_NAME, VERSION, log } from '../env.js';
import { startGalgameDefaults } from './galgame-defaults.js';
import { injectStyle } from './style.js';
import { startI18n } from '../features/i18n/index.js';
import { startToolbar } from '../features/menu/index.js';
import { startFullscreenGuard, startGeneratingGuard } from '../features/galgame-quirks/index.js';
import { startImageSeam, startImageViewer, startImageRegen } from '../features/image/index.js';
import { startBeatShaper } from '../features/beat-shaper/index.js';
import { startChoices, startLocationTimeBridge, startNextBlock } from '../features/galgame-bridge/index.js';

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
// (ST awaits listeners sequentially) the text is already shaped — msg-scoped scene names in place —
// when the seam scans it. Seam-side SCENE_NAME_RE filter is the belt-and-braces for other orders.
startBeatShaper();      // dumb-terminal C1: <p>-wrap prose + inject msg-scoped <background scene> per image (scene #1 hoisted)
startImageSeam();       // G4b: mvu-helper images → galgame backdrop DB (msg-scoped names only) + ForceImageType flip
startGeneratingGuard(); // clear galgame's "Generating" indicator when it latches on with no real generation (load-race / 120s-hang)
startLocationTimeBridge(); // feed galgame's location/time pills from stat_data.World (AutoCardUpdaterAPI shim; MVU cards have none)
startChoices();            // A2 all-genre: inject a <choices> format instruction + feed galgame's Story-choices UI via the same shim's 选项表 sheet
startNextBlock();          // surface the engine's manual Next-Block advance (World_Calc.BlockDone) top-right, driving the real stat-menu checkbox
startImageViewer();        // top-right button → near-full-viewport lightbox of galgame's current backdrop image
startImageRegen();         // top-right button (under 🖼) → click mvu-helper's regen control for the current backdrop
// G3: StatusMenu bridge wires into menu-modal.js
// G4b: image-seam writer (saveBackground keyed by nearest-preceding <background scene>)
//      + World_Calc.ForceImageType flip on immersive enter/exit

log.info(`v${VERSION} ready`);
