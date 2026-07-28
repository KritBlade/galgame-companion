// galgame-companion · image-seam-core — PURE key-selection for the backdrop store (no DOM/IndexedDB). v0.1
//
// The image-seam DELETES rows out of galgame's own global background DB, so "which keys go" is the one
// decision in this feature that must never be wrong: over-delete and the player loses backdrops from a
// chat we were never asked to touch. Both predicates live here, pure and unit-tested, while image-seam.js
// keeps only the IndexedDB plumbing that calls them.
//
// Naming contract they both key off: beat-shaper-core §2.1.

import { SCENE_NAME_RE, LEGACY_SCENE_NAME_RE, chatKeyOfSceneName } from '../beat-shaper/index.js';

/**
 * SUPERSEDED siblings of one message: same uid, a beat number, but an image hash the message no longer
 * references (an older swipe/regen of the same beat). Scoped to a single uid, so it can only ever reach
 * the message that owns that uid.
 *
 * @param {string[]} allKeys  every key in the background store
 * @param {string} uid        the owning message's scene uid
 * @param {Set<string>} keep  the scene names that message references RIGHT NOW (must be non-empty —
 *   the caller skips the prune entirely on a transient empty scan, so a mid-stream read cannot wipe)
 * @returns {string[]} keys to delete
 */
export function staleSiblingKeys(allKeys, uid, keep) {
  if (!uid || !keep || keep.size === 0) return [];
  const prefix = `${uid}_scene_`;
  return (allKeys || []).filter(
    (k) => typeof k === 'string' && k.startsWith(prefix) && SCENE_NAME_RE.test(k) && !keep.has(k),
  );
}

/**
 * ORPHANS: records whose message is gone entirely, so no prune will ever reach them.
 *
 * Two things make this safe on a store SHARED by every chat:
 *   - a uid-scoped key is only considered when its chatKey matches the CURRENT chat — another chat's
 *     records are structurally unreachable, no matter what this chat happens to reference;
 *   - pre-uid `msg{index}_*` keys are considered regardless of chat, because nothing mints that shape
 *     any more: an unreferenced one is a leftover of the old index-based naming and dead by construction.
 * Anything else (a narrator-authored scene, a galgame pack name, junk) is never ours and never deleted.
 *
 * @param {string[]} allKeys  every key in the background store
 * @param {Set<string>} liveSceneNames  every scene name referenced anywhere in the loaded chat,
 *   INCLUDING non-active swipes. Must be non-empty; the caller refuses to sweep on an empty/failed read
 *   rather than treat it as "nothing is alive".
 * @param {string} chatKey  the current chat's key (§2.1). Falsy → nothing is deletable.
 * @returns {string[]} keys to delete
 */
export function deadBackgroundKeys(allKeys, liveSceneNames, chatKey) {
  if (!chatKey || !liveSceneNames || liveSceneNames.size === 0) return [];
  return (allKeys || []).filter((k) => {
    if (typeof k !== 'string' || liveSceneNames.has(k)) return false;
    if (LEGACY_SCENE_NAME_RE.test(k)) return true;
    return chatKeyOfSceneName(k) === chatKey;
  });
}
