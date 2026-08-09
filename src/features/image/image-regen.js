// galgame-companion · image-regen — surface mvu-helper's per-image "Regenerate" control on galgame's GUI. v0.2
//
// mvu-helper renders each generated image in the message as:
//   <span class="auto-img-wrap" data-rawtag="<pic …>"><img src="…"><span class="auto-img-regen …" role="button"></span></span>
// where clicking .auto-img-regen re-runs THAT image's generation. In galgame mode the message rows are hidden
// (immersive display:none), so that control is unreachable. This adds a companion button (top-right, under the 🖼
// image-viewer) that maps the CURRENTLY-DISPLAYED backdrop → its message <img> (matched by filename) → the sibling
// .auto-img-regen, and clicks it — reusing mvu-helper's own regen handler with zero reimplementation. A hidden
// element still fires its click listeners under a programmatic dispatch, so it works even with the row hidden.
// galgame stays untouched (we only READ its background layer + click an existing mvu-helper control).
//
// v0.2: when NOTHING is on the stage to match, fall back to the newest rendered image rather than giving up
// — see newestImageRegenControl() for why that is an aspect-ratio fix and not just a convenience.
// galgame exposes no scene name (no SpriteManager global, no data-* on the bg layers — verified live
// 2026-07-28), so the displayed backdrop's URL is the only handle we get; when it is absent there is
// nothing to be precise WITH, and the fallback says so plainly in its log line.

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

// FALLBACK TARGET: the newest rendered image in the chat (document order — the last wrap is the last
// image of the last message that has one). Used when the backdrop→image match above finds nothing,
// which is exactly what happens when the stage shows NO backdrop — e.g. the player deleted that scene
// from galgame's Background Manager. The message still HOLDS the image; only galgame's copy is gone,
// so there is a perfectly good regen control to press, just nothing on screen to match it against.
//
// WHY THIS IS WORTH A FALLBACK rather than "press the SillyTavern button instead": leaving galgame
// drops the ForceImageType latch (image-seam flips it on the overlay's active edge), so the
// replacement generates at the narrator's own aspect. Live 2026-07-28 — the exit-and-regen workaround
// produced a 768×1152 PORTRAIT image that then had to serve as a landscape backdrop. Keeping the
// player inside galgame keeps the latch on, so this is an aspect-correctness fix, not a convenience.
// Scans BACKWARDS rather than reading wraps[last] blindly: mvu-helper gives an UNRENDERED <pic> (failed
// generation / over the per-reply cap) the same auto-img-wrap envelope, and that placeholder carries no
// regen control — so the newest wrap in the chat is quite often not the newest IMAGE. Taking it returned
// null and reported "no generated image in this chat", with a perfectly regeneratable image sitting right
// above it.
function newestImageRegenControl() {
  const wraps = DOC.querySelectorAll('[class*="auto-img-wrap"]');
  for (let i = wraps.length - 1; i >= 0; i--) {
    const regen = wraps[i].querySelector('[class*="auto-img-regen"]');
    if (regen) return regen;
  }
  return null;
}

function fireRegen(btn) {
  // Prefer the image actually on screen; fall back to the newest one when nothing is displayed.
  let span = regenForCurrentBg();
  let target = 'the current backdrop';
  if (!span) {
    span = newestImageRegenControl();
    target = 'the NEWEST image — no backdrop was on screen to match (deleted from the Background Manager?)';
  }
  if (!span) { log.warn('image-regen: no generated image in this chat to regenerate — nothing to do'); return false; }
  span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // reuse mvu-helper's own handler
  // Name the target explicitly: on the fallback path this is NOT necessarily the beat the player meant,
  // and a silent "triggered" line would leave them guessing which image just changed.
  log.image(`image-regen: triggered regenerate for ${target}`);
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
  log.image('image-regen active');
}
