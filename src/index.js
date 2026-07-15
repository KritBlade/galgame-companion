// ============================================================
// galgame-companion — School v3's HUD layer over bigmalove/galgame. v0.1
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

log.info(`v${VERSION} loading`);

injectStyle();
startI18n();
startToolbar();
// G3: StatusMenu bridge wires into menu-modal.js
// G4b: image-seam writer (saveBackground keyed by nearest-preceding <background scene>)
//      + World_Calc.ForceImageType flip on immersive enter/exit

log.info(`v${VERSION} ready`);
