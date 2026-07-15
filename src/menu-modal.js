// galgame-companion · menu modal — our own popup shell over galgame's stage. v0.1
// G2 ships the SHELL (mount/close/z-index above galgame's fullscreen overlay). G3 fills it:
// an iframe of the pre-built stat_menu__StatusMenu.html + the ~5-line TH-globals bridge
// (getVariables/getChatMessages/waitGlobalInitialized/eventOn/Mvu — GCP §4b). We deliberately
// do NOT depend on galgame's internal showCustomPopupPanel (not a public API).

import { DOC, log } from './env.js';
import { mountStatusMenu } from './status-menu.js';

const MODAL_ID = 'school-companion-modal';
// galgame's fullscreen overlay uses a very high z-index; sit above it.
const Z_INDEX = 2147483000;

export function closeMenuModal() {
  const el = DOC.getElementById(MODAL_ID);
  if (el) el.remove();
}

export function openMenuModal() {
  if (DOC.getElementById(MODAL_ID)) return; // already open

  const wrap = DOC.createElement('div');
  wrap.id = MODAL_ID;
  wrap.style.cssText =
    `position:fixed;inset:0;z-index:${Z_INDEX};display:flex;align-items:center;` +
    'justify-content:center;background:rgba(0,0,0,0.55);';

  const box = DOC.createElement('div');
  box.style.cssText =
    'position:relative;width:min(920px,94vw);height:min(680px,90vh);background:#1a1a2e;' +
    'border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.6);overflow:hidden;' +
    'display:flex;flex-direction:column;';

  const bar = DOC.createElement('div');
  bar.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
    'background:#0f3460;color:#e8e8e8;font-weight:700;flex:0 0 auto;';
  bar.innerHTML =
    '<span><i class="fa-solid fa-users"></i> School Menu</span>' +
    '<button data-school-close style="background:none;border:0;color:#e8e8e8;' +
    'font-size:1.1rem;cursor:pointer;padding:4px 8px;"><i class="fa-solid fa-xmark"></i></button>';

  const body = DOC.createElement('div');
  body.style.cssText =
    'flex:1 1 auto;display:flex;align-items:center;justify-content:center;color:#8892b0;';

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
    if (e.key === 'Escape') {
      closeMenuModal();
      DOC.removeEventListener('keydown', onKey);
    }
  };
  DOC.addEventListener('keydown', onKey);

  DOC.body.appendChild(wrap);
  // fill the body with the card's StatusMenu (bridged iframe). The iframe — and its 2s
  // poll interval, which lives INSIDE it — is destroyed when closeMenuModal() removes `wrap`.
  mountStatusMenu(body);
  log.info('menu modal opened');
}
