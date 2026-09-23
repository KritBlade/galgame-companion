// galgame-companion · next-block — surface a game's manual time-advance control on galgame's GUI. v1.1
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
// FLAG, NOT AN ACTION. Checking the box only SETS the game's flag — nothing advances at click time. The
// engine previews where the advance will land so the narrator writes the reply in the new slot, and the
// resolver commits it at reply-end. Unchecking just clears it — nothing was mutated, so there is no
// snapshot or undo to manage. The flag auto-clears when the resolver consumes it, and our box re-reads
// it on every rebuild.
//
// HOW IT IS READ AND WRITTEN. The game's StatusMenu runs in a CONTAINED frame (mvu-helper
// plans/statusmenu-containment.md): an opaque origin, so no host can reach into its document for the
// checkbox this chip used to click. The flag is READ off live stat_data (live-stat-data.js — the same
// newest floor the menu draws from) and WRITTEN by posting the verb the menu's own checkbox posts —
// `setValue` on mvu-helper's published action wire — so the StatusMenu Engine decides what the member
// becomes, exactly as for a click in the menu, and mvu-helper writes it on the newest reply. The only
// game-specific fact — which path — comes from the genre profile; School's PendingState.BlockDone is
// one example of it, not the contract. Degrades to a warn and a reverted box, never a throw.

import { DOC, topWindow, log } from '../../env.js';
import { refreshLocationTimePills } from './location-time-bridge.js';
import { latestStatData } from './live-stat-data.js';
import { activeGenre } from '../../genre/index.js';
import {
  advanceControlFor, chipHtml, flagFromStatData, flagActionRequest, MENU_ACTION_MESSAGE,
  WRAP_CLASS, CB_CLASS, PATH_ATTR,
} from './next-block-core.js';

const OVERLAY_SEL = '#gal-global-overlay';

// The live advance control, or null when this genre has none / no engine has answered yet. Read per
// call, never captured: see THE GENRE IS NOT KNOWABLE AT BOOT above.
function control() {
  return advanceControlFor(activeGenre());
}

// The live flag state, off the newest floor's stat_data. false when there is no control or no state.
function readFlag() {
  const active = control();
  if (!active) return false;
  const live = latestStatData();
  return flagFromStatData(live && live.statData, active.bindPath);
}

// Poke galgame's location/time pills a few times so they catch up to the (async-saved) flag/clock — galgame only
// repaints them on its own render cycle, which a manual flag toggle never triggers.
function nudgePills() {
  [250, 700, 1400].forEach((ms) => setTimeout(() => {
    try { refreshLocationTimePills(); } catch (e) { log.warn('next-block: pill refresh failed:', e); }
  }, ms));
}

// Set the flag to `want` through mvu-helper's action wire, and resolve to the flag state actually
// achieved — so a refused or unanswered write reverts our box instead of lying.
const ACTION_TIMEOUT_MS = 8000;
let actionSeq = 0;
function setFlag(want) {
  const active = control();
  if (!active) { log.warn('next-block: this genre declares no manual advance — nothing to set'); return Promise.resolve(false); }
  return new Promise((resolve) => {
    const request = flagActionRequest(active.bindPath, want, 'next-block-' + (++actionSeq) + '-' + Date.now());
    const done = (achieved, why) => {
      clearTimeout(timer);
      window.removeEventListener('message', onReply);
      if (why) log.warn(`next-block: ${active.bindPath} flag NOT ${want ? 'set' : 'cleared'} — ${why}`);
      else log.info(`next-block: ${active.bindPath} flag ` + (want ? 'SET (will advance at reply-end; the engine previews it)' : 'cleared'));
      nudgePills();
      resolve(achieved);
    };
    const timer = setTimeout(() => done(readFlag(), 'mvu-helper did not answer within ' + (ACTION_TIMEOUT_MS / 1000) + 's (is it installed and enabled?)'), ACTION_TIMEOUT_MS);
    function onReply(event) {
      const data = event && event.data;
      if (!data || data.type !== MENU_ACTION_MESSAGE + '-result' || data.requestId !== request.requestId) return;
      if (data.ok) done(want, '');
      else done(readFlag(), data.reason || 'refused');
    }
    window.addEventListener('message', onReply);
    topWindow.postMessage(request, '*');
  });
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
    const want = cb.checked;
    cb.disabled = true;   // one write in flight; the box answers when the host does
    setFlag(want)
      .then((got) => { cb.checked = got; })   // a write that did not land reverts the box, so it never lies about the flag
      .catch((err) => { log.error('next-block: flag toggle failed:', err); cb.checked = readFlag(); })
      .finally(() => { cb.disabled = false; });
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
