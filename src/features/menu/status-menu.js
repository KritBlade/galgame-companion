// galgame-companion · status-menu — the card's StatusMenu, in a frame the companion owns. v0.2
//
// WHAT CHANGED UNDER IT. mvu-helper contains a StatusMenu pack's document (mvu-helper
// plans/statusmenu-containment.md): at install the document leaves the card's regex rows, and the one
// place it can be mounted from is `MvuHelper.statusMenuFrameSource()`, which returns the sandbox tokens
// and the whole contained document. A sandboxed frame has an opaque origin, so nothing can be written
// onto its window from here and nothing in it can reach this window or SillyTavern's — the menu reads
// the state it is pushed and asks mvu-helper's dispatcher for everything else.
//
// WHAT THIS FILE OWNS. The frame element, and the three messages that frame sends to the window it
// sits in (SillyTavern's page — the modal lives there): its height (the modal body scrolls; the frame
// is as tall as its content), a popup opening or closing (the frame is lifted over the screen while
// one is open, so the popup is not clipped by the modal box), and an error (warned). And the state
// push: the prelude has the state at mount; MVU's update event and the reply events push the current
// floor's stat_data after that. A menu action's own result is pushed to the acting frame by mvu-helper.

import { DOC, topWindow, log } from '../../env.js';
import {
  frameAttributesFrom, readFrameMessage, FRAME_STATE_MESSAGE, FRAME_STYLE, FRAME_LIFTED_STYLE,
} from './status-menu-core.js';
import { latestStatData } from '../galgame-bridge/index.js';

const MVU_UPDATE_ENDED = 'mag_variable_update_ended';   // Mvu.events.VARIABLE_UPDATE_ENDED

// The ONE menu frame this companion has open (the modal holds at most one), with what its host half
// needs: its last reported height and, while a popup is open, the style it had before the lift.
let current = null;

function onFrameMessage(event) {
  if (!current || !current.frame.isConnected || event.source !== current.frame.contentWindow) return;
  const msg = readFrameMessage(event.data);
  if (!msg) return;
  if (msg.kind === 'height') {
    current.height = msg.height;
    if (!current.lifted) current.frame.style.height = msg.height + 'px';
  } else if (msg.kind === 'overlay') {
    if (msg.open && !current.lifted) {
      current.savedStyle = current.frame.style.cssText;
      current.frame.style.cssText = FRAME_LIFTED_STYLE;
      current.lifted = true;
    } else if (!msg.open && current.lifted) {
      current.frame.style.cssText = current.savedStyle;
      current.lifted = false;
    }
  } else {
    log.warn('status-menu: the StatusMenu frame threw: ' + msg.message);
  }
}

// The current floor's state to the open frame. Debounced: a reply fires several of the triggers.
let pushTimer = null;
function schedulePush() {
  if (!current) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!current || !current.frame.isConnected) { current = null; return; }
    const live = latestStatData();
    if (!live) return;
    try {
      current.frame.contentWindow.postMessage({ type: FRAME_STATE_MESSAGE, mid: live.floor, statData: live.statData }, '*');
    } catch (e) {
      log.warn('status-menu: could not push state to the StatusMenu frame:', e);
    }
  }, 150);
}

// Wired once, on the first mount: the frame's messages arrive on SillyTavern's window (the frame's
// parent), and the state triggers are the same set the meter panel redraws on.
let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  topWindow.addEventListener('message', onFrameMessage);
  const te = window.tavern_events || {};
  if (typeof window.eventOn !== 'function') {
    log.warn('status-menu: eventOn is not on this window — the open menu shows the state it was opened with until it is reopened');
    return;
  }
  for (const name of [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED, te.MESSAGE_SWIPED, te.CHAT_CHANGED, MVU_UPDATE_ENDED]) {
    if (!name) continue;
    try { window.eventOn(name, schedulePush); }
    catch (e) { log.warn(`status-menu: eventOn(${name}) failed — that trigger will not refresh the open menu:`, e); }
  }
}

// Mount the menu into `bodyEl` (the modal body). Resolves to the frame, or null with a reason shown.
export async function mountStatusMenu(bodyEl) {
  const helper = topWindow.MvuHelper;
  if (!helper || typeof helper.statusMenuFrameSource !== 'function') {
    bodyEl.textContent = 'The StatusMenu needs mvu-helper 0.3.290 or later.';
    log.warn('status-menu: MvuHelper.statusMenuFrameSource is not on the page — mvu-helper is missing, disabled, or older than the contained menu');
    return null;
  }
  const live = latestStatData();
  let source = null;
  try {
    source = frameAttributesFrom(await helper.statusMenuFrameSource({ mid: live ? live.floor : -1, statData: live ? live.statData : null }));
  } catch (e) {
    log.error('status-menu: MvuHelper.statusMenuFrameSource failed:', e);
    bodyEl.textContent = 'Failed to load the StatusMenu (see console).';
    return null;
  }
  if (!source) {
    bodyEl.textContent = 'This card has no StatusMenu.';
    log.info('status-menu: mvu-helper reports no contained StatusMenu on this card — none is installed, or it was installed before the lift (re-activate the StatusMenu pack)');
    return null;
  }
  if (!bodyEl.isConnected) return null;   // the modal closed while we read

  wireOnce();
  bodyEl.textContent = '';
  bodyEl.style.cssText = 'flex:1 1 auto;display:block;padding:0;overflow:auto;';
  const frame = DOC.createElement('iframe');
  frame.setAttribute('sandbox', source.sandbox);
  frame.setAttribute('title', 'StatusMenu');
  frame.style.cssText = FRAME_STYLE;
  frame.srcdoc = source.srcdoc;
  bodyEl.appendChild(frame);
  current = { frame, height: 0, lifted: false, savedStyle: '' };
  log.info(`status-menu: mounted the contained StatusMenu (${source.srcdoc.length} chars, sandbox="${source.sandbox}")`);
  return frame;
}
