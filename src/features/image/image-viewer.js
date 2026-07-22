// galgame-companion · image-viewer — a button that pops the CURRENT backdrop near-fullscreen. v0.1
//
// galgame paints the active scene image as a CSS background-image on .gal-bg-front / .gal-bg-base inside
// #gal-global-overlay (front = the transition target, base = the settled image). This adds a companion button
// (top-right, stacked with the other companion controls — fullscreen · Next · 🖼) that opens a near-full-viewport
// lightbox of that exact image at full size (contain-fit). Mounts INTO the fullscreen element when in fullscreen
// (same top-layer reason as menu-modal) so it shows over galgame's fullscreen stage. galgame stays untouched —
// we only READ its background layers.

import { DOC, log } from '../../env.js';
import { currentFullscreenEl } from '../galgame-quirks/index.js';

const OVERLAY_SEL = '#gal-global-overlay';
const BTN_CLASS = 'school-imgview-btn';
const MODAL_ID = 'school-imgview-modal';
// Sit above galgame's fullscreen overlay (same very-high z-index the menu modal uses).
const Z_INDEX = 2147483000;

// Native fullscreen paints ONLY the fullscreen subtree — mount the lightbox there when fullscreen, else body.
function modalParent() { return currentFullscreenEl() || DOC.body; }

// URL of the currently displayed backdrop: the front layer wins during/after a cross-fade, else the base layer.
// Exported so image-regen can map the shown backdrop back to its message <img> + regen control.
export function currentBgUrl() {
  const ov = DOC.querySelector(OVERLAY_SEL);
  if (!ov) return null;
  for (const sel of ['.gal-bg-front', '.gal-bg-base']) {
    const el = ov.querySelector(sel);
    if (!el) continue;
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\((['"]?)(.*?)\1\)/);
    if (m && m[2]) return m[2];
  }
  return null;
}

let cleanup = null;

export function closeImageViewer() {
  if (cleanup) { try { cleanup(); } catch (e) { log.warn('image-viewer: cleanup failed:', e); } cleanup = null; }
  const el = DOC.getElementById(MODAL_ID);
  if (el) el.remove();
}

export function openImageViewer() {
  if (DOC.getElementById(MODAL_ID)) return; // already open
  const url = currentBgUrl();

  const wrap = DOC.createElement('div');
  wrap.id = MODAL_ID;
  wrap.style.cssText =
    `position:fixed;inset:0;z-index:${Z_INDEX};width:100vw;height:100dvh;` +
    'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);cursor:zoom-out;';

  if (url) {
    const img = DOC.createElement('img');
    img.src = url;
    img.alt = 'Current scene image';
    // near-full viewport, aspect-preserved (contain).
    img.style.cssText =
      'max-width:96vw;max-height:96dvh;width:auto;height:auto;object-fit:contain;' +
      'border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.7);cursor:default;';
    img.addEventListener('click', (e) => e.stopPropagation()); // clicking the image doesn't close
    wrap.appendChild(img);
  } else {
    const msg = DOC.createElement('div');
    msg.textContent = 'No image is showing right now.';
    msg.style.cssText = 'color:#ccc;font-size:1rem;';
    wrap.appendChild(msg);
  }

  const close = DOC.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '✕';
  close.style.cssText =
    'position:absolute;top:14px;right:16px;background:rgba(0,0,0,0.55);border:0;color:#fff;' +
    'font-size:1.3rem;line-height:1;cursor:pointer;padding:6px 12px;border-radius:8px;';
  wrap.appendChild(close);

  // close on backdrop click or ✕ (image click is stopped above); ESC closes too.
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === close) closeImageViewer(); });
  const onKey = (e) => { if (e.key === 'Escape') closeImageViewer(); };
  DOC.addEventListener('keydown', onKey);
  cleanup = () => DOC.removeEventListener('keydown', onKey);

  modalParent().appendChild(wrap);
  log.info('image-viewer: opened (' + (url ? 'showing current backdrop' : 'no image') + ')');
}

function injectButton() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay || overlay.querySelector('.' + BTN_CLASS)) return false;
  const btn = DOC.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.title = 'View the current image';
  btn.setAttribute('aria-label', 'View the current image');
  btn.innerHTML = '<i class="fa-solid fa-image"></i>';
  // stopPropagation so the click never reaches galgame's overlay handlers.
  btn.addEventListener('click', (e) => { e.stopPropagation(); openImageViewer(); });
  overlay.appendChild(btn);
  return true;
}

export function startImageViewer() {
  if (!DOC || !DOC.body) return setTimeout(startImageViewer, 200);
  // Re-inject whenever galgame rebuilds its overlay (rAF-batched, like the other overlay controls).
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectButton(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });
  injectButton();
  log.info('image-viewer active');
}
