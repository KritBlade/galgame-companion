// galgame-companion · generating-guard — clear galgame's "正在生成内容…" (Generating) indicator when
// it gets stuck `.active` with NO generation actually running.
//
// WHY: galgame shows that indicator when it thinks a reply is mid-stream — either the last message
// has no closed </p> (process-message.js) or on GENERATION_STARTED while the overlay is open
// (enhanced-mode.js). On a fresh load / new chat it can latch ON without a matching hide (a load-time
// race: it processes the greeting before the DOM has settled). Its ONLY self-heal is a ~120s timeout,
// so the toast hangs over the greeting for up to two minutes. We can't reach galgame's internal
// gen-state (module-scoped inside its iframe), but the indicator ELEMENT lives in the PARENT document
// and galgame shows/hides it purely via the `.active` class — so the companion (the bridge) clears
// that class whenever SillyTavern is provably idle. galgame itself is untouched (GCP dumb-terminal).
//
// SAFETY: NEVER hide it while a real generation runs. "Busy" = a tracked loud GENERATION_STARTED is
// in flight, OR ST's own is_send_press / streamingProcessor is set. We mirror galgame's own filter
// (ignore dry-run prompt-builds + background 'quiet' gens) so those never count as generating.

import { DOC, topWindow, log } from '../../env.js';

const INDICATOR_ID = 'gal-generating-indicator';
const POLL_MS = 750;

let generating = false; // a REAL (loud, non-dry) generation is in flight, per tracked TH events

function stBusy() {
  if (generating) return true;
  try {
    if (topWindow.is_send_press) return true;
    const ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
    if (ctx && ctx.streamingProcessor) return true;
  } catch (e) {
    // EXPECTED: getContext can be momentarily unavailable during load — treat as not-busy and let
    // the tracked `generating` flag + the next poll decide.
  }
  return false;
}

function clearIfStuck() {
  const el = DOC.getElementById(INDICATOR_ID);
  if (!el || !el.classList.contains('active')) return;
  if (stBusy()) return; // a real generation owns it — leave alone
  el.classList.remove('active');
  log.info('generating-guard: cleared a stuck Generating indicator (ST idle, no generation)');
}

export function startGeneratingGuard() {
  // Track REAL generations via TH events so we never fight a live one. Mirror galgame's own filter:
  // dry-run (prompt build) and background 'quiet' gens do NOT count as generating.
  const te = window.tavern_events || {};
  const on = typeof window.eventOn === 'function' ? window.eventOn : null;
  if (on) {
    if (te.GENERATION_STARTED) {
      try {
        on(te.GENERATION_STARTED, (type, option, dry_run) => {
          if (dry_run) return;
          if (type === 'quiet' && !(option && option.quietToLoud)) return;
          generating = true;
        });
      } catch (e) { log.warn('generating-guard: bind GENERATION_STARTED failed:', e); }
    }
    for (const ev of [te.GENERATION_ENDED, te.GENERATION_STOPPED]) {
      if (ev) {
        try { on(ev, () => { generating = false; clearIfStuck(); }); }
        catch (e) { log.warn('generating-guard: bind end/stop failed:', e); }
      }
    }
  } else {
    log.warn('generating-guard: TH eventOn absent — relying on ST live flags only');
  }

  // Poll: a stuck indicator (pre-load race or an unmatched show) clears within POLL_MS once idle.
  (topWindow.setInterval || setInterval)(clearIfStuck, POLL_MS);
  clearIfStuck(); // immediate pass for the reload-stuck case

  log.info('generating-guard active');
}
