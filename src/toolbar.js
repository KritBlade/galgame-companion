// galgame-companion · toolbar — inject our Menu button into galgame's bars. v0.1
// galgame has NO button API; we inject via DOM (GCP §3). A NEW data-action matches none of
// galgame's per-action delegated handlers → inert to galgame, zero conflict. Reusing its own
// classes (gal-footer-btn / gal-menu-btn) inherits styling + skins automatically.
// galgame rebuilds the overlay on chat change → a MutationObserver re-adds the button
// whenever a bar (re)appears without it. Desktop toolbar + mobile menu both live inside
// #gal-global-overlay → ONE delegated click listener covers both.

import { DOC, log } from './env.js';
import { openMenuModal } from './menu-modal.js';

export const ACTION = 'school-stats';

const TOOLBAR_SEL = '#gal-global-overlay .gal-bottom-toolbar';
const MOBILE_MENU_SEL = '#gal-global-overlay #gal-mobile-menu';

const TOOLBAR_BTN_HTML =
  `<button class="gal-footer-btn" data-action="${ACTION}" title="School Menu">` +
  `<i class="fa-solid fa-users"></i> <span class="gal-btn-text">MENU</span></button>`;

// mirrors buildGalMobileMenuButtonsHtml()'s .gal-menu-btn markup for native look
const MOBILE_BTN_HTML =
  `<button class="gal-menu-btn" data-action="${ACTION}">` +
  `<i class="fa-solid fa-users"></i> Menu</button>`;

function injectInto(sel, html) {
  const bar = DOC.querySelector(sel);
  if (!bar || bar.querySelector(`[data-action="${ACTION}"]`)) return false;
  bar.insertAdjacentHTML('beforeend', html);
  return true;
}

function injectAll() {
  const a = injectInto(TOOLBAR_SEL, TOOLBAR_BTN_HTML);
  const b = injectInto(MOBILE_MENU_SEL, MOBILE_BTN_HTML);
  if (a || b) log.info(`button injected (toolbar=${a}, mobile=${b})`);
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
