// galgame-companion · generating-indicator — own the visible window of galgame's "正在生成内容…"
// (Generating) popup: up when the turn starts, down when the turn is finished. v0.1
//
// WHAT THIS REPLACES, AND WHY THE OLD SHAPE COULD NOT WORK. This file used to be a GUARD: galgame
// latched the indicator on with no generation running (a load-time race, or its own 120s self-heal),
// so we cleared it whenever SillyTavern read idle. That treated the symptom and inherited the real
// defect — "idle" was measured from ST alone (`is_send_press`, `streamingProcessor`, a tracked loud
// GENERATION_STARTED), and mvu-helper's PRE and POST passes are INVISIBLE to all three: they run
// through ConnectionManagerRequestService, which is not an ST generation. So during the ~2s PRE pass
// and the entire POST pass, ST reads idle and the 750ms poll wiped the popup while the turn was very
// much still working. Clearing it faster was never going to fix "it is up at the wrong moment".
//
// THE WINDOW, END TO END. mvu-helper now publishes its phases (TURN_PHASE_EVENT, refcounted, one
// `busy:true` on the first phase open and one `busy:false` when the last closes). Laid against ST's
// own state they tile with no gap:
//
//     PRE pass ──────────┐                                   ┌────── POST pass
//     (phase open)       │  main generation (ST busy flags)  │      (phase open)
//     ───────────────────┴───────────────────────────────────┴──────────────────▶
//
// PRE runs inside ST's generate interceptor, and POST is fired from MESSAGE_RECEIVED — which lands
// BEFORE GENERATION_ENDED clears `is_send_press`. So `phase open OR ST busy` is continuous from the
// first PRE to the last POST, and needs no grace period pretending to be a signal.
//
// ANY NUMBER OF PRE AND POST. The refcount lives on mvu-helper's side, so a pass with five calls and
// a pass with one look identical here: this file sees one open and one close per turn.
//
// WE OWN BOTH EDGES. galgame only ever shows the popup on GENERATION_STARTED (enhanced-mode.js) or a
// regenerate click — i.e. never during PRE, which is the half the player most needs to see. So this
// adds `.active` as well as removing it, and RECONCILES on a poll rather than trusting edges alone:
// the same lesson image-seam's ForceImageType latch learned the hard way — an edge-driven flag is
// only ever as correct as the last edge it happened to see, and galgame rebuilds this element.

import { DOC, topWindow, log } from '../../env.js';

const INDICATOR_ID = 'gal-generating-indicator';
const OVERLAY_SEL = '#gal-global-overlay';
const POLL_MS = 750;

// mvu-helper's outward signal (features/small-llm/turn-phase-signal.js). Listened to by NAME — the
// two extensions share an event bus, not a module.
const TURN_PHASE_EVENT = 'mvu_helper_turn_phase';

// LIVENESS CAP, not a fallback. mvu-helper closes each phase in a `finally`, so a throw, an early
// return and an aborted turn all close it; only a request that never settles at all could leave one
// open. That is a defect in mvu-helper, and this cap exists to make it VISIBLE (a named warn) rather
// than to quietly cover it — an indicator stuck on forever is exactly the disease this file cures,
// and inheriting it from the other side would be no better. Sized well above mvu-helper's own bound:
// its per-call timeout defaults to 60s and a pass can run several calls in sequence.
const PHASE_MAX_MS = 300000; // 5 min

let generating = false;        // a REAL (loud, non-dry) ST generation is in flight, per tracked TH events
let phaseOpenAt = 0;           // epoch ms when mvu-helper's first phase opened; 0 = none open
let phaseOverranReported = false;
let indicatorShown = null;     // last state WE wrote — for edge-only logging
let watchedIndicator = null;   // the element our class-observer is attached to (galgame rebuilds it)

/**
 * Is this turn still working — either half of it?
 *
 * Exported because a SECOND consumer needs the same question answered: beat-shaper must tell "still
 * streaming" from "truncated and never coming back" before it repairs an unclosed envelope (§4b).
 * One definition, so the two can never disagree. It deliberately answers TRUE during a POST pass as
 * well: POST is the last writer of the message (it appends the RES_Variable block), so a shaper that
 * "repaired" a reply mid-POST would be rewriting a message still being written.
 */
export function isTurnBusy() {
  return generating || mvuPhaseOpen() || stFlagsBusy();
}

function stFlagsBusy() {
  try {
    if (topWindow.is_send_press) return true;
    const ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
    if (ctx && ctx.streamingProcessor) return true;
  } catch (e) {
    // EXPECTED: getContext can be momentarily unavailable during load — treat as not-busy and let
    // the tracked flags + the next poll decide.
  }
  return false;
}

function mvuPhaseOpen() {
  if (!phaseOpenAt) return false;
  const openFor = Date.now() - phaseOpenAt;
  if (openFor <= PHASE_MAX_MS) return true;
  if (!phaseOverranReported) {
    phaseOverranReported = true;
    log.warn(
      `generating-indicator: mvu-helper has held a turn phase open for ${Math.round(openFor / 1000)}s ` +
      `without closing it (its own per-call timeout is far shorter). Treating the turn as finished so the ` +
      'Generating popup does not hang — but the unclosed phase is a defect on the mvu-helper side, not here.',
    );
  }
  return false;
}

function overlayPresent() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  return Boolean(overlay && overlay.classList.contains('active'));
}

// WATCH THE ELEMENT ITSELF, because galgame writes to it too — and one of its writes lands squarely
// inside our window: resetGenerationState() hides the popup on GENERATION_ENDED, which is the moment
// the POST pass is just getting started. Waiting for the next poll to put it back is a visible
// blink at the same point in every single turn. The observer corrects any foreign write within a
// frame. It cannot loop: reconcile() only writes when the element DISAGREES with the turn state, so
// our own write re-enters once and then agrees.
let classObserver = null;
function watchIndicator(el) {
  if (el === watchedIndicator) return;
  if (classObserver) classObserver.disconnect();
  watchedIndicator = el;
  if (!el) return;
  try {
    classObserver = new MutationObserver(() => reconcile());
    classObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
  } catch (e) {
    classObserver = null;
    watchedIndicator = null;
    log.warn('generating-indicator: could not watch the popup for foreign class writes — galgame hiding it mid-POST will now blink until the next poll:', e);
  }
}

// Read what is on screen, look at what the turn is actually doing, write only on disagreement.
function reconcile() {
  const el = DOC.getElementById(INDICATOR_ID);
  watchIndicator(el); // galgame rebuilds the overlay — re-attach to whatever element is current
  if (!el) return;
  const busy = isTurnBusy();
  const isShown = el.classList.contains('active');
  // Only SHOW while the overlay is up: the popup lives inside it, so lighting it for a chat the
  // player is reading in plain SillyTavern would be a class nobody can see, left behind for the next
  // time they open galgame. Hiding is unconditional — a stale `.active` must go either way.
  if (busy && !overlayPresent()) return;
  if (busy === isShown) return;
  el.classList.toggle('active', busy);
  if (indicatorShown !== busy) {
    indicatorShown = busy;
    log.info(`generating-indicator: ${busy ? 'shown (turn in flight)' : 'hidden (turn finished)'}`);
  }
}

export function startGeneratingIndicator() {
  const te = window.tavern_events || {};
  const on = typeof window.eventOn === 'function' ? window.eventOn : null;
  if (!on) {
    log.warn('generating-indicator: TH eventOn absent — no PRE/POST or generation signal; relying on ST live flags only');
  } else {
    // mvu-helper's PRE/POST window. Bound FIRST: it is the half nothing else can see.
    try {
      on(TURN_PHASE_EVENT, (payload) => {
        const busy = Boolean(payload && payload.busy);
        phaseOpenAt = busy ? Date.now() : 0;
        if (busy) phaseOverranReported = false;
        log.info(`generating-indicator: mvu-helper turn phase ${busy ? 'OPEN' : 'closed'} (${(payload && payload.phase) || '?'})`);
        reconcile();
      });
    } catch (e) {
      log.warn(`generating-indicator: bind ${TURN_PHASE_EVENT} failed — the PRE/POST half of the turn will be invisible:`, e);
    }

    // ST's own main generation. Mirror galgame's filter: dry-run (prompt build) and background
    // 'quiet' gens are not a turn of the story — the same guard mvu-helper's PRE pass applies.
    if (te.GENERATION_STARTED) {
      try {
        on(te.GENERATION_STARTED, (type, option, dryRun) => {
          if (dryRun) return;
          if (type === 'quiet' && !(option && option.quietToLoud)) return;
          generating = true;
          reconcile();
        });
      } catch (e) { log.warn('generating-indicator: bind GENERATION_STARTED failed:', e); }
    }
    for (const ev of [te.GENERATION_ENDED, te.GENERATION_STOPPED]) {
      if (!ev) continue;
      try { on(ev, () => { generating = false; reconcile(); }); }
      catch (e) { log.warn('generating-indicator: bind end/stop failed:', e); }
    }
  }

  // The reconcile loop. Not a fallback for the events above but the mechanism that survives them:
  // galgame rebuilds this element (new overlay, skin switch), it shows the popup on its own for
  // reasons of its own, and an edge we never saw would otherwise stand forever.
  (topWindow.setInterval || setInterval)(reconcile, POLL_MS);
  reconcile(); // immediate pass for the reload-stuck case

  log.info('generating-indicator active');
}
