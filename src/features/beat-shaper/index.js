// features/beat-shaper — dumb-terminal C1: <p>-wrap the prose and inject a uid-scoped
// <background scene> per image.
//
// The scene-name pieces are exported for image/: the seam filters, prunes and sweeps galgame's
// background store by the naming contract that THIS feature defines (beat-shaper-core §2.1).
// One definition, consumed through the barrel — shared contract, not a leak.
export { startBeatShaper, currentChatKey } from './beat-shaper.js';
export {
  SCENE_NAME_RE, LEGACY_SCENE_NAME_RE, uidOfSceneName, chatKeyOfSceneName,
} from './beat-shaper-core.js';
