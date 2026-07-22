// galgame-companion · toolbar — inject our Menu button into galgame's overlay. v0.2
// galgame has NO button API; we inject via DOM (GCP §3). A NEW data-action matches none of
// galgame's per-action delegated handlers → inert to galgame, zero conflict. Reusing its own
// classes (gal-footer-btn / gal-menu-btn) inherits styling + skins automatically.
// galgame rebuilds the overlay on chat change → a MutationObserver re-adds the button
// whenever the overlay (re)appears without it. Desktop button + mobile menu both live inside
// #gal-global-overlay → ONE delegated click listener covers both.
//
// DESKTOP PLACEMENT (v0.2, 2026-07-18): pinned to the overlay's upper-left corner, NOT the bottom
// toolbar. galgame's footer is a fixed-width flex-nowrap row already filled edge-to-edge by
// LOG…NEXT and clipped by .gal-text-panel(overflow:hidden), so an appended button was cut off and
// reclaiming room fought galgame's own buttons. The overlay is already position:relative (its own
// top-right status pills anchor to it), so a direct-child button + corner CSS (style.js) sits clear
// of every crowded row at any dialogue scale.

import { DOC, log } from '../../env.js';
import { openMenuModal } from './menu-modal.js';

export const ACTION = 'school-stats';

const OVERLAY_SEL = '#gal-global-overlay';
const MOBILE_MENU_SEL = '#gal-global-overlay #gal-mobile-menu';
const CORNER_CLASS = 'school-corner-btn';

// Desktop: corner-pinned by style.js's .school-corner-btn rule; .gal-footer-btn carries galgame's look.
const CORNER_BTN_HTML =
  `<button class="gal-footer-btn ${CORNER_CLASS}" data-action="${ACTION}" title="School Menu">` +
  `<i class="fa-solid fa-users"></i> <span class="gal-btn-text">MENU</span></button>`;

// mirrors buildGalMobileMenuButtonsHtml()'s .gal-menu-btn markup for native look
const MOBILE_BTN_HTML =
  `<button class="gal-menu-btn" data-action="${ACTION}">` +
  `<i class="fa-solid fa-users"></i> Menu</button>`;

// Inject `html` into `containerSel` unless `existsSel` already matches inside it (dedupe). Added → true.
function injectInto(containerSel, existsSel, html) {
  const c = DOC.querySelector(containerSel);
  if (!c || c.querySelector(existsSel)) return false;
  c.insertAdjacentHTML('beforeend', html);
  return true;
}

function injectAll() {
  // Desktop dedupe is by OUR corner class (the mobile button shares data-action but lives in the
  // mobile menu, so a data-action check would wrongly suppress the corner button).
  const a = injectInto(OVERLAY_SEL, `.${CORNER_CLASS}`, CORNER_BTN_HTML);
  const b = injectInto(MOBILE_MENU_SEL, `[data-action="${ACTION}"]`, MOBILE_BTN_HTML);
  if (a || b) log.info(`button injected (corner=${a}, mobile=${b})`);
}

export function startToolbar() {
  if (!DOC || !DOC.body) return setTimeout(startToolbar, 200);

  // one delegated click handler for OUR action only (bubble phase; galgame has no
  // handler for this action so ordering is irrelevant)
  DOC.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest(`[data-action="${ACTION}"]`);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      openMenuModal();
    } catch (err) {
      log.error('menu modal failed to open:', err);
    }
  });

  // re-inject whenever galgame (re)builds its overlay — rAF-batched like the i18n observer
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectAll();
    });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  injectAll(); // in case the overlay is already up
  log.info('toolbar watcher active');
}
