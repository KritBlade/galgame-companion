// features/beat-shaper — dumb-terminal C1: <p>-wrap the prose and inject a msg-scoped
// <background scene> per image.
//
// SCENE_NAME_RE is exported for image/: the seam filters on msg-scoped scene names, which
// THIS feature defines. Shared regex, one definition — not a leak.
export { startBeatShaper } from './beat-shaper.js';
export { SCENE_NAME_RE } from './beat-shaper-core.js';
