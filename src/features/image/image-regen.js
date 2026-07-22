// galgame-companion · image-regen — surface mvu-helper's per-image "Regenerate" control on galgame's GUI. v0.1
//
// mvu-helper renders each generated image in the message as:
//   <span class="auto-img-wrap" data-rawtag="<pic …>"><img src="…"><span class="auto-img-regen …" role="button"></span></span>
// where clicking .auto-img-regen re-runs THAT image's generation. In galgame mode the message rows are hidden
// (immersive display:none), so that control is unreachable. This adds a companion button (top-right, under the 🖼
// image-viewer) that maps the CURRENTLY-DISPLAYED backdrop → its message <img> (matched by filename) → the sibling
// .auto-img-regen, and clicks it — reusing mvu-helper's own regen handler with zero reimplementation. A hidden
// element still fires its click listeners under a programmatic dispatch, so it works even with the row hidden.
// galgame stays untouched (we only READ its background layer + click an existing mvu-helper control).

import { DOC, log } from '../../env.js';
import { currentBgUrl } from './image-viewer.js';

const OVERLAY_SEL = '#gal-global-overlay';
const BTN_CLASS = 'school-imgregen-btn';

// Filename only — the CSS backgroundImage URL (absolute) and the <img src> (maybe relative, maybe ?query) share
// the same unique timestamped basename, so compare on that.
function basename(u) { return (u || '').split('/').pop().split('?')[0]; }

// The regen control for the image currently shown as galgame's backdrop (matched by filename). Class is matched
// by SUBSTRING because mvu-helper emits it prefixed in the live DOM (custom-auto-img-wrap / custom-auto-img-regen)
// while the raw tag is auto-img-* — [class*=…] catches both.
function regenForCurrentBg() {
  const target = basename(currentBgUrl());
  if (!target) return null;
  for (const img of DOC.querySelectorAll('[class*="auto-img-wrap"] img')) {
    if (basename(img.getAttribute('src') || img.src) === target) {
      const wrap = img.closest('[class*="auto-img-wrap"]');
      const regen = wrap && wrap.querySelector('[class*="auto-img-regen"]');
      if (regen) return regen;
    }
  }
  return null;
}

function fireRegen(btn) {
  const span = regenForCurrentBg();
  if (!span) { log.warn('image-regen: no regen control matches the current backdrop — nothing to regenerate'); return false; }
  span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // reuse mvu-helper's own handler
  log.info('image-regen: triggered regenerate for the current backdrop');
  // Brief spin as "triggered" feedback — the real image swaps in when generation finishes (image-seam repaints).
  if (btn) { btn.classList.add('is-spinning'); setTimeout(() => btn.classList.remove('is-spinning'), 2000); }
  return true;
}

function injectButton() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay || overlay.querySelector('.' + BTN_CLASS)) return false;
  const btn = DOC.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.title = 'Regenerate the current image';
  btn.setAttribute('aria-label', 'Regenerate the current image');
  btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
  btn.addEventListener('click', (e) => { e.stopPropagation(); fireRegen(btn); });
  overlay.appendChild(btn);
  return true;
}

export function startImageRegen() {
  if (!DOC || !DOC.body) return setTimeout(startImageRegen, 200);
  // Re-inject whenever galgame rebuilds its overlay (rAF-batched, like the other overlay controls).
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectButton(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });
  injectButton();
  log.info('image-regen active');
}
