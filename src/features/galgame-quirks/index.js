// features/galgame-quirks — workarounds for galgame misbehaviour we can't fix upstream
// (it is imported from CDN untouched, GCP §1): leaked native fullscreen on "quit mode",
// and a "Generating" indicator that latches with no real generation.
//
// currentFullscreenEl is exported because image/ and menu/ must not mount over a
// fullscreen element — the quirk owns that state, so it owns the query.
export { startFullscreenGuard, currentFullscreenEl } from './fullscreen-guard.js';
// isSillyTavernBusy is the quirk's OTHER export: it owns the one definition of "a real generation
// is in flight" (tracked loud GENERATION_STARTED + ST's live flags, dry-run/quiet filtered out).
// beat-shaper needs the same answer to tell a streaming reply from a truncated one.
export { startGeneratingGuard, isSillyTavernBusy } from './generating-guard.js';
