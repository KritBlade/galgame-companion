// galgame-companion · next-block — surface School v4's manual "Next-Block" control on galgame's GUI. v0.8 (flag model)
//
// v4 uses a v1-style FLAG model: checking the box just sets PendingState.BlockDone=true — NOTHING advances at click
// time. The engine's Window A (current_variable_data) PREVIEWS where the advance lands so narrate writes the reply in
// the new time slot, and RES commits Date/Time at reply-end. So this control is a pure FLAG MIRROR: our overlay box
// drives the REAL stat-menu BlockDone checkbox (input[data-bind-checked="PendingState.BlockDone"]) whose native handler
// (rt_bindings applyValueUpdate) writes the flag — no resolve. Uncheck just clears the flag; because nothing was
// mutated there is no snapshot/undo to manage (v3's click-time __resolveTurn + companion snapshot/undo are RETIRED —
// both were iframe-wall workarounds v4 no longer needs). The flag auto-clears when RES consumes it at reply-end; the
// real checkbox re-renders from BlockDone on each stat-menu redraw, and we re-derive our box from it on every rebuild.
//
// COUPLING: the stat-menu renders per message into TH-message--<id>--0 iframes (same-origin srcdoc); the checkbox is
// input[data-bind-checked="PendingState.BlockDone"]. We target the NEWEST reply's iframe (highest id) so the flag lands
// on the current turn (schoolv3 concurrency audit). Degrades to a no-op + warn if unreachable — never throws.

import { DOC, topWindow, log } from '../../env.js';
import { refreshLocationTimePills } from './location-time-bridge.js';

const WRAP_CLASS = 'school-nextblock';
const CB_CLASS = 'school-nextblock-cb';
// EXPORTED for tests/schoolv4-contract-core.mjs — the check needs the literal this file actually uses,
// not a second copy of it typed into the test (a copy drifts, and drift is the bug being guarded).
export const BIND_PATH = 'PendingState.BlockDone';
const OVERLAY_SEL = '#gal-global-overlay';

// A <label> (not a <div>) so a click ANYWHERE on the chip — the "Next" word included — natively forwards to the
// checkbox and toggles it. As a bare <div> only the 16px box itself was clickable; clicking the label read as dead.
const HTML =
  `<label class="${WRAP_CLASS}" title="Advance one time block — uncheck to cancel (until you send a message)">` +
  `<span class="school-nextblock-label">Next</span>` +
  `<input type="checkbox" class="${CB_CLASS}" aria-label="Advance one time block; uncheck to cancel" />` +
  `</label>`;

// The NEWEST reply's stat-menu BlockDone checkbox (its iframe holds the current turn's stat_data). null if unreachable.
function findRealCb() {
  const doc = (topWindow && topWindow.document) || DOC;
  const frames = [...doc.querySelectorAll('iframe[id^="TH-message--"]')]
    .map((f) => { const m = /^TH-message--(\d+)--/.exec(f.id); return { f, n: m ? Number(m[1]) : -1 }; })
    .filter((x) => x.n >= 0)
    .sort((a, b) => b.n - a.n); // newest reply first
  for (const { f } of frames) {
    try {
      const cb = f.contentDocument && f.contentDocument.querySelector(`input[type="checkbox"][data-bind-checked="${BIND_PATH}"]`);
      if (cb) return cb;
    } catch (e) { /* cross-realm hiccup — try the next iframe */ }
  }
  return null;
}

// The live flag state, read off the real checkbox (which reflects PendingState.BlockDone). false when unreachable.
function readFlag() {
  const cb = findRealCb();
  return !!(cb && cb.checked);
}

// Poke galgame's location/time pills a few times so they catch up to the (async-saved) flag/clock — galgame only
// repaints them on its own render cycle, which a manual flag toggle never triggers.
function nudgePills() {
  [250, 700, 1400].forEach((ms) => setTimeout(() => {
    try { refreshLocationTimePills(); } catch (e) { log.warn('next-block: pill refresh failed:', e); }
  }, ms));
}

// Drive the real BlockDone checkbox to `want` and fire its native handler (writes PendingState.BlockDone=want — flag
// only, no resolve). Returns the flag state actually achieved (so a failed write reverts our box instead of lying).
//
// ⚠ The bound handler (rt_bindings `el.onclick`) reads `el.checked` AFTER the browser toggles it on click. So to
// land on `want` we PRIME the box to `!want`, then click() → the toggle flips it to `want` and the handler fires
// applyValueUpdate(BlockDone, want). Setting checked=want THEN click() would toggle AWAY from want and write the
// opposite (live-caught 2026-07-28: checking our box wrote BlockDone=false).
function setFlag(want) {
  const cb = findRealCb();
  if (!cb) { log.warn(`next-block: real ${BIND_PATH} checkbox not found — cannot set the flag`); return false; }
  if (cb.checked !== want) {
    cb.checked = !want;   // prime so the click toggles TO `want`
    cb.click();           // rt_bindings onclick → applyValueUpdate(BlockDone, want) — persisted flag write, no advance
  }
  log.info('next-block: BlockDone flag ' + (want ? 'SET (will advance at reply-end; Window A previews it)' : 'cleared'));
  nudgePills();
  return want;
}

function injectInto() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay || overlay.querySelector(`.${WRAP_CLASS}`)) return false;
  overlay.insertAdjacentHTML('beforeend', HTML);
  // Keep the click off galgame's own overlay handlers (this chip lives INSIDE #gal-global-overlay). The label still
  // forwards the click to the checkbox natively — stopPropagation ≠ preventDefault — so it toggles + fires 'change'.
  const chip = overlay.querySelector(`.${WRAP_CLASS}`);
  if (chip) chip.addEventListener('click', (e) => e.stopPropagation());
  // Mirror the live flag on the freshly injected box so it stays consistent across galgame's overlay rebuilds (and
  // reflects RES consuming the flag at reply-end — the real checkbox unchecks, so ours follows on the next rebuild).
  const cb = chip && chip.querySelector(`.${CB_CLASS}`);
  if (cb) cb.checked = readFlag();
  return true;
}

export function startNextBlock() {
  if (!DOC || !DOC.body) return setTimeout(startNextBlock, 200);

  // Delegated change handler for OUR checkbox: a pure flag toggle. CHECK → set BlockDone=true, UNCHECK → false.
  // Setting cb.checked here fires no further 'change' (property set), so there's no loop.
  DOC.addEventListener('change', (e) => {
    const cb = e.target && e.target.classList && e.target.classList.contains(CB_CLASS) ? e.target : null;
    if (!cb) return;
    let got = false;
    try { got = setFlag(cb.checked); } catch (err) { log.error('next-block: flag toggle failed:', err); }
    cb.checked = got; // if the write couldn't land, revert the box so it never lies about the flag
  });

  // Re-inject whenever galgame (re)builds its overlay (rAF-batched, like the toolbar watcher). Each inject re-derives
  // the box from the live flag, so a reply consuming BlockDone leaves the box unchecked on galgame's next render.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectInto(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  injectInto();
  log.info('next-block active (flag model)');
}
