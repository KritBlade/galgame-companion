// galgame-companion · fullscreen-guard — release native fullscreen when galgame mode is quit.
//
// THE BUG (galgame upstream, reproduced live 2026-07-15): galgame's fullscreen toggle enters
// native fullscreen via `overlay.requestFullscreen()` on #gal-global-overlay. Its "quit mode"
// handler (events.js `[data-action="close-mode"]`) tears down the galgame views but NEVER calls
// `document.exitFullscreen()`. So if you quit galgame while still in native fullscreen, the
// browser stays in fullscreen on the now-hidden overlay: SillyTavern's real UI is present in the
// DOM but the fullscreen top-layer renders only the invisible overlay, so every click lands on
// the fullscreen backdrop — the page looks frozen behind an invisible blocker.
//
// We can't edit galgame (imported untouched from CDN, auto-updates), so the companion patches the
// symptom: when the quit button is clicked, if the document is still in native fullscreen, exit it.
// exitFullscreen needs no user gesture (only ENTERING does), and we're inside a click anyway.

import { DOC, log } from './env.js';

function currentFullscreenEl() {
  return DOC.fullscreenElement || DOC.webkitFullscreenElement || DOC.mozFullScreenElement
    || DOC.msFullscreenElement || null;
}

function exitFullscreen() {
  const fn = DOC.exitFullscreen || DOC.webkitExitFullscreen || DOC.mozCancelFullScreen
    || DOC.msExitFullscreen;
  if (!fn) return;
  try {
    const r = fn.call(DOC);
    if (r && typeof r.catch === 'function') {
      r.catch((e) => log.warn('fullscreen-guard: exitFullscreen rejected:', e));
    }
  } catch (e) {
    log.warn('fullscreen-guard: exitFullscreen threw:', e);
  }
}

export function startFullscreenGuard() {
  if (!DOC) { log.warn('fullscreen-guard: no parent document — skipping'); return; }
  // Capture phase so galgame's own delegated `e.stopPropagation()` (bubble) can't hide it from us.
  DOC.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-action="close-mode"]');
    if (!btn) return;
    // Defer to the next tick: let galgame run its quit teardown first, then release fullscreen
    // if it left the document stuck in it.
    setTimeout(() => {
      if (currentFullscreenEl()) {
        log.info('fullscreen-guard: galgame quit while fullscreen — exiting native fullscreen');
        exitFullscreen();
      }
    }, 0);
  }, true);
  log.info('fullscreen-guard active');
}
