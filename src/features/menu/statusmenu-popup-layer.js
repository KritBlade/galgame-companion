// galgame-companion · statusmenu popup layer — keep the card StatusMenu's escaped popups reachable
// while galgame owns the screen. v0.1
//
// THE COLLISION (proven live 2026-08-24): the card's StatusMenu runs inside a TH message iframe, and
// its popups (quest/item detail, equip picker, image lightbox, portrait editor) deliberately escape
// that iframe — showModal appends them to `window.parent.document.body` so they are not clipped by the
// iframe box. In plain SillyTavern that lands on top. Inside galgame it does not: galgame's own
// viewers are ALSO body-level and sit far higher (.gal-embedded-viewer = position:fixed, z-index
// 99999), while the escaped popups carry a hardcoded z-index of 50000–60000. Opening the quest card
// from galgame's VIEW panel therefore created a popup that was painted behind the panel — invisible,
// and its ✕ unclickable, so the popup could not be closed at all.
//
// Neither side is wrong on its own (the card is not allowed to know galgame exists, and galgame is
// imported untouched from CDN), so the collision belongs to the companion — it is the only place both
// stacks are visible. Two halves, because the popups fail in two different ways:
//   1. Z-ORDER — fixed in style.js (one rule per popup id, !important to beat their inline z-index).
//   2. NATIVE FULLSCREEN — this file. When galgame is in native fullscreen the browser paints ONLY the
//      fullscreen subtree in its top layer, so a body-level popup is invisible at ANY z-index. The
//      companion's own menu modal already mounts inside the fullscreen element for that reason; the
//      card's popups escape to body regardless, so we move them into the same layer after the fact.
//
// Two triggers, because the popups have two lifecycles: detail/img are removed on close and re-created
// on every open (caught by the childList observer), while portrait/equip are created ONCE and merely
// display-toggled afterwards (caught by the fullscreenchange sweep, which relocates them while hidden).

import { DOC, log } from '../../env.js';
import { currentFullscreenEl } from '../galgame-quirks/index.js';

// The StatusMenu's four escaped popups, by the ids its generated HTML gives them.
const POPUP_IDS = ['detail-modal-overlay', 'img-popup-overlay', 'portrait-mode-modal', 'equip-modal-overlay'];

// Move one popup into whichever layer is currently on screen: the native-fullscreen element while
// galgame is fullscreen, otherwise back to body (leaving it parented to a hidden overlay after
// fullscreen exits would hide it just as thoroughly).
function relocate(el) {
  const target = currentFullscreenEl() || DOC.body;
  if (!target || el.parentElement === target) return;
  target.appendChild(el);
  log.info(`statusmenu-popup-layer: moved #${el.id} into ${target === DOC.body ? 'body' : 'the fullscreen layer'}`);
}

function sweep() {
  for (const id of POPUP_IDS) {
    const el = DOC.getElementById(id);
    if (el) relocate(el);
  }
}

export function startStatusMenuPopupLayer() {
  if (!DOC || !DOC.body) { log.warn('statusmenu-popup-layer: no parent document body — skipping'); return; }

  // Only act while fullscreen: outside it the z-order rules in style.js already put the popup on top,
  // and an unconditional move would fight the StatusMenu for ownership of its own node for no gain.
  const observer = new MutationObserver((records) => {
    if (!currentFullscreenEl()) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && POPUP_IDS.includes(node.id)) relocate(node);
      }
    }
  });
  observer.observe(DOC.body, { childList: true });

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
    .forEach((evt) => DOC.addEventListener(evt, sweep));

  log.info('statusmenu-popup-layer active');
}
