// galgame-companion · status-menu — load the card's StatusMenu into a bridged iframe. v0.1 (G3)
// The StatusMenu is embedded IN THE CARD as a regex script whose replaceString IS the menu
// HTML (~335 KB, contains the marker "VARIABLE_UPDATE_ENDED"). We read it from card data at
// click time (always the card's exact version — nothing shipped here, no drift) and mount it
// in an iframe, bridging the Tavern-Helper globals the menu needs.
//
// THE BRIDGE (verified live 2026-07-15, corrects GCP §10.1):
//  - the menu's context lookup is: (typeof window.getVariables === 'function' && window)
//    || (window.parent...) — so it needs getVariables ON THE POPUP'S OWN WINDOW.
//  - a bare iframe we create in the ST document has neither its own getVariables nor a
//    parent (top ST window) with one → renders blank. THAT is the gotcha.
//  - THIS companion iframe HAS getVariables/getChatMessages/eventOn/waitGlobalInitialized
//    (TH injects them into script iframes) — but NOT Mvu (Mvu lives on the TOP window).
//  - so: copy the functions from OUR window, copy Mvu from window.parent, onto the popup
//    BEFORE writing HTML. The menu then resolves targetWindow = its own window.

import { DOC, log } from '../../env.js';

const MENU_MARKER = 'VARIABLE_UPDATE_ENDED';

// Pick the StatusMenu script from the card. A card can hold MORE THAN ONE marker script
// (School v3 has both "<GameStartMenu/>" — the new-game screen with RPG scaffolding — and
// "StatusMenu" — the actual HUD). Prefer a name containing "status"; else avoid the
// start/new-game screen; else the largest marker script.
function pickMenuScript(scripts) {
  const markers = scripts.filter((s) => (s.replaceString || '').includes(MENU_MARKER));
  if (!markers.length) return null;
  return markers.find((s) => /status/i.test(s.scriptName))
    || markers.find((s) => !/start|开始|newgame|new game/i.test(s.scriptName))
    || markers.slice().sort((a, b) => b.replaceString.length - a.replaceString.length)[0];
}

// Read the StatusMenu HTML out of the currently-loaded character card.
export function loadMenuHtml() {
  try {
    const ctx = (window.SillyTavern || DOC.defaultView?.SillyTavern)?.getContext?.();
    if (!ctx) { log.warn('status-menu: no SillyTavern context'); return null; }
    const char = ctx.characters?.[ctx.characterId];
    const scripts = char?.data?.extensions?.regex_scripts || [];
    const menu = pickMenuScript(scripts);
    if (!menu) { log.warn(`status-menu: no StatusMenu regex script on "${char?.name}"`); return null; }
    log.info(`status-menu: loaded "${menu.scriptName}" (${menu.replaceString.length} chars)`);
    return menu.replaceString;
  } catch (e) {
    log.error('status-menu: loadMenuHtml failed:', e);
    return null;
  }
}

// The menu's resolveCurrentMessageId() calls getCurrentMessageId() first. In a script-iframe
// context (which is what bridges into the popup) that returns -1 — no "current message" — so
// the menu can't pick a message_id and every field shows ???. We return the newest DATA-BEARING
// floor.
//
// ⚠️ CORRECT-FLOOR (per MvuStatMenuBuilder/upgrade_db.html + user guidance): MVU snapshots
// stat_data per message, but NOT every floor has it — a trailing user message (or an empty
// floor) carries none. Reading the raw last id can land on such a floor → ??? or stale data.
// And with several message iframes alive at once they look alike; only an EXPLICIT
// {type:'message', message_id} (or chat scope) is unambiguous — never the ambient frame. So:
// walk back from the last id to the newest floor whose variables actually contain stat_data.
const FLOOR_LOOKBACK = 30; // cap the backward scan on huge chats

function latestMessageId() {
  let last = -1;
  try {
    const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN);
    if (Number.isFinite(n) && n >= 0) last = n;
  } catch (e) { /* fall through */ }
  if (last < 0) {
    try {
      const chat = (window.parent?.SillyTavern || window.SillyTavern)?.getContext?.()?.chat;
      if (Array.isArray(chat)) last = chat.length - 1;
    } catch (e) { /* fall through */ }
  }
  if (last < 0) return -1;

  const gv = typeof window.getVariables === 'function' ? window.getVariables : null;
  if (gv) {
    for (let id = last; id >= 0 && id > last - FLOOR_LOOKBACK; id--) {
      try {
        const v = gv({ type: 'message', message_id: id });
        if (v && v.stat_data) return id; // newest floor that actually holds stat_data
      } catch (e) { /* keep scanning */ }
    }
  }
  return last; // none found in range → last id; the menu still falls back to chat scope
}

// The globals the menu resolves against. Functions come from OUR window; Mvu from the top window.
// Includes the WRITE API — the menu's interactive controls (Present/In-Conflict checkboxes, the
// ✎ editor) call `updateVariablesWith((vars)=>…, {type:'message',message_id})` to persist edits.
// Without it the menu reads fine but every toggle is a silent no-op. `resolveCurrentMessageId`
// (our shim) picks the same data floor for writes as for reads.
function bridgeGlobals(iw) {
  const fromSelf = ['getVariables', 'getChatMessages', 'waitGlobalInitialized', 'eventOn',
    'getLastMessageId', 'triggerSlash', 'SillyTavern', 'TavernHelper',
    'updateVariablesWith', 'insertOrAssignVariables', 'replaceVariables'];
  const bridged = [];
  for (const k of fromSelf) {
    if (typeof window[k] !== 'undefined') { iw[k] = window[k]; bridged.push(k); }
  }
  // getCurrentMessageId: OVERRIDE (do not pass through) — the companion's own returns -1 in a
  // script iframe. Give the menu the latest message id so it reads that message's stat_data.
  iw.getCurrentMessageId = latestMessageId;
  bridged.push('getCurrentMessageId(shim)');
  // Mvu is NOT on a TH-script iframe — grab it from the top window (window.parent).
  try {
    const topMvu = window.parent && window.parent.Mvu;
    if (topMvu) { iw.Mvu = topMvu; bridged.push('Mvu'); }
    else log.warn('status-menu: Mvu not found on parent window (menu falls back to 2s polling)');
  } catch (e) {
    log.warn('status-menu: could not reach parent Mvu:', e);
  }
  if (typeof iw.getVariables !== 'function') {
    log.error('status-menu: getVariables NOT bridged — menu will render blank');
  }
  return bridged;
}

// Mount the menu into `bodyEl` (the modal body). Returns the iframe (or null on failure).
export function mountStatusMenu(bodyEl) {
  const html = loadMenuHtml();
  if (!html) {
    bodyEl.textContent = 'This card has no StatusMenu.';
    return null;
  }
  bodyEl.textContent = '';
  bodyEl.style.cssText = 'flex:1 1 auto;display:block;padding:0;overflow:hidden;';

  const frame = DOC.createElement('iframe');
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff;';
  bodyEl.appendChild(frame);

  const iw = frame.contentWindow;
  const bridged = bridgeGlobals(iw);
  log.info(`status-menu: bridged [${bridged.join(', ')}]`);

  try {
    iw.document.open();
    iw.document.write(html); // 335 KB self-contained app; its scripts run + start the 2s poll
    iw.document.close();
  } catch (e) {
    log.error('status-menu: writing menu HTML failed:', e);
    bodyEl.textContent = 'Failed to render StatusMenu (see console).';
    return null;
  }
  return frame;
}
