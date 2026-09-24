// galgame-companion · image-regen-core — whether a regenerated image must be painted onto the stage by us. v0.1
//
// PURE (no host imports; tested by tests/image-regen-core.test.js). galgame repaints its stage for ONE
// floor only: the newest AI reply (galgame src/ui/process-message.js — every other floor logs
// "不是最后一条AI消息，跳过全局UI更新"). A player reading back through the chat regenerates the backdrop
// they are looking at, mvu-helper swaps the <img>, the beat-shaper renames the scene, the seam files
// the new URL — and the stage keeps the old picture, because nothing galgame owns repaints an older
// floor. That decision — repaint ourselves, or leave it to galgame, or nothing changed — lives here.

// Filename only — the backdrop URL galgame wrote (relative) and the <img src> (maybe absolute, maybe
// with a query) share the same unique timestamped basename, so identity is compared on that.
export function basename(url) {
  return String(url || '').split('/').pop().split('?')[0];
}

// A URL as galgame writes it into its layer variable (galgame src/db/image-packs.js toCssUrlValue).
export function cssUrlValue(url) {
  const safe = String(url || '').replace(/[\r\n]/g, '').replace(/[\\"]/g, '\\$&');
  return `url("${safe}")`;
}

/**
 * What to do once the floor a regenerate was fired on announces a text change.
 *
 * @param {object} args
 * @param {number} args.floor        the floor the regenerate control belonged to
 * @param {number} args.lastAiFloor  the newest AI floor (galgame repaints only this one); -1 when unknown
 * @param {number} args.stageFloor   the floor galgame's stage is showing; -1 when it has not stamped one
 * @param {?string} args.displayedUrl the backdrop URL on the stage right now
 * @param {string} args.oldSrc       the <img src> the control sat beside when it was clicked
 * @param {?string} args.newSrc      the <img src> at the same position now
 * @returns {{repaint: boolean, landed: boolean, reason: string}}
 *   landed — the image at that position changed, so the regenerate is finished either way.
 */
export function decideRegenRepaint({ floor, lastAiFloor, stageFloor, displayedUrl, oldSrc, newSrc }) {
  if (!newSrc || basename(newSrc) === basename(oldSrc)) {
    return { repaint: false, landed: false, reason: 'the image at that position has not changed yet' };
  }
  if (floor === lastAiFloor) {
    return { repaint: false, landed: true, reason: `floor ${floor} is the newest AI floor — galgame repaints it itself` };
  }
  if (stageFloor !== floor) {
    return { repaint: false, landed: true, reason: `the stage shows floor ${stageFloor}, not floor ${floor}` };
  }
  if (basename(displayedUrl) !== basename(oldSrc)) {
    return { repaint: false, landed: true, reason: 'the stage no longer shows the image that was regenerated' };
  }
  return { repaint: true, landed: true, reason: `floor ${floor} is not the newest AI floor, so galgame leaves its stage as it was` };
}
