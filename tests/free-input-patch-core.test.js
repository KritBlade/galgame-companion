// free-input-patch-core unit tests — galgame's free-input pop-up. v0.2
//
// galgame sends the pop-up on a plain Enter and closes it on any click on its backdrop, so a player
// writing more than one line sent after the first, and a stray click threw the draft away. Enter and
// Shift+Enter now write a new line (Ctrl/⌘+Enter still reaches galgame's handler, which sends), and
// a click on the backdrop no longer reaches galgame's close handler — only the ✕ closes it.
import { describe, it, expect } from 'vitest';
import { isFreeInputNewline, isFreeInputBackdropClick, FREE_INPUT_ID, FREE_INPUT_MODAL_ID } from '../src/features/galgame-quirks/free-input-patch-core.js';

describe('isFreeInputNewline', () => {
  it('MUTATION TARGET — a plain Enter in the free-input box is a new line', () => {
    expect(isFreeInputNewline({ key: 'Enter', targetId: FREE_INPUT_ID })).toBe(true);
  });

  it('Shift+Enter stays a new line', () => {
    expect(isFreeInputNewline({ key: 'Enter', targetId: FREE_INPUT_ID, shiftKey: true })).toBe(true);
  });

  it('MUTATION TARGET — Ctrl+Enter and ⌘+Enter are left to galgame, which sends them', () => {
    expect(isFreeInputNewline({ key: 'Enter', targetId: FREE_INPUT_ID, ctrlKey: true })).toBe(false);
    expect(isFreeInputNewline({ key: 'Enter', targetId: FREE_INPUT_ID, metaKey: true })).toBe(false);
  });

  it('MUTATION TARGET — every other input keeps its own Enter (the NPC talk box, ST\'s own box)', () => {
    expect(isFreeInputNewline({ key: 'Enter', targetId: 'gal-npc-talk-input' })).toBe(false);
    expect(isFreeInputNewline({ key: 'Enter', targetId: 'send_textarea' })).toBe(false);
    expect(isFreeInputNewline({ key: 'Enter', targetId: undefined })).toBe(false);
  });

  it('other keys pass through untouched', () => {
    expect(isFreeInputNewline({ key: 'a', targetId: FREE_INPUT_ID })).toBe(false);
    expect(isFreeInputNewline({ key: 'Escape', targetId: FREE_INPUT_ID })).toBe(false);
    expect(isFreeInputNewline({})).toBe(false);
  });
});

describe('isFreeInputBackdropClick', () => {
  it('MUTATION TARGET — a click on the pop-up\'s backdrop is held back', () => {
    expect(isFreeInputBackdropClick({ targetId: FREE_INPUT_MODAL_ID })).toBe(true);
  });

  it('MUTATION TARGET — clicks inside the pop-up pass: the ✕, the Send button, the text box', () => {
    expect(isFreeInputBackdropClick({ targetId: 'gal-free-input-close-x' })).toBe(false);
    expect(isFreeInputBackdropClick({ targetId: 'gal-input-send' })).toBe(false);
    expect(isFreeInputBackdropClick({ targetId: FREE_INPUT_ID })).toBe(false);
    expect(isFreeInputBackdropClick({ targetId: '' })).toBe(false);
  });

  it('MUTATION TARGET — every other galgame pop-up keeps closing on a backdrop click', () => {
    for (const id of ['gal-bg-upload-modal', 'gal-save-load-modal', 'gal-npc-modal']) {
      expect(isFreeInputBackdropClick({ targetId: id })).toBe(false);
    }
  });
});
