// galgame-companion · location-time-bridge — feed galgame's top-right location/time pills from MVU. v0.3
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

import { topWindow, log } from '../../env.js';
import { activeGenre } from '../../genre/index.js';
import { getOptionSheet } from './choices.js';
import { pillStrings } from './location-time-core.js';

const FLOOR_LOOKBACK = 8;              // newest floor with stat_data (MVU carries it forward)
const SHEET_UID = 'sheet_global_data'; // galgame matches this uid (or name 全局数据表) in getGlobalLocationAndTime
const SHEET_NAME = '全局数据表';
const COL_LOCATION = '当前详细地点';   // → galgame detailedLocation
const COL_TIME = '当前时间';           // → galgame currentTime

// THE ENGINE'S OWN LABELER, or null when no engine is hosted. This is the ONLY genre-aware thing the
// bridge touches, and it touches it by INTERFACE: an engine that renders values exposes i18nLabel, and
// whatever it knows about weather words or venue names stays entirely on its side. Host-coupled
// (topWindow), which is why it lives here and the formatting rules live in location-time-core.js.
//
// ⚠ THE ENGINE'S LABELER IS ASYNC AND THIS CALLER CANNOT BE. mvu-helper hosts the engine in a WORKER,
// so `LogicEngine.i18nLabel(...)` is a postMessage round-trip and returns a PROMISE — while galgame
// calls our exportTableAsJson() synchronously and renders whatever it gets back. Calling it directly
// therefore stringified the promise and every pill read "[object Promise]" (live 2026-08-19; broken
// since the pills first started asking the engine). Making the chain async is not available: the
// consumer is galgame's own code, and handing a third party a Promise where it expects an object is a
// worse bug than the one being fixed.
//
// So labels are CACHED, and the cache is what the synchronous caller reads. A miss renders the raw
// value — the honest, pre-i18n behaviour — and starts the round-trip; the answer lands in the cache
// and the NEXT render (galgame polls this constantly) shows the localized word. Values are stable
// enum keys, so a warm cache stays correct; the key includes the language so switching it re-resolves
// rather than serving another locale's word.
const labelCache = new Map();
const labelPending = new Set();

function engineLabeler() {
  let engine = null;
  try { engine = topWindow.LogicEngine; }
  catch (e) {
    log.warn('location-time-bridge: reading LogicEngine threw — pills fall back to raw stored values:', e);
    return null;
  }
  if (!engine || typeof engine.i18nLabel !== 'function') return null;

  return (path, value, statData) => {
    let lang = '';
    try { const L = statData && statData.Preferences && statData.Preferences.Lang; lang = String((Array.isArray(L) ? L[0] : L) || ''); }
    catch (e) { /* EXPECTED: a save with no Preferences — the cache key just loses its language half */ }
    const key = lang + '|' + path + '|' + value;
    if (labelCache.has(key)) return labelCache.get(key);

    let result;
    try { result = engine.i18nLabel(path, value, statData); }
    catch (e) {
      log.warn('location-time-bridge: i18nLabel("' + path + '") threw — showing the raw value:', e);
      labelCache.set(key, value);            // don't retry a thrower every render
      return value;
    }

    // A SYNCHRONOUS engine (baked, or a future non-Worker host) still works untouched.
    if (!result || typeof result.then !== 'function') {
      labelCache.set(key, result == null || result === '' ? value : String(result));
      return labelCache.get(key);
    }
    // Worker: resolve in the background, render raw meanwhile. One flight per key.
    if (!labelPending.has(key)) {
      labelPending.add(key);
      Promise.resolve(result).then(
        (v) => { labelCache.set(key, v == null || v === '' ? value : String(v)); },
        (e) => { labelCache.set(key, value); log.warn('location-time-bridge: i18nLabel("' + path + '") rejected — keeping the raw value:', e); },
      ).finally(() => { labelPending.delete(key); refreshLocationTimePills(); });
    }
    return value;
  };
}

// stat_data.World from the newest floor that has it (mirrors image-seam's floor resolution). Returns the
// WHOLE stat_data, not just .World: rendering a value needs the game's own settings (its language, its
// registries), and only the game knows which parts of its state those are — so we hand it all of it.
function latestStatData() {
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
    if (sd && sd.World) return sd;
  }
  return null;
}

// Pill strings — the RULES are location-time-core's; this half only supplies the host bits (which floor
// to read, which engine is hosting, WHICH GENRE'S clock fields to prefer, where a failure gets logged).
// The genre is read per call, not captured: installing or switching a pack must take effect without a
// reload of this companion.
function pills() {
  const sd = latestStatData();
  if (!sd) return null;
  return pillStrings(sd, engineLabeler(), (msg, e) => log.warn('location-time-bridge: ' + msg, e), activeGenre());
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
