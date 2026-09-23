// galgame-companion · status-menu-core — the pure half of hosting the card's StatusMenu. v0.2
//
// The companion does not handle the menu's document any more. mvu-helper lifts a StatusMenu pack's
// document out of the card's regex rows at install and composes the ONE contained version of it —
// sandbox tokens, a Content-Security-Policy, the prelude that answers the menu's host calls, and the
// document — behind `MvuHelper.statusMenuFrameSource()` (mvu-helper plans/statusmenu-containment.md,
// D7/D11). The companion sets what that returns on a frame it owns, and speaks the frame's published
// wire: three messages in (height, overlay, error), one out (state).
//
// Everything a test can hold lives here; status-menu.js keeps only what needs a document.

// mvu-helper's published message names (the frame speaks them; so does the companion's host half).
export const FRAME_STATE_MESSAGE = 'mvu-helper:statusmenu-state';       // host → frame: { mid, statData }
export const FRAME_HEIGHT_MESSAGE = 'mvu-helper:statusmenu-height';     // frame → host: { height }
export const FRAME_OVERLAY_MESSAGE = 'mvu-helper:statusmenu-overlay';   // frame → host: { open }
export const FRAME_ERROR_MESSAGE = 'mvu-helper:statusmenu-error';       // frame → host: { message, source, line }

/**
 * The frame attributes, exactly as mvu-helper composed them — or null when there is nothing to mount.
 * Passed through UNCHANGED: the sandbox tokens and the document are the containment, and a host that
 * edited either would be a second containment nobody reviews.
 *
 * @param {*} source what MvuHelper.statusMenuFrameSource() resolved to
 * @returns {?{sandbox: string, srcdoc: string}}
 */
export function frameAttributesFrom(source) {
  if (!source || typeof source !== 'object') return null;
  if (typeof source.sandbox !== 'string' || typeof source.srcdoc !== 'string' || !source.srcdoc) return null;
  return { sandbox: source.sandbox, srcdoc: source.srcdoc };
}

/**
 * One message the frame sent, read — or null when it is not one of the three this host answers.
 * @returns {?({kind:'height', height:number}|{kind:'overlay', open:boolean}|{kind:'error', message:string})}
 */
export function readFrameMessage(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type === FRAME_HEIGHT_MESSAGE) {
    const height = Number(data.height);
    return Number.isFinite(height) && height >= 0 ? { kind: 'height', height: Math.round(height) } : null;
  }
  if (data.type === FRAME_OVERLAY_MESSAGE) {
    return typeof data.open === 'boolean' ? { kind: 'overlay', open: data.open } : null;
  }
  if (data.type === FRAME_ERROR_MESSAGE) {
    return typeof data.message === 'string' ? { kind: 'error', message: data.message.slice(0, 2000) } : null;
  }
  return null;
}

// The frame at rest (as tall as its content; the modal body scrolls), and while one of the menu's
// popups is open: a popup covers the FRAME's viewport, so the frame becomes the screen's for as long
// as it is open. Explicit viewport units because SillyTavern sets a transform on <html>, which would
// re-root inset:0 (menu-modal.js says the same for the modal itself).
export const FRAME_STYLE = 'width:100%;height:100%;border:0;display:block;background:#fff;';
export const FRAME_LIFTED_STYLE = 'position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;border:0;display:block;z-index:2147483600;background:transparent;';
