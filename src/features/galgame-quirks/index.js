// features/galgame-quirks — workarounds for galgame misbehaviour we can't fix upstream
// (it is imported from CDN untouched, GCP §1): leaked native fullscreen on "quit mode",
// and a "Generating" popup whose visible window never matched the real turn.
//
// currentFullscreenEl is exported because image/ and menu/ must not mount over a
// fullscreen element — the quirk owns that state, so it owns the query.
export { startFullscreenGuard, currentFullscreenEl } from './fullscreen-guard.js';
// isTurnBusy is the quirk's OTHER export: it owns the one definition of "this turn is still
// working" — ST's own generation AND mvu-helper's PRE/POST passes around it, which fire no ST
// generation event at all. beat-shaper needs the same answer to tell a reply that is still being
// written from one that was truncated and is never coming back.
export { startGeneratingIndicator, isTurnBusy } from './generating-indicator.js';
