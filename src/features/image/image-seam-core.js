// galgame-companion · image-seam-core — PURE key-selection for the backdrop store (no DOM/IndexedDB). v0.1
//
// The image-seam DELETES rows out of galgame's own global background DB, so "which keys go" is the one
// decision in this feature that must never be wrong: over-delete and the player loses backdrops from a
// chat we were never asked to touch. Both predicates live here, pure and unit-tested, while image-seam.js
// keeps only the IndexedDB plumbing that calls them.
//
// Naming contract they both key off: beat-shaper-core §2.1.

import {
  SCENE_NAME_RE, LEGACY_SCENE_NAME_RE, chatKeyOfSceneName, hashOfSceneName, shortHash,
} from '../beat-shaper/index.js';

// HTML-attribute-unescape a src (mvu-helper writes it via escapeHtmlAttribute; a URL with query
// params would carry &amp; etc. — galgame needs the real URL). NOTE the ordering below: the hash is
// taken from the RAW attribute text, the url is stored DECODED, because the beat-shaper hashed the
// raw text when it minted the name.
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");
}

const RE_SCENE_OR_IMG = /<background\s+scene="([^"]+)"|<img\b[^>]*\bsrc="([^"]+)"/gi;

/**
 * Bind each rendered <img> to its <background scene> BY IMAGE HASH — never by document position.
 *
 * WHY NOT POSITION (live bug, 2026-08-02): this used to bind an image to the nearest scene tag
 * BEFORE it, which is the INVERSE of how the beat-shaper assigns them. The shaper gives a beat the
 * nearest image AFTER it and opens that run with the scene tag; when the model tail-clusters its
 * <pic> tags (all prose, then every image at the end) EVERY image sits after EVERY scene tag, so
 * they all bound to the LAST scene, each overwriting the previous. Result: scene_1 was never
 * written at all and the first half of the reply had no backdrop, while image #1 was orphaned.
 * Intermittent by nature — it only bit when the model clustered, which is why interspersed replies
 * had always looked fine.
 *
 * The name already carries the answer: `{uid}_scene_{n}_{shortHash(src)}`. Hashing the img src and
 * matching that suffix is exact, position-independent, and cannot drift from the shaper's own
 * ownership map — the two modules now agree by construction instead of by coincidence.
 *
 * A hash may legitimately map to SEVERAL scenes (the same image bound to more than one beat run);
 * every one of them is returned, since each needs the same url.
 *
 * @param {string} rawMes  the message's raw text
 * @returns {{ pairs: {scene: string, url: string}[], unmatchedImages: number, foreignScenes: number }}
 *   `foreignScenes` counts scene tags that are not our uid-scoped names (a not-yet-shaped message,
 *   or a narrator/galgame-COT name) — the caller logs it as "waiting for beat-shaper" rather than
 *   writing a name the prune's safety rule could never delete again.
 */
export function pairImagesToScenes(rawMes) {
  const scenesByHash = new Map();   // hash → [sceneName, …]
  const images = [];                // { hash, url }
  let foreignScenes = 0;

  RE_SCENE_OR_IMG.lastIndex = 0;
  let m;
  while ((m = RE_SCENE_OR_IMG.exec(String(rawMes || ''))) !== null) {
    if (m[1] != null) {
      const scene = m[1].trim();
      if (!SCENE_NAME_RE.test(scene)) { foreignScenes++; continue; }
      const hash = hashOfSceneName(scene);
      if (!scenesByHash.has(hash)) scenesByHash.set(hash, []);
      scenesByHash.get(hash).push(scene);
    } else if (m[2] != null) {
      const rawSrc = m[2].trim();
      images.push({ hash: shortHash(rawSrc), url: decodeEntities(rawSrc) });
    }
  }

  const pairs = [];
  let unmatchedImages = 0;
  for (const img of images) {
    const scenes = scenesByHash.get(img.hash);
    // No scene carries this image's hash: either the shaper has not run yet (its re-render fires
    // CHARACTER_MESSAGE_RENDERED and this scan repeats), or the <img> is not one the shaper named
    // (a hand-pasted image). Both mean "not ours to bind" — skip, never guess a scene for it.
    if (!scenes) { unmatchedImages++; continue; }
    for (const scene of scenes) pairs.push({ scene, url: img.url });
  }
  return { pairs, unmatchedImages, foreignScenes };
}

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
