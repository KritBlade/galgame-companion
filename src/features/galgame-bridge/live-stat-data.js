// galgame-companion · galgame-bridge/live-stat-data — the stat_data the stage should be showing. v0.1
//
// Every reader of live state in this feature asks one question — "the stat_data of the newest floor
// at or below X that holds one" — and the location/time pills used to answer it with a private scan
// while the meter panel would have needed a second. One scan, here. MVU carries stat_data forward,
// so a floor within the lookback answers for every floor after it; user floors carry it too (MVU
// stamps them at send), so the scan rarely steps back more than once.
//
// Reads through Tavern-Helper's `getVariables` (a bare global in this script iframe). Early in a
// session that global can be momentarily absent while the top window's Mvu already answers, so the
// scan reads through Mvu.getMvuData in that window — the same store, one door or the other.

import { topWindow, log } from '../../env.js';

const FLOOR_LOOKBACK = 30;

/** The newest message id, or -1 when no chat is open (or nothing can be asked yet). */
export function newestMessageId() {
  try {
    const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch (e) {
    log.warn('live-stat-data: getLastMessageId threw — reading the chat length instead:', e);
  }
  try {
    const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat;
    if (Array.isArray(chat)) return chat.length - 1;
  } catch (e) {
    log.warn('live-stat-data: reading the chat length threw — no floor can be resolved right now:', e);
  }
  return -1;
}

function statDataOf(id) {
  if (typeof window.getVariables === 'function') {
    const v = window.getVariables({ type: 'message', message_id: id });
    return v && v.stat_data;
  }
  const Mvu = topWindow.Mvu;
  if (Mvu && typeof Mvu.getMvuData === 'function') {
    const d = Mvu.getMvuData({ type: 'message', message_id: id });
    return d && d.stat_data;
  }
  return null;
}

/**
 * The newest usable stat_data at or below a floor.
 *
 * @param {{from?: number, accept?: (statData: object) => boolean}} [options]
 *   from — the floor to start scanning DOWN from; default the newest message. galgame may be
 *          showing an older floor than the newest, and what is drawn should agree with what it shows.
 *   accept — an extra requirement on a floor's stat_data; default: any object.
 * @returns {?{statData: object, floor: number}} null when no floor within the lookback qualifies
 */
export function latestStatData({ from, accept } = {}) {
  const top = Number.isFinite(from) && from >= 0 ? Math.floor(from) : newestMessageId();
  if (top < 0) return null;
  const ok = typeof accept === 'function' ? accept : () => true;
  let firstError = null;
  for (let id = top; id >= 0 && id > top - FLOOR_LOOKBACK; id--) {
    let sd = null;
    try { sd = statDataOf(id); } catch (e) { if (!firstError) firstError = { id, e }; continue; }
    if (sd && typeof sd === 'object' && ok(sd)) return { statData: sd, floor: id };
  }
  // Said once per scan, not per floor: a store that throws for one floor usually throws for all of
  // them, and the answer the caller gets (null) must not be mistaken for "no floor holds stat_data".
  if (firstError) log.warn(`live-stat-data: reading floor ${firstError.id} threw (and no floor qualified):`, firstError.e);
  return null;
}
