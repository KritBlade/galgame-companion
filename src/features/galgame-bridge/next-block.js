// galgame-companion · next-block — surface a game's manual time-advance control on galgame's GUI. v0.9
//
// GENRE-GATED (2026-08-19). A manual block advance is not a universal idea — School has time blocks,
// most genres do not — so both the PATH this drives and WHETHER THE CONTROL EXISTS come from the
// active genre profile (src/genre/). A genre with `advanceControl: null` never renders the chip, which
// is the whole point: this file used to hard-code PendingState.BlockDone, so every card got a button
// that wrote a path only one game owns. The mechanism below is unchanged; only the source of the path
// and the decision to appear at all moved out.
//
// FLAG MIRROR, NOT AN ACTION. Checking the box only SETS the game's flag — nothing advances at click
// time. The engine previews where the advance will land so the narrator writes the reply in the new
// slot, and the resolver commits it at reply-end. So this overlay box drives the game's OWN stat-menu
// checkbox (input[data-bind-checked="<the profile's bindPath>"]) and lets its native handler
// (rt_bindings applyValueUpdate) write the flag; we never write state ourselves. Unchecking just
// clears it — nothing was mutated, so there is no snapshot or undo to manage. The flag auto-clears
// when the resolver consumes it, the real checkbox re-renders from it on each stat-menu redraw, and we
// re-derive our box from that on every rebuild.
//
// COUPLING (shape, not vocabulary): the stat-menu renders per message into TH-message--<id>--0 iframes
// (same-origin srcdoc). We target the NEWEST reply's iframe (highest id) so the flag lands on the
// current turn (schoolv3 concurrency audit). Degrades to a no-op + warn if unreachable — never throws.
// The only game-specific fact — which path that checkbox binds — comes from the genre profile; School's
// PendingState.BlockDone is one example of it, not the contract.

import { DOC, topWindow, log } from '../../env.js';
import { refreshLocationTimePills } from './location-time-bridge.js';
import { activeGenre } from '../../genre/index.js';

const WRAP_CLASS = 'school-nextblock';
const CB_CLASS = 'school-nextblock-cb';
// The stat_data path of the game's own advance flag, from the active genre profile. Read per call
// rather than captured at import: a pack can be installed or switched without reloading this
// companion, and a path frozen at startup would drive the previous genre's checkbox.
// Returns null when the genre has no manual advance — every caller treats that as "no control".
function bindPath() {
  const control = activeGenre().advanceControl;
  return (control && control.bindPath) || null;
}
const OVERLAY_SEL = '#gal-global-overlay';

// A <label> (not a <div>) so a click ANYWHERE on the chip — the "Next" word included — natively forwards to the
// checkbox and toggles it. As a bare <div> only the 16px box itself was clickable; clicking the label read as dead.
function html() {
  const control = activeGenre().advanceControl || {};
  const label = control.label || 'Next';
  const title = control.title || 'Advance to the next segment — uncheck to cancel (until you send a message)';
  return `<label class="${WRAP_CLASS}" title="${title}">` +
    `<span class="school-nextblock-label">${label}</span>` +
    `<input type="checkbox" class="${CB_CLASS}" aria-label="${title}" />` +
    `</label>`;
}

// The NEWEST reply's stat-menu advance checkbox (its iframe holds the current turn's stat_data).
// null if unreachable, or if this genre has no advance control at all.
function findRealCb() {
  const path = bindPath();
  if (!path) return null;
  const doc = (topWindow && topWindow.document) || DOC;
  const frames = [...doc.querySelectorAll('iframe[id^="TH-message--"]')]
    .map((f) => { const m = /^TH-message--(\d+)--/.exec(f.id); return { f, n: m ? Number(m[1]) : -1 }; })
    .filter((x) => x.n >= 0)
    .sort((a, b) => b.n - a.n); // newest reply first
  for (const { f } of frames) {
    try {
      const cb = f.contentDocument && f.contentDocument.querySelector(`input[type="checkbox"][data-bind-checked="${path}"]`);
      if (cb) return cb;
    } catch (e) { /* cross-realm hiccup — try the next iframe */ }
  }
  return null;
}

// The live flag state, read off the game's own checkbox (which reflects the flag). false when unreachable.
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

// Drive the game's own checkbox to `want` and fire its native handler (writes the flag = want — flag
// only, no resolve). Returns the flag state actually achieved (so a failed write reverts our box instead of lying).
//
// ⚠ The bound handler (rt_bindings `el.onclick`) reads `el.checked` AFTER the browser toggles it on click. So to
// land on `want` we PRIME the box to `!want`, then click() → the toggle flips it to `want` and the handler fires
// applyValueUpdate(<flag>, want). Setting checked=want THEN click() would toggle AWAY from want and write the
// opposite (live-caught 2026-07-28 on School: checking our box wrote the flag false).
function setFlag(want) {
  const cb = findRealCb();
  if (!cb) { log.warn(`next-block: real ${bindPath() || '(no advance control for this genre)'} checkbox not found — cannot set the flag`); return false; }
  if (cb.checked !== want) {
    cb.checked = !want;   // prime so the click toggles TO `want`
    cb.click();           // rt_bindings onclick → applyValueUpdate(<flag>, want) — persisted flag write, no advance
  }
  log.info(`next-block: ${bindPath()} flag ` + (want ? 'SET (will advance at reply-end; the engine previews it)' : 'cleared'));
  nudgePills();
  return want;
}

function injectInto() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay || overlay.querySelector(`.${WRAP_CLASS}`)) return false;
  overlay.insertAdjacentHTML('beforeend', html());
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
  // NOT this genre's concept → render nothing at all. Checked here rather than inside injectInto so a
  // genre without an advance control also costs no MutationObserver on the whole overlay subtree.
  // Deliberately re-checked on the retry above, not before it: on a cold start the engine may not have
  // finished loading when this first runs, and a genre resolved too early would be main forever.
  if (!bindPath()) { log.info('next-block: this genre declares no manual advance — control not rendered'); return; }

  // Delegated change handler for OUR checkbox: a pure flag toggle. CHECK → set the flag true, UNCHECK → false.
  // Setting cb.checked here fires no further 'change' (property set), so there's no loop.
  DOC.addEventListener('change', (e) => {
    const cb = e.target && e.target.classList && e.target.classList.contains(CB_CLASS) ? e.target : null;
    if (!cb) return;
    let got = false;
    try { got = setFlag(cb.checked); } catch (err) { log.error('next-block: flag toggle failed:', err); }
    cb.checked = got; // if the write couldn't land, revert the box so it never lies about the flag
  });

  // Re-inject whenever galgame (re)builds its overlay (rAF-batched, like the toolbar watcher). Each inject re-derives
  // the box from the live flag, so a reply that consumes it leaves the box unchecked on galgame's next render.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectInto(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  injectInto();
  log.info(`next-block active (flag model, ${bindPath()})`);
}
