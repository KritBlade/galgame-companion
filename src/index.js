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

import { SCRIPT_NAME, VERSION, log } from './env.js';
import { startI18n } from './i18n.js';
import { startToolbar } from './toolbar.js';
import { injectStyle } from './style.js';
import { startFullscreenGuard } from './fullscreen-guard.js';
import { startImageSeam } from './image-seam.js';
import { startBeatShaper } from './beat-shaper.js';

log.info(`v${VERSION} loading`);

injectStyle();
startI18n();
startToolbar();
startFullscreenGuard(); // release native fullscreen galgame leaks when its "quit mode" is clicked
// Order matters: the shaper MUST register before the seam so that on the same MESSAGE_UPDATED
// (ST awaits listeners sequentially) the text is already shaped — msg-scoped scene names in place —
// when the seam scans it. Seam-side SCENE_NAME_RE filter is the belt-and-braces for other orders.
startBeatShaper();      // dumb-terminal C1: <p>-wrap prose + inject msg-scoped <background scene> per image (scene #1 hoisted)
startImageSeam();       // G4b: mvu-helper images → galgame backdrop DB (msg-scoped names only) + ForceImageType flip
// G3: StatusMenu bridge wires into menu-modal.js
// G4b: image-seam writer (saveBackground keyed by nearest-preceding <background scene>)
//      + World_Calc.ForceImageType flip on immersive enter/exit

log.info(`v${VERSION} ready`);
