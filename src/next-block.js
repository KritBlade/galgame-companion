// galgame-companion · next-block — surface the engine's manual "Next-Block" control on galgame's GUI. v0.6
//
// School v3 advances the in-game clock a time-block when World_Calc.BlockDone is set true — the player's
// counterpart to the AI's /Intent/sceneAdvance. The MvuStatMenuBuilder stat-menu has a "Next-Block"
// checkbox bound to World_Calc.BlockDone whose wired handler does applyValueUpdate + window.__resolveTurn
// (an IMMEDIATE clock advance — wire_resolver patchImmediateNextBlock). Users hide most of that menu, so
// we surface JUST this control on galgame's overlay (top-right, under the fullscreen button) and DRIVE
// THE REAL checkbox — checking it reuses the entire wired handler (immediate advance + correct save
// target) with zero reimplementation of the engine's turn logic. Nothing about resolution lives here.
//
// UX — a REVERSIBLE toggle (check = advance, uncheck = undo):
//   • CHECK  → snapshot the reply's current stat_data, then advance ONE block (immediate + persisted, so the
//              next reply's Window A already sits on the new block — no 1-reply desync).
//   • UNCHECK→ restore that snapshot via the reply's exposed window.saveStatData = UNDO the advance, back to
//              where the turn started.
//   • A new reply generating COMMITS the turn: the snapshot is cleared (undo no longer possible) and the box
//              resets to empty for the fresh turn.
// The engine is forward-only (an advance mutates Date/Weekday/Weather/day-events/counters — no inverse), so undo
// is a bounded snapshot-restore: it only reaches back to the turn's starting block, and only BEFORE a message is
// sent, so nothing else has changed in between → no corrupt-state risk. One advance per turn through this box
// (multi-block = advance, send, advance again next turn).
//
// COUPLING: the stat-menu renders per message into TH-message--<id>--0 iframes (same-origin srcdoc); the
// checkbox is input[data-bind-checked="World_Calc.BlockDone"], and each iframe exposes saveStatData on its window
// (wire_resolver). We target the NEWEST reply's iframe (highest id) so both advance and undo hit the current turn,
// not an old snapshot (schoolv3 concurrency audit). Degrades to a no-op + warn if unreachable — never throws.

import { DOC, topWindow, log } from './env.js';
import { refreshLocationTimePills } from './location-time-bridge.js';

const WRAP_CLASS = 'school-nextblock';
const CB_CLASS = 'school-nextblock-cb';
const BIND_PATH = 'World_Calc.BlockDone';
const OVERLAY_SEL = '#gal-global-overlay';

// UNDO STATE (display + data): the pre-advance stat_data snapshot for the current turn, and the message it
// belongs to. snapshot != null ⟺ an advance is active this turn ⟺ our box is checked. Cleared on undo or on a
// new generation. Survives galgame overlay rebuilds — injectInto re-derives the box's checked state from it.
let snapshot = null;
let snapshotMid = -1;

// A <label> (not a <div>) so a click ANYWHERE on the chip — the "Next" word included — natively forwards to the
// checkbox and toggles it. As a bare <div> only the 16px box itself was clickable; clicking the label read as dead.
const HTML =
  `<label class="${WRAP_CLASS}" title="Advance one time block — uncheck to undo (until you send a message)">` +
  `<span class="school-nextblock-label">Next</span>` +
  `<input type="checkbox" class="${CB_CLASS}" aria-label="Advance one time block; uncheck to undo" />` +
  `</label>`;

// The NEWEST reply's stat-menu: its BlockDone checkbox, its iframe window (exposes saveStatData), and its msg id.
function findRealCtx() {
  const doc = (topWindow && topWindow.document) || DOC;
  const frames = [...doc.querySelectorAll('iframe[id^="TH-message--"]')]
    .map((f) => { const m = /^TH-message--(\d+)--/.exec(f.id); return { f, n: m ? Number(m[1]) : -1 }; })
    .filter((x) => x.n >= 0)
    .sort((a, b) => b.n - a.n); // newest reply first
  for (const { f, n } of frames) {
    try {
      const cb = f.contentDocument && f.contentDocument.querySelector(`input[type="checkbox"][data-bind-checked="${BIND_PATH}"]`);
      if (cb) return { cb, win: f.contentWindow, mid: n };
    } catch (e) { /* cross-realm hiccup — try the next iframe */ }
  }
  return null;
}

// Poke galgame's location/time pills a few times so they catch up to the (async-saved) clock — galgame only
// repaints them on its own render cycle, which a manual advance/undo never triggers.
function nudgePills() {
  [250, 700, 1400].forEach((ms) => setTimeout(() => {
    try { refreshLocationTimePills(); } catch (e) { log.warn('next-block: pill refresh failed:', e); }
  }, ms));
}

// CHECK → snapshot the reply's current stat_data (for undo), then advance one block. Returns true if it fired.
function doAdvance() {
  const ctx = findRealCtx();
  if (!ctx) { log.warn('next-block: real World_Calc.BlockDone checkbox not found — cannot advance the clock'); return false; }
  const { cb, mid } = ctx;
  // Snapshot the PRE-advance stat_data (deep copy) so uncheck can restore it. stat_data is plain [value,label]
  // arrays / nested objects — JSON round-trip is a safe deep clone (no functions).
  try {
    const Mvu = topWindow.Mvu;
    const d = Mvu && Mvu.getMvuData ? Mvu.getMvuData({ type: 'message', message_id: mid }) : null;
    snapshot = d && d.stat_data ? JSON.parse(JSON.stringify(d.stat_data)) : null;
    snapshotMid = snapshot ? mid : -1;
  } catch (e) {
    log.warn('next-block: snapshot failed — undo will be unavailable this advance:', e);
    snapshot = null; snapshotMid = -1;
  }
  // Force the real checkbox TRUE then fire its wired handler (applyValueUpdate(BlockDone,true).then(__resolveTurn)
  // = the immediate, persisted advance). Normalizing to false first means a stuck-true BlockDone still re-fires.
  cb.checked = false;
  cb.click();
  log.info('next-block: advancing a time block now (undo ' + (snapshot ? 'armed' : 'UNAVAILABLE') + ')');
  nudgePills();
  return true;
}

// UNCHECK → restore the snapshot via the reply's exposed saveStatData = undo the advance. Returns true if undone.
function doUndo() {
  if (!snapshot || snapshotMid < 0) { log.info('next-block: nothing to undo'); return false; }
  const doc = (topWindow && topWindow.document) || DOC;
  const f = doc.getElementById(`TH-message--${snapshotMid}--0`);
  const win = f && f.contentWindow;
  if (!win || typeof win.saveStatData !== 'function') {
    log.warn('next-block: cannot undo — saveStatData not reachable for msg ' + snapshotMid + ' (advance stands)');
    return false;
  }
  try {
    // Same save path the resolver uses — overwrite the message's stat_data with the pre-advance snapshot.
    win.saveStatData(snapshot, snapshotMid);
    log.info('next-block: undid the advance → restored msg ' + snapshotMid + ' to its pre-advance state');
  } catch (e) { log.error('next-block: undo save failed:', e); return false; }
  snapshot = null; snapshotMid = -1;
  nudgePills();
  return true;
}

// A new reply is generating → the turn is committed: undo is no longer valid. Clear the snapshot + reset the box.
function commitTurn() {
  if (!snapshot && snapshotMid < 0) return;
  snapshot = null; snapshotMid = -1;
  const cb = DOC.querySelector(`.${CB_CLASS}`);
  if (cb) cb.checked = false;
  log.info('next-block: new generation — committed the turn (undo cleared, box reset)');
}

function injectInto() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay || overlay.querySelector(`.${WRAP_CLASS}`)) return false;
  overlay.insertAdjacentHTML('beforeend', HTML);
  // Keep the click off galgame's own overlay handlers (this chip lives INSIDE #gal-global-overlay). The label
  // still forwards the click to the checkbox natively — stopPropagation ≠ preventDefault — so it toggles + fires
  // 'change'. Attached per-injection because the chip is re-created whenever galgame rebuilds the overlay.
  const chip = overlay.querySelector(`.${WRAP_CLASS}`);
  if (chip) chip.addEventListener('click', (e) => e.stopPropagation());
  // Reflect the live undo state on the freshly injected box so a pending advance stays visibly checked across
  // galgame's overlay rebuilds.
  const cb = chip && chip.querySelector(`.${CB_CLASS}`);
  if (cb) cb.checked = (snapshot != null);
  return true;
}

export function startNextBlock() {
  if (!DOC || !DOC.body) return setTimeout(startNextBlock, 200);

  // Delegated change handler for OUR checkbox: a reversible toggle. CHECK → advance (snapshot for undo); UNCHECK
  // → undo. Setting cb.checked here fires no further 'change' (property set), so there's no loop.
  DOC.addEventListener('change', (e) => {
    const cb = e.target && e.target.classList && e.target.classList.contains(CB_CLASS) ? e.target : null;
    if (!cb) return;
    if (cb.checked) {
      let ok = false;
      try { ok = doAdvance(); } catch (err) { log.error('next-block: advance failed:', err); }
      cb.checked = ok; // if the advance couldn't fire, revert the box so it never lies
    } else {
      try { doUndo(); } catch (err) { log.error('next-block: undo failed:', err); }
      cb.checked = false;
    }
  });

  // Commit the turn when a REAL reply starts generating. Mirror galgame's own event filter: dry-run prompt builds
  // and background 'quiet' gens are NOT a new turn.
  const te = window.tavern_events || {};
  const on = typeof window.eventOn === 'function' ? window.eventOn : null;
  if (on && te.GENERATION_STARTED) {
    try {
      on(te.GENERATION_STARTED, (type, option, dry_run) => {
        if (dry_run) return;
        if (type === 'quiet' && !(option && option.quietToLoud)) return;
        commitTurn();
      });
    } catch (e) { log.warn('next-block: bind GENERATION_STARTED failed:', e); }
  } else {
    log.warn('next-block: TH eventOn/GENERATION_STARTED absent — Next box won\'t auto-commit on a new turn');
  }

  // Re-inject whenever galgame (re)builds its overlay (rAF-batched, like the toolbar watcher).
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectInto(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  injectInto();
  log.info('next-block active');
}
