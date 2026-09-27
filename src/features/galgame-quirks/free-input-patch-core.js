// galgame-companion · free-input-patch-core — PURE decisions for galgame's 自由输入 (free input) pop-up.
//
// 1. ENTER WRITES A NEW LINE. galgame sends the pop-up on a plain Enter (upstream src/ui/interaction.js,
//    `e.key === 'Enter' && !e.shiftKey`), so a player writing more than one line sends after the first.
//    Enter and Shift+Enter now write a new line. Ctrl+Enter / ⌘+Enter is left alone, so it reaches
//    galgame's own handler, which sends it; the Send button still sends too.
// 2. ONLY THE ✕ CLOSES IT. galgame removes the pop-up on any click on its backdrop (`e.target === this`
//    on the modal), which a stray click — or a text selection dragged past the box edge — does by
//    accident, throwing the draft away. A click whose target is the backdrop itself is now held back.
//
// Only this pop-up: it is galgame's one multi-line input that sends on Enter, and the backdrop rule
// is the user's call for this pop-up alone — every other galgame dialog keeps its own behaviour.

export const FREE_INPUT_ID = 'gal-free-input-text';
export const FREE_INPUT_MODAL_ID = 'gal-free-input-modal';

export function isFreeInputNewline({ key, targetId, ctrlKey = false, metaKey = false } = {}) {
  return key === 'Enter' && targetId === FREE_INPUT_ID && !ctrlKey && !metaKey;
}

export function isFreeInputBackdropClick({ targetId } = {}) {
  return targetId === FREE_INPUT_MODAL_ID;
}
