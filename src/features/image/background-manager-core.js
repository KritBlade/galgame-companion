// galgame-companion · background-manager-core — PURE decisions for the Background Manager patch. v0.1
//
// The panel patch itself is host-coupled (parent DOM, IndexedDB, MutationObserver) and no test can
// open it, so the two things it actually DECIDES live here instead: what order the cards go in, and
// what the header count says once some are gone. Both are silent when wrong — a mis-ordered grid
// still looks like a grid, and a stale count still looks like a count — which is precisely why they
// are the parts worth testing.

/**
 * Newest-first order for the cards currently on screen.
 *
 * STABLE in both directions, and that is the contract, not an implementation detail: cards whose
 * record carries no usable timestamp keep galgame's own relative order and sink to the bottom, so a
 * library the companion never wrote (hand-uploaded backgrounds, a built-in pack) is left readable
 * instead of being shuffled into an order nothing explains. Same for exact ties.
 *
 * @param {string[]} sceneNames  the scene names in the order they are rendered
 * @param {Map<string, number>} stamps  sceneName → epoch ms (absent = unknown)
 * @returns {string[]} the same names, newest first
 */
export function sortSceneNamesByRecency(sceneNames, stamps) {
  const names = Array.isArray(sceneNames) ? sceneNames : [];
  const stampOf = (name) => {
    const at = stamps && typeof stamps.get === 'function' ? stamps.get(name) : undefined;
    return Number.isFinite(at) ? at : null;
  };
  return names
    .map((name, position) => ({ name, position, at: stampOf(name) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.position - b.position;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      if (a.at !== b.at) return b.at - a.at;
      return a.position - b.position;
    })
    .map((entry) => entry.name);
}

/**
 * The header stat with its count rewritten, so a bulk delete leaves the panel telling the truth
 * without re-rendering it (galgame rebuilds the whole asset panel to refresh that line, and nothing
 * of that is reachable from here).
 *
 * Rewrites the FIRST run of digits and nothing else, which is what keeps it language-agnostic: the
 * line reads `已保存 55 个背景` upstream and `55 background(s) saved` once our i18n overlay has been
 * over it, and the count is the leading number in both. A line with no digits at all (a shape we do
 * not model) is returned untouched rather than guessed at.
 */
export function restatedCount(text, count) {
  const line = String(text == null ? '' : text);
  if (!Number.isFinite(count) || count < 0) return line;
  if (!/\d/.test(line)) return line;
  return line.replace(/\d+/, String(count));
}
