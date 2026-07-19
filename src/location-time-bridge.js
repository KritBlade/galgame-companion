// galgame-companion · location-time-bridge — feed galgame's top-right location/time pills from MVU. v0.2
//
// WHY: galgame's status pills (地点 / 时间) take their TEXT from
// AutoCardUpdaterAPI.exportTableAsJson() — updateLocationTimeDisplay() reads the "全局数据表" sheet's
// 当前详细地点 / 当前时间 columns (galgame/src/utils/location-time.js) and refreshes on every beat/
// floor render (overlay-content.js calls it 4×). MVU cards have NO AutoCardUpdater, so that global is
// absent and the pills show galgame's defaults (未知地点 / --). We PROVIDE the API — built live from
// stat_data.World — so galgame populates the pills itself, refreshing as the turn advances. galgame
// stays untouched (it already looks for this global; we just answer it). The pill CLICK-popup
// (<弹窗一>/<弹窗二>) is a separate channel and is not handled here.
//
// GUARD: install ONLY if nothing else owns AutoCardUpdaterAPI — never clobber a real AutoCardUpdater.

import { topWindow, log } from './env.js';
import { getOptionSheet } from './choices.js';

const FLOOR_LOOKBACK = 8;              // newest floor with stat_data (MVU carries it forward)
const SHEET_UID = 'sheet_global_data'; // galgame matches this uid (or name 全局数据表) in getGlobalLocationAndTime
const SHEET_NAME = '全局数据表';
const COL_LOCATION = '当前详细地点';   // → galgame detailedLocation
const COL_TIME = '当前时间';           // → galgame currentTime

// MVU stores each field as [value, label]; take the value (bare values pass through unchanged).
function mvuVal(x) { return Array.isArray(x) ? x[0] : x; }

// stat_data.World from the newest floor that has it (mirrors image-seam's floor resolution).
function latestWorld() {
  const gv = typeof window.getVariables === 'function' ? window.getVariables : null;
  let last = -1;
  try { const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN); if (Number.isFinite(n) && n >= 0) last = n; } catch (e) { /* fall through */ }
  if (last < 0) {
    try { const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat; if (Array.isArray(chat)) last = chat.length - 1; } catch (e) { /* fall through */ }
  }
  if (last < 0) return null;
  for (let id = last; id >= 0 && id > last - FLOOR_LOOKBACK; id--) {
    let sd = null;
    try { if (gv) { const v = gv({ type: 'message', message_id: id }); sd = v && v.stat_data; } } catch (e) { /* keep scanning */ }
    if (!sd) { // fallback: top-window Mvu (getVariables can be momentarily absent early)
      try { const Mvu = topWindow.Mvu; if (Mvu && Mvu.getMvuData) { const d = Mvu.getMvuData({ type: 'message', message_id: id }); sd = d && d.stat_data; } } catch (e) { /* keep scanning */ }
    }
    if (sd && sd.World) return sd.World;
  }
  return null;
}

// Pill strings from World: location, and "date (weekday) time · weather".
function pills() {
  const W = latestWorld();
  if (!W) return null;
  const location = String(mvuVal(W.Location) || '').trim();
  const date = String(mvuVal(W.Date) || '').trim();
  const time = String(mvuVal(W.Time) || '').trim();
  const weekday = String(mvuVal(W.Weekday) || '').trim();
  const weather = String(mvuVal(W.Weather) || '').trim();
  const parts = [];
  if (date) parts.push(weekday ? `${date} (${weekday})` : date);
  if (time) parts.push(time);
  let timeStr = parts.join(' ');
  if (weather) timeStr += (timeStr ? ' · ' : '') + weather;
  return { location, time: timeStr };
}

// Push the pills NOW from the freshest World — for state changes galgame doesn't repaint on (a manual Next-Block
// advance). Writes the SAME text galgame's own updateLocationTimeDisplay would (it reads our exportTableAsJson),
// so galgame's next render agrees and never fights this. Returns true if it wrote a non-empty value.
export function refreshLocationTimePills() {
  try {
    const p = pills();
    if (!p) return false;
    const doc = topWindow.document;
    if (!doc) return false;
    const locText = doc.querySelector('#gal-location-text');
    const timeText = doc.querySelector('#gal-time-text');
    const locBar = doc.querySelector('#gal-location-bar');
    const timeBar = doc.querySelector('#gal-time-bar');
    const locStr = p.location || '未知地点';
    const timeStr = p.time || '--';
    if (locText) locText.textContent = locStr;
    if (timeText) timeText.textContent = timeStr;
    if (locBar) locBar.setAttribute('title', locStr);
    if (timeBar) timeBar.setAttribute('title', timeStr);
    return !!(p.location || p.time);
  } catch (e) {
    log.warn('location-time-bridge: refreshLocationTimePills failed:', e);
    return false;
  }
}

export function startLocationTimeBridge() {
  let existing = null;
  try { existing = topWindow.AutoCardUpdaterAPI; }
  catch (e) { log.warn('location-time-bridge: reading AutoCardUpdaterAPI threw — skipping shim:', e); return; }
  if (existing && typeof existing.exportTableAsJson === 'function') {
    log.info('location-time-bridge: AutoCardUpdaterAPI already present — not shimming (respecting the real one).');
    return;
  }
  try {
    topWindow.AutoCardUpdaterAPI = {
      // galgame reads content[0]=headers, content[1]=dataRow and maps 当前详细地点→detailedLocation,
      // 当前时间→currentTime. Return {} while there's no World so galgame's isEmpty retry keeps polling.
      exportTableAsJson() {
        try {
          const out = {};
          const p = pills();
          if (p && (p.location || p.time)) {
            out.global = { uid: SHEET_UID, name: SHEET_NAME, content: [[COL_LOCATION, COL_TIME], [p.location, p.time]] };
          }
          // story choices (choices.js parses the current reply's <choices> block into a 选项表 sheet).
          const opt = getOptionSheet();
          if (opt) out[opt.key] = opt.sheet;
          return out; // {} while nothing to report → galgame keeps polling (its isEmpty retry)
        } catch (e) {
          log.warn('location-time-bridge: exportTableAsJson failed:', e);
          return {};
        }
      },
    };
    log.info('location-time-bridge: AutoCardUpdaterAPI shim installed (galgame location/time pills ← stat_data.World).');
  } catch (e) {
    log.error('location-time-bridge: could not install AutoCardUpdaterAPI shim:', e);
  }
}
