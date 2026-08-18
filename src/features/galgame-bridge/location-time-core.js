// galgame-companion · location-time-core — the pill STRINGS, as a pure decision. v0.1
//
// WHY THIS FILE EXISTS: location-time-bridge.js reaches topWindow and writes DOM, so nothing in it can
// be opened by a test. The formatting rules below are the part that can actually be WRONG in a way a
// player notices — an untranslated enum key in the pills, a separator left dangling when a field is
// missing — so they live here, host-free, where a test can hold them.
//
// THE ONE RULE THIS FILE ENCODES: stat_data holds ENGLISH ENUM KEYS (Weather "Clear", not "晴朗"), and
// this module is BLIND TO GENRE — it adapts interface shapes and must never learn one game's
// vocabulary. So it does not translate; it ASKS. `renderLabel` is the owning engine's own labeler,
// injected by the caller, and every value goes through it with the path it came from. No labeler, or a
// labeler with no opinion, means the raw value shows — which is the old behaviour, so this can only
// improve a pill, never break one.

/**
 * Display form of one stored value. Never throws: a labeler that fails reports through `onError` and
 * the raw value is used, because a pill that reads oddly still beats a pill that never renders.
 * @param {string} path        stat_data path the value came from (e.g. 'World.Weather')
 * @param {unknown} val        the stored value (already unwrapped from MVU's [value,label] tuple)
 * @param {object} statData    full stat_data — the engine needs it for the game's own language/registries
 * @param {?function} renderLabel  (path, val, statData) => string, or null when no engine is hosted
 * @param {?function} onError  (message, error) => void — pure file, so failures leave through here
 * @returns {string}
 */
export function displayValue(path, val, statData, renderLabel, onError) {
  const raw = String(val == null ? '' : val).trim();
  if (!raw || typeof renderLabel !== 'function') return raw;
  try {
    const shown = renderLabel(path, raw, statData);
    return (shown == null || String(shown) === '') ? raw : String(shown);
  } catch (e) {
    if (typeof onError === 'function') onError('i18nLabel("' + path + '") threw — showing the raw value', e);
    return raw;
  }
}

// MVU stores each field as [value, label]; take the value (bare values pass through unchanged).
export function mvuVal(x) { return Array.isArray(x) ? x[0] : x; }

/**
 * The two pill strings: `location`, and `time` as "date (weekday) time · weather".
 *
 * Date and Time are passed through UNRENDERED on purpose. They are already player-facing strings, and a
 * game that formats its clock unconventionally — a 25:00 late-night hour, an in-world calendar — means
 * it. Normalizing that here would be this module deciding it knows better than the game about the
 * game's own clock, which is precisely the genre knowledge it refuses to hold. Location, Weekday and
 * Weather are enum/registry keys and DO get rendered.
 *
 * Every segment is conditional: a game that never sets Weather, or a save mid-migration with no
 * Weekday, gets a shorter pill rather than a stray "()" or a leading "·".
 *
 * @param {object} statData full stat_data (must carry .World)
 * @param {?function} renderLabel injected engine labeler (see displayValue)
 * @param {?function} onError injected reporter (see displayValue)
 * @returns {{location: string, time: string}|null} null when there is no World to read
 */
export function pillStrings(statData, renderLabel, onError) {
  const W = statData && statData.World;
  if (!W) return null;
  const location = displayValue('World.Location', mvuVal(W.Location), statData, renderLabel, onError);
  const weekday = displayValue('World.Weekday', mvuVal(W.Weekday), statData, renderLabel, onError);
  const weather = displayValue('World.Weather', mvuVal(W.Weather), statData, renderLabel, onError);
  const date = String(mvuVal(W.Date) == null ? '' : mvuVal(W.Date)).trim();
  const time = String(mvuVal(W.Time) == null ? '' : mvuVal(W.Time)).trim();
  const parts = [];
  if (date) parts.push(weekday ? `${date} (${weekday})` : date);
  if (time) parts.push(time);
  let timeStr = parts.join(' ');
  if (weather) timeStr += (timeStr ? ' · ' : '') + weather;
  return { location, time: timeStr };
}
