// galgame-companion · image-regen — surface mvu-helper's per-image "Regenerate" control on galgame's GUI. v0.4
//
// mvu-helper renders each generated image in the message as:
//   <span class="auto-img-wrap" data-rawtag="<pic …>"><img src="…"><span class="auto-img-regen …" role="button"></span></span>
// where clicking .auto-img-regen re-runs THAT image's generation. In galgame mode the message rows are hidden
// (immersive display:none), so that control is unreachable. This adds a companion button (top-right, under the 🖼
// image-viewer) that maps the CURRENTLY-DISPLAYED backdrop → its message <img> (matched by filename) → the sibling
// .auto-img-regen, and clicks it — reusing mvu-helper's own regen handler with zero reimplementation. A hidden
// element still fires its click listeners under a programmatic dispatch, so it works even with the row hidden.
//
// WHEN NOTHING IS ON THE STAGE TO MATCH, the newest rendered image is regenerated instead — see
// newestImageRegenControl() for why that is an aspect-ratio fix and not just a convenience. galgame exposes no
// scene name (no SpriteManager global, no data-* on the bg layers — verified live 2026-07-28), so the displayed
// backdrop's URL is the only handle we get; when it is absent there is nothing to be precise WITH, and the log
// line names the newest image as the target.
//
// AFTER THE SWAP. mvu-helper splices the new <img> into the message and announces MESSAGE_UPDATED; the
// beat-shaper renames the scene and the image-seam files the new URL under it. galgame then repaints its stage
// for ONE floor only — the newest AI reply (its process-message.js skips every other floor with
// "不是最后一条AI消息，跳过全局UI更新"). A player reading back regenerates the backdrop they are looking at and the
// stage keeps the old picture. So a fired regenerate is remembered (floor, position, old src) and, when that
// floor announces the swap, image-regen-core decides: galgame's floor → leave it; an older floor still showing
// the old image → paint the new one onto galgame's layers ourselves, in galgame's own sequence (paintStage).

import { DOC, topWindow, log } from '../../env.js';
import { currentBgUrl } from './image-viewer.js';
import { BACKDROP_URL_VARIABLE } from './image-viewer-core.js';
import { basename, cssUrlValue, decideRegenRepaint } from './image-regen-core.js';
import { displayedFloor } from '../galgame-bridge/index.js';

const OVERLAY_SEL = '#gal-global-overlay';
const BTN_CLASS = 'school-imgregen-btn';
// Class matched by SUBSTRING because mvu-helper's classes reach the live DOM prefixed (custom-auto-img-wrap /
// custom-auto-img-regen — ST's sanitizer) while the raw tag is auto-img-* — [class*=…] catches both.
const WRAP_SEL = '[class*="auto-img-wrap"]';
const REGEN_SEL = '[class*="auto-img-regen"]';
// galgame's backdrop stack: .gal-layer-bg holds .gal-bg-base (the settled image) and .gal-bg-front (a cross-fade's
// target); the URL sits in the BACKDROP_URL_VARIABLE on each (galgame src/db/image-packs.js).
const BG_LAYER_SEL = '#gal-global-overlay .gal-layer-bg';
const BG_BASE_SEL = '.gal-bg-base';
const BG_FRONT_SEL = '.gal-bg-front';
// galgame's cross-fade length (galgame src/core/constants.js BG_TRANSITION_MS); the settle step runs after it.
const BG_TRANSITION_MS = 900;
// A fired regenerate whose floor never announces a swap is forgotten after this long (mvu-helper toasts its
// own failures; this only stops a stale record from claiming some later edit of that floor).
const PENDING_SWAP_MS = 10 * 60 * 1000;

// The floor a message-row element belongs to, or -1.
function floorOf(el) {
  const mes = el && el.closest('.mes');
  const n = Number(mes && mes.getAttribute('mesid'));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

function wrapsOf(floor) {
  return Array.from(DOC.querySelectorAll(`.mes[mesid="${floor}"] ${WRAP_SEL}`));
}

function imgSrcOf(wrap) {
  const img = wrap && wrap.querySelector('img');
  return img ? (img.getAttribute('src') || img.src || null) : null;
}

// The newest AI floor — the one floor galgame repaints its stage for. Read the way galgame reads it
// (`$mes.nextAll('.mes[is_user!="true"]').length === 0`, process-message.js): off the rendered rows.
function lastAiFloor() {
  const rows = DOC.querySelectorAll('#chat > .mes:not([is_user="true"])');
  return rows.length ? floorOf(rows[rows.length - 1]) : -1;
}

// A regen control plus what image-regen must remember about it: which floor, which position among that
// floor's images (two images can share a URL — DOM order is text order, as mvu-helper's own swap relies on),
// and the src it sat beside.
function controlOf(wrap) {
  const regen = wrap && wrap.querySelector(REGEN_SEL);
  if (!regen) return null;
  const floor = floorOf(wrap);
  return { regen, floor, ordinal: floor >= 0 ? wrapsOf(floor).indexOf(wrap) : -1, src: imgSrcOf(wrap) };
}

// The regen control for the image currently shown as galgame's backdrop (matched by filename).
function regenForCurrentBg() {
  const target = basename(currentBgUrl());
  if (!target) return null;
  for (const img of DOC.querySelectorAll(`${WRAP_SEL} img`)) {
    if (basename(img.getAttribute('src') || img.src) === target) {
      const control = controlOf(img.closest(WRAP_SEL));
      if (control) return control;
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
// regen control — so the newest wrap in the chat is quite often not the newest IMAGE.
function newestImageRegenControl() {
  const wraps = DOC.querySelectorAll(WRAP_SEL);
  for (let i = wraps.length - 1; i >= 0; i--) {
    const control = controlOf(wraps[i]);
    if (control) return control;
  }
  return null;
}

// The regenerate most recently fired and not yet seen to land: { floor, ordinal, oldSrc, at }.
let pendingSwap = null;

function fireRegen(btn) {
  // Prefer the image actually on screen; fall back to the newest one when nothing is displayed.
  let control = regenForCurrentBg();
  let target = 'the current backdrop';
  if (!control) {
    control = newestImageRegenControl();
    target = 'the NEWEST image — no backdrop was on screen to match (deleted from the Background Manager?)';
  }
  if (!control) { log.warn('image-regen: no generated image in this chat to regenerate — nothing to do'); return false; }
  control.regen.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // reuse mvu-helper's own handler
  // Name the target explicitly: on the fallback path this is NOT necessarily the beat the player meant,
  // and a silent "triggered" line would leave them guessing which image just changed.
  log.image(`image-regen: triggered regenerate for ${target} (floor ${control.floor}, image #${control.ordinal + 1}, ${basename(control.src)})`);
  if (control.floor >= 0 && control.ordinal >= 0 && control.src) {
    pendingSwap = { floor: control.floor, ordinal: control.ordinal, oldSrc: control.src, at: Date.now() };
  } else {
    pendingSwap = null;
    log.warn(`image-regen: the regenerated image's floor/position could not be read (floor ${control.floor}, position ${control.ordinal}) — the stage will not be repainted for it`);
  }
  // Brief spin as "triggered" feedback — the image swaps in when generation finishes.
  if (btn) { btn.classList.add('is-spinning'); setTimeout(() => btn.classList.remove('is-spinning'), 2000); }
  return true;
}

// galgame's own paint sequence (src/db/image-packs.js setBackgroundWithTransition), applied to its layers: the
// front layer takes the URL and fades in over the base, then the base takes it and the front clears. Its
// bookkeeping is kept too — `bgCurrentUrl` is galgame's dedupe key (its next render of this URL is a no-op
// instead of a second cross-fade of the same picture) and `bgTransitionToken` is how a newer transition
// cancels an older one's settle step, ours or galgame's. Both are jQuery data on the layer, in the top
// window's jQuery, which is the instance galgame itself uses.
function paintStage(url) {
  const layer = DOC.querySelector(BG_LAYER_SEL);
  const base = layer && layer.querySelector(BG_BASE_SEL);
  const front = layer && layer.querySelector(BG_FRONT_SEL);
  if (!layer || !base || !front) {
    log.warn('image-regen: galgame\'s backdrop layers (.gal-layer-bg > .gal-bg-base + .gal-bg-front) are not on the stage — its layer contract changed; stage not repainted');
    return false;
  }
  const jq = topWindow.jQuery;
  if (typeof jq !== 'function') {
    log.warn('image-regen: the top window has no jQuery, so galgame\'s bgCurrentUrl bookkeeping cannot be kept — stage not repainted');
    return false;
  }
  const $layer = jq(layer);
  const css = cssUrlValue(url);
  $layer.data('bgCurrentUrl', url);
  layer.querySelectorAll('.gal-gen-indicator').forEach((node) => node.remove());
  front.classList.remove('is-active');
  front.style.setProperty(BACKDROP_URL_VARIABLE, css);
  void front.offsetHeight;
  const token = `companion_${Date.now()}_${Math.random()}`;
  $layer.data('bgTransitionToken', token);
  layer.classList.remove('bg-transitioning');
  void layer.offsetHeight;
  layer.classList.add('bg-transitioning');
  front.classList.add('is-active');
  topWindow.setTimeout(() => {
    if ($layer.data('bgTransitionToken') !== token) return; // a newer transition owns the settle
    base.style.setProperty(BACKDROP_URL_VARIABLE, css);
    front.classList.remove('is-active');
    front.style.removeProperty(BACKDROP_URL_VARIABLE);
    layer.classList.remove('bg-transitioning');
  }, BG_TRANSITION_MS);
  return true;
}

// mvu-helper announces the swap on the regenerated floor (its reply write: swipe · render · announce · save),
// after the beat-shaper and the seam have had their turn — listeners run in registration order and this one
// registers last.
function onMessageUpdated(id) {
  if (!pendingSwap) return;
  const floor = Number(id);
  if (floor !== pendingSwap.floor) return;
  if (Date.now() - pendingSwap.at > PENDING_SWAP_MS) {
    log.image(`image-regen: forgot the regenerate fired on floor ${floor} ${Math.round((Date.now() - pendingSwap.at) / 60000)} min ago — it never announced a swap`);
    pendingSwap = null;
    return;
  }
  const wrap = wrapsOf(floor)[pendingSwap.ordinal];
  if (!wrap) {
    log.warn(`image-regen: floor ${floor} no longer has an image at position ${pendingSwap.ordinal + 1} — the regenerated image cannot be located; stage not repainted`);
    pendingSwap = null;
    return;
  }
  const newSrc = imgSrcOf(wrap);
  const decision = decideRegenRepaint({
    floor, lastAiFloor: lastAiFloor(), stageFloor: displayedFloor(), displayedUrl: currentBgUrl(), oldSrc: pendingSwap.oldSrc, newSrc,
  });
  if (!decision.landed) {
    log.image(`image-regen: floor ${floor} changed but ${decision.reason} — still waiting for the swap`);
    return;
  }
  pendingSwap = null;
  if (!decision.repaint) {
    log.image(`image-regen: regenerated image ${basename(newSrc)} landed on floor ${floor} — ${decision.reason}`);
    return;
  }
  if (paintStage(newSrc)) log.image(`image-regen: stage repainted with ${basename(newSrc)} — ${decision.reason}`);
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
  const te = window.tavern_events || {};
  if (typeof window.eventOn === 'function' && te.MESSAGE_UPDATED) {
    try { window.eventOn(te.MESSAGE_UPDATED, onMessageUpdated); }
    catch (e) { log.warn('image-regen: eventOn(MESSAGE_UPDATED) failed — the stage will not repaint after a regenerate on an older floor:', e); }
  } else {
    log.warn('image-regen: eventOn / tavern_events.MESSAGE_UPDATED are not on this window — the stage will not repaint after a regenerate on an older floor');
  }
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
