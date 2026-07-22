// galgame-companion · menu modal — our own popup shell over galgame's stage. v0.3 (G3)
// G2 ships the SHELL (mount/close/z-index above galgame's fullscreen overlay). G3 fills it:
// an iframe of the card's StatusMenu HTML + the TH-globals bridge (status-menu.js).
// We deliberately do NOT depend on galgame's internal showCustomPopupPanel (not a public API).
//
// LAYOUT: desktop = centered floating box over a dimmed backdrop. MOBILE (≤768px) = FULLSCREEN
// (fills the viewport, no rounded corners, opaque bg) so galgame never peeks through under/around
// it on a small screen — the user returns to galgame with the ✕ button. Sizing lives in an
// injected stylesheet (not inline) so a media query can flip it responsively.

import { DOC, log } from '../../env.js';
import { mountStatusMenu } from './status-menu.js';
import { currentFullscreenEl } from '../galgame-quirks/index.js';

const MODAL_ID = 'school-companion-modal';
const STYLE_ID = 'school-companion-modal-css';
// galgame's fullscreen overlay uses a very high z-index; sit above it.
const Z_INDEX = 2147483000;

// Where to mount the modal: INTO the native-fullscreen element if there is one, else document.body. Native
// fullscreen (galgame does overlay.requestFullscreen() on #gal-global-overlay) renders ONLY the fullscreen
// subtree in the browser's top layer — a body-level modal would sit behind it no matter the z-index, so the
// Menu button appeared to "do nothing" in fullscreen. Mounting inside the fullscreen el puts us in that layer.
function modalParent() { return currentFullscreenEl() || DOC.body; }

// Inject the modal stylesheet once. Desktop: centered box. Mobile: fullscreen cover.
function ensureStyles() {
  if (DOC.getElementById(STYLE_ID)) return;
  const style = DOC.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${MODAL_ID} {
  position: fixed; inset: 0; z-index: ${Z_INDEX};
  /* explicit viewport units — SillyTavern sets transform on <html>, which re-roots
     position:fixed to that ancestor, so inset:0 collapses to 0 height. vw/dvh always
     resolve to the real viewport, so the wrap fills the screen regardless. */
  width: 100vw; height: 100vh; height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
}
#${MODAL_ID} .sc-box {
  position: relative;
  /* Fill (almost) the full viewport height — the status menu is a long scroller, so height is precious.
     Small vertical margin (96dvh) keeps the rounded corners off the screen edge; width stays capped for
     readable line length. dvh so mobile browser chrome doesn't overflow it. */
  width: min(920px, 94vw); height: 96dvh;
  background: #1a1a2e; border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  overflow: hidden; display: flex; flex-direction: column;
}
#${MODAL_ID} .sc-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: #0f3460; color: #e8e8e8;
  font-weight: 700; flex: 0 0 auto;
}
#${MODAL_ID} .sc-bar button {
  background: none; border: 0; color: #e8e8e8;
  font-size: 1.1rem; cursor: pointer; padding: 4px 8px;
}
#${MODAL_ID} .sc-body {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  color: #8892b0;
}
@media (max-width: 768px) {
  #${MODAL_ID} { background: #1a1a2e; }         /* opaque — no galgame bleed-through */
  #${MODAL_ID} .sc-box {
    width: 100vw; height: 100vh; height: 100dvh; /* dvh handles mobile browser chrome */
    max-width: none; max-height: none;
    border-radius: 0; box-shadow: none;
  }
}`;
  (DOC.head || DOC.documentElement).appendChild(style);
}

// Cleanup for listeners bound while the modal is open (keydown + fullscreenchange). Set in openMenuModal.
let modalCleanup = null;

export function closeMenuModal() {
  if (modalCleanup) { try { modalCleanup(); } catch (e) { log.warn('menu-modal: cleanup failed:', e); } modalCleanup = null; }
  const el = DOC.getElementById(MODAL_ID);
  if (el) el.remove();
}

export function openMenuModal() {
  if (DOC.getElementById(MODAL_ID)) return; // already open
  ensureStyles();

  const wrap = DOC.createElement('div');
  wrap.id = MODAL_ID;

  const box = DOC.createElement('div');
  box.className = 'sc-box';

  const bar = DOC.createElement('div');
  bar.className = 'sc-bar';
  bar.innerHTML =
    '<span><i class="fa-solid fa-users"></i> School Menu</span>' +
    '<button data-school-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>';

  const body = DOC.createElement('div');
  body.className = 'sc-body';

  box.appendChild(bar);
  box.appendChild(body);
  wrap.appendChild(box);

  // close: X button, backdrop click, ESC
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target.closest && e.target.closest('[data-school-close]'))) {
      closeMenuModal();
    }
  });
  const onKey = (e) => {
    if (e.key === 'Escape') closeMenuModal();
  };
  DOC.addEventListener('keydown', onKey);
  modalCleanup = () => { DOC.removeEventListener('keydown', onKey); };

  // Mount into the fullscreen element if we're in fullscreen, else body — decided ONCE, at open time.
  // We deliberately do NOT re-parent on a later fullscreenchange: moving an iframe in the DOM RELOADS it,
  // which discards the menu's document.write content and blanks it. Nor is a re-parent needed — the fullscreen
  // TOGGLE button sits behind our backdrop (unreachable while open), and if fullscreen is exited another way
  // (ESC) the galgame overlay we're mounted in stays a visible in-page element, so the modal stays on screen.
  modalParent().appendChild(wrap);
  // fill the body with the card's StatusMenu (bridged iframe). The iframe — and its 2s
  // poll interval, which lives INSIDE it — is destroyed when closeMenuModal() removes `wrap`.
  mountStatusMenu(body);
  log.info('menu modal opened');
}
