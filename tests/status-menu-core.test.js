/**
 * galgame-companion — hosting the contained StatusMenu (features/menu/status-menu-core.js).
 *
 * The companion no longer reads or handles the menu's document. mvu-helper composes the one contained
 * version of it (MvuHelper.statusMenuFrameSource) and the companion sets that on a frame it owns. So
 * the guards here are about what the companion must NOT do: edit the sandbox or the document, or
 * answer a message that is not one of the three its frame sends.
 *
 * MUTATION (run by hand, recorded): make frameAttributesFrom append ' allow-same-origin' to the
 * sandbox → "passes the sandbox and document through unchanged" fails.
 *
 * Run:  npm test
 */
import { describe, it, expect } from 'vitest';
import {
  frameAttributesFrom, readFrameMessage, FRAME_STYLE, FRAME_LIFTED_STYLE,
  FRAME_STATE_MESSAGE, FRAME_HEIGHT_MESSAGE, FRAME_OVERLAY_MESSAGE, FRAME_ERROR_MESSAGE,
} from '../src/features/menu/status-menu-core.js';

describe('frameAttributesFrom — the containment is mvu-helper\'s, passed through untouched', () => {
  const source = { sandbox: 'allow-scripts allow-modals', srcdoc: '<!DOCTYPE html><html><body>menu</body></html>' };

  it('MUTATION TARGET — passes the sandbox and document through unchanged', () => {
    expect(frameAttributesFrom(source)).toEqual(source);
    expect(frameAttributesFrom(source).sandbox).not.toContain('allow-same-origin');
  });
  it('nothing to mount is null — no card menu, an old mvu-helper, a malformed answer', () => {
    expect(frameAttributesFrom(null)).toBeNull();
    expect(frameAttributesFrom({ sandbox: 'allow-scripts' })).toBeNull();
    expect(frameAttributesFrom({ sandbox: 'allow-scripts', srcdoc: '' })).toBeNull();
    expect(frameAttributesFrom({ srcdoc: 'x' })).toBeNull();
  });
  it('carries nothing but the two attributes — no global, no bridge, no extra field', () => {
    expect(Object.keys(frameAttributesFrom({ ...source, extra: 1 })).sort()).toEqual(['sandbox', 'srcdoc']);
  });
});

describe('readFrameMessage — the three messages the frame sends, and nothing else', () => {
  it('reads height, overlay and error', () => {
    expect(readFrameMessage({ type: FRAME_HEIGHT_MESSAGE, height: 811.6 })).toEqual({ kind: 'height', height: 812 });
    expect(readFrameMessage({ type: FRAME_OVERLAY_MESSAGE, open: true })).toEqual({ kind: 'overlay', open: true });
    expect(readFrameMessage({ type: FRAME_ERROR_MESSAGE, message: 'SecurityError: x' })).toEqual({ kind: 'error', message: 'SecurityError: x' });
  });
  it('ignores malformed shapes and every other message on the window', () => {
    expect(readFrameMessage({ type: FRAME_HEIGHT_MESSAGE, height: -3 })).toBeNull();
    expect(readFrameMessage({ type: FRAME_OVERLAY_MESSAGE, open: 'yes' })).toBeNull();
    expect(readFrameMessage({ type: FRAME_STATE_MESSAGE, statData: {} })).toBeNull();
    expect(readFrameMessage({ type: 'mvu-statusmenu-action-result' })).toBeNull();
    expect(readFrameMessage(null)).toBeNull();
  });
  it('spells mvu-helper\'s published names', () => {
    expect([FRAME_STATE_MESSAGE, FRAME_HEIGHT_MESSAGE, FRAME_OVERLAY_MESSAGE, FRAME_ERROR_MESSAGE]).toEqual([
      'mvu-helper:statusmenu-state', 'mvu-helper:statusmenu-height', 'mvu-helper:statusmenu-overlay', 'mvu-helper:statusmenu-error',
    ]);
  });
});

describe('the frame at rest and lifted', () => {
  it('lifts to the viewport in explicit units (SillyTavern transforms <html>), above the modal', () => {
    expect(FRAME_LIFTED_STYLE).toContain('position:fixed');
    expect(FRAME_LIFTED_STYLE).toContain('100vw');
    expect(FRAME_LIFTED_STYLE).toMatch(/z-index:(\d+)/);
    expect(Number(FRAME_LIFTED_STYLE.match(/z-index:(\d+)/)[1])).toBeGreaterThan(2147483000);
    expect(FRAME_STYLE).not.toContain('position:fixed');
  });
});
