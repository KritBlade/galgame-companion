// galgame-companion · next-block — surface a game's manual time-advance control on galgame's GUI. v1.0
//
// GENRE-GATED. A manual block advance is not a universal idea — School has time blocks, most genres
// do not — so both the PATH this drives and WHETHER THE CONTROL EXISTS come from the active genre
// profile (src/genre/). A genre with no advance control renders no chip, which is the point: this
// file used to hard-code PendingState.BlockDone, so every card got a button writing a path only one
// game owns. The decision itself is pure and lives in next-block-core.js.
//
// THE GENRE IS NOT KNOWABLE AT BOOT — read this before adding any startup gate here. mvu-helper's
// engineInfo() answers {name: null} until the logic engine has loaded, and the engine loads on CHAT
// LOAD, long after this script's boot. v0.9 decided the chip's existence ONCE in startNextBlock():
// every session read "no engine", resolved to the default profile, and returned before installing
// anything — so School's control was permanently absent and nothing was left watching to correct it
// (live 2026-08-19, engine load logged 80+ console lines after the companion booted). So NOTHING here
// latches the genre. The observer is installed unconditionally and every injection re-asks; a chip
// stamped with another genre's path is replaced, and a chip whose genre no longer declares a control
// is removed. A genre with no control costs one querySelector per overlay rebuild — the price of not
// having to know, at boot, something that is not knowable at boot.
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
import { advanceControlFor, chipHtml, WRAP_CLASS, CB_CLASS, PATH_ATTR } from './next-block-core.js';

const OVERLAY_SEL = '#gal-global-overlay';

// The live advance control, or null when this genre has none / no engine has answered yet. Read per
// call, never captured: see THE GENRE IS NOT KNOWABLE AT BOOT above.
function control() {
  return advanceControlFor(activeGenre());
}

// The NEWEST reply's stat-menu advance checkbox (its iframe holds the current turn's stat_data).
// null if unreachable, or if this genre has no advance control at all.
function findRealCb() {
  const active = control();
  if (!active) return null;
  const doc = (topWindow && topWindow.document) || DOC;
  const frames = [...doc.querySelectorAll('iframe[id^="TH-message--"]')]
    .map((f) => { const m = /^TH-message--(\d+)--/.exec(f.id); return { f, n: m ? Number(m[1]) : -1 }; })
    .filter((x) => x.n >= 0)
    .sort((a, b) => b.n - a.n); // newest reply first
  for (const { f } of frames) {
    try {
      const cb = f.contentDocument && f.contentDocument.querySelector(`input[type="checkbox"][data-bind-checked="${active.bindPath}"]`);
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
  const active = control();
  const cb = findRealCb();
  if (!cb) { log.warn(`next-block: real ${active ? active.bindPath : '(no advance control for this genre)'} checkbox not found — cannot set the flag`); return false; }
  if (cb.checked !== want) {
    cb.checked = !want;   // prime so the click toggles TO `want`
    cb.click();           // rt_bindings onclick → applyValueUpdate(<flag>, want) — persisted flag write, no advance
  }
  log.info(`next-block: ${active.bindPath} flag ` + (want ? 'SET (will advance at reply-end; the engine previews it)' : 'cleared'));
  nudgePills();
  return want;
}

// Say once, on the first chip we ever render, WHICH path it drives — the answer to "is this button
// wired to the right flag". Repeating it on every overlay rebuild would bury the log instead.
let announced = '';

function injectInto() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay) return false;
  const active = control();
  const existing = overlay.querySelector(`.${WRAP_CLASS}`);

  // No control for the live genre — and REMOVE a chip a previous genre left behind, so the answer is
  // re-derived in both directions rather than only ever gaining.
  if (!active) {
    if (existing) { existing.remove(); log.info('next-block: this genre declares no manual advance — chip removed'); }
    return false;
  }
  // A chip already driving this exact path is current; one driving another path is stale, not current.
  if (existing) {
    if (existing.getAttribute(PATH_ATTR) === active.bindPath) return false;
    existing.remove();
  }

  overlay.insertAdjacentHTML('beforeend', chipHtml(active));
  // Keep the click off galgame's own overlay handlers (this chip lives INSIDE #gal-global-overlay). The label still
  // forwards the click to the checkbox natively — stopPropagation ≠ preventDefault — so it toggles + fires 'change'.
  const chip = overlay.querySelector(`.${WRAP_CLASS}`);
  if (chip) chip.addEventListener('click', (e) => e.stopPropagation());
  // Mirror the live flag on the freshly injected box so it stays consistent across galgame's overlay rebuilds (and
  // reflects RES consuming the flag at reply-end — the real checkbox unchecks, so ours follows on the next rebuild).
  const cb = chip && chip.querySelector(`.${CB_CLASS}`);
  if (cb) cb.checked = readFlag();
  if (announced !== active.bindPath) {
    announced = active.bindPath;
    log.info(`next-block: advance chip rendered for genre "${activeGenre().name}" (flag model, ${active.bindPath})`);
  }
  return true;
}

export function startNextBlock() {
  if (!DOC || !DOC.body) return setTimeout(startNextBlock, 200);

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
  // BOTH the genre and the box's checked state, so an engine that loads after this runs is picked up on the next
  // rebuild, and a reply that consumes the flag leaves the box unchecked on galgame's next render.
  //
  // Watching the whole ST body is what makes the late genre safe: the overlay is only one of the things being
  // rebuilt in there, so "no mutation at all after the engine loads" means nothing is happening on the page.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectInto(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  injectInto();
  log.info('next-block watching (the chip appears once a genre declaring a manual advance is loaded)');
}
