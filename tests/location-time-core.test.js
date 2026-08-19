// location-time-core unit tests — the status pills' formatting rules. v0.1
//
// The defect these exist for (2026-08-18): the pills pushed RAW ENUM KEYS, so a player running the game
// in Chinese read "School_Classroom … · Clear" while every other surface of that game showed the
// localized words. The fix must not be a weather table in this repo — the companion is blind to genre —
// so the rules below lean on the boundary: values are RENDERED BY THE OWNING ENGINE, and this module
// never learns what any of them mean. The tests therefore check WHICH paths get handed over and that
// every failure mode still yields a pill.
import { describe, it, expect } from 'vitest';
import { displayValue, mvuVal, pillStrings } from '../src/features/galgame-bridge/location-time-core.js';
import { SCHOOL, MAIN } from '../src/genre/genre-profile-core.js';

// A stand-in engine. Deliberately NOT School's table — it maps nonsense words, so a test passing here
// proves the value came back THROUGH the labeler rather than from any knowledge baked into the module.
const LABELS = {
  'World.Weather': { Clear: '晴朗', Rain: '雨天' },
  'World.Location': { School_Classroom: '一年一班', School_Rooftop: '頂樓' },
  'World.Weekday': { Wed: '週三' },
  'World.WallWeekday': { Wed: '週三' },   // the wall clock asks under its OWN path, so the stub answers it too
};
const labeler = (path, val) => (LABELS[path] && LABELS[path][val]) || val;

const world = (over = {}) => ({
  Preferences: { Lang: ['zh-TW', 'Lang'] },
  World: {
    Date: ['2026-04-08', 'Date'], Weekday: ['Wed', 'Weekday'], Time: ['07:45', 'Time'],
    Location: ['School_Classroom', 'Location'], Weather: ['Clear', 'Weather'], ...over,
  },
});

describe('displayValue — renders by ASKING, never by knowing', () => {
  it('returns the engine-rendered label', () => {
    expect(displayValue('World.Weather', 'Clear', {}, labeler)).toBe('晴朗');
  });
  it('passes the value through when NO engine is hosted (old behaviour, never a crash)', () => {
    expect(displayValue('World.Weather', 'Clear', {}, null)).toBe('Clear');
  });
  it('keeps the raw value when the engine has no opinion on that path', () => {
    expect(displayValue('World.Mood', 'Playful', {}, labeler)).toBe('Playful');
  });
  it('keeps the raw value when the engine returns empty rather than erroring', () => {
    expect(displayValue('World.Weather', 'Clear', {}, () => '')).toBe('Clear');
  });
  it('survives a THROWING engine and reports it — never swallows', () => {
    const seen = [];
    const out = displayValue('World.Weather', 'Clear', {}, () => { throw new Error('boom'); }, (m, e) => seen.push([m, e.message]));
    expect(out).toBe('Clear');
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toContain('World.Weather');
    expect(seen[0][1]).toBe('boom');
  });
  it('hands the engine the full stat_data (it needs the game\'s own language)', () => {
    let got = null;
    displayValue('World.Weather', 'Clear', world(), (p, v, sd) => { got = sd; return v; });
    expect(got?.Preferences?.Lang?.[0]).toBe('zh-TW');
  });
  it('empty / missing values never reach the engine', () => {
    let calls = 0;
    const count = () => { calls++; return 'x'; };
    expect(displayValue('World.Weather', '', {}, count)).toBe('');
    expect(displayValue('World.Weather', null, {}, count)).toBe('');
    expect(calls).toBe(0);
  });
});

describe('pillStrings — the assembled pills', () => {
  it('renders every World field through the labeler (clock included — stub has no clock opinion here)', () => {
    const p = pillStrings(world(), labeler);
    expect(p.location).toBe('一年一班');
    expect(p.time).toBe('2026-04-08 (週三) 07:45 · 晴朗');
  });

  // THE REGRESSION THIS FILE EXISTS FOR: without a labeler the pills must still be the OLD strings,
  // exactly — proof the change can only improve a pill and never break a card with no engine.
  it('with no engine, degrades to precisely the raw-key output it always produced', () => {
    const p = pillStrings(world(), null);
    expect(p.location).toBe('School_Classroom');
    expect(p.time).toBe('2026-04-08 (Wed) 07:45 · Clear');
  });

  // The clock is the GAME'S to format — and the labeler is the game's voice. A labeler with no
  // clock opinion means the stored value shows verbatim (this module still holds zero clock
  // knowledge of its own); a labeler that DOES translate the clock — School answers civil time
  // for its extended 25:30 hours — is honored like any other field.
  it('no clock opinion -> the unconventional clock shows verbatim', () => {
    const p = pillStrings(world({ Time: ['25:30', 'Time'] }), labeler);
    expect(p.time).toBe('2026-04-08 (週三) 25:30 · 晴朗');
  });
  it('a labeler WITH a clock opinion is honored — the translation comes back through the ask', () => {
    const civil = (path, val) => path === 'World.Time' && val === '25:30' ? '01:30'
      : path === 'World.Date' && val === '2026-04-08' ? '2026-04-09'
      : path === 'World.Weekday' ? '週四' : labeler(path, val);
    const p = pillStrings(world({ Time: ['25:30', 'Time'] }), civil);
    expect(p.time).toBe('2026-04-09 (週四) 01:30 · 晴朗');
  });

  it('drops missing segments instead of leaving dangling separators', () => {
    expect(pillStrings(world({ Weather: ['', 'Weather'] }), labeler).time).toBe('2026-04-08 (週三) 07:45');
    expect(pillStrings(world({ Weekday: ['', 'Weekday'] }), labeler).time).toBe('2026-04-08 07:45 · 晴朗');
    expect(pillStrings(world({ Date: ['', 'Date'] }), labeler).time).toBe('07:45 · 晴朗');
    const bare = pillStrings({ World: {} }, labeler);
    expect(bare).toEqual({ location: '', time: '' });
  });

  // WALL CLOCK (2026-08-19). School publishes World.Wall* as its DISPLAY clock because World.Date/Time
  // are a CURSOR — where the story resumes, which after a day-ending reply is tomorrow morning, not the
  // scene just read. Preferring Wall* when present is a generic convention; absent or empty, nothing changes.
  it('prefers the published wall clock over the cursor', () => {
    const p = pillStrings(world({
      Date: ['2026-04-09', 'Date'], Time: ['07:30', 'Time'], Weekday: ['Thu', 'Weekday'],
      WallDate: ['2026-04-08', 'WD'], WallWeekday: ['Wed', 'WW'], WallTime: ['23:40', 'WT'],
    }), labeler, undefined, SCHOOL);
    expect(p.time).toBe('2026-04-08 (週三) 23:40 · 晴朗');
  });
  it('renders wall values through the labeler too, by their own path', () => {
    const seen = [];
    pillStrings(world({ WallDate: ['2026-04-08', 'WD'], WallWeekday: ['Wed', 'WW'], WallTime: ['23:40', 'WT'] }),
      (path, val) => { seen.push(path); return val; }, undefined, SCHOOL);
    expect(seen).toContain('World.WallDate');
    expect(seen).toContain('World.WallTime');
    expect(seen).not.toContain('World.Date');
  });
  it('falls back to the cursor when the wall clock is absent (a game that publishes none)', () => {
    expect(pillStrings(world(), labeler, undefined, SCHOOL).time).toBe('2026-04-08 (週三) 07:45 · 晴朗');
  });
  it('falls back per-field when a wall value is empty', () => {
    const p = pillStrings(world({ WallDate: ['', 'WD'], WallWeekday: ['', 'WW'], WallTime: ['23:40', 'WT'] }), labeler, undefined, SCHOOL);
    expect(p.time).toBe('2026-04-08 (週三) 23:40 · 晴朗');
  });

  // THE BLINDNESS GUARD (2026-08-19): with the default profile this module must not reach for a field
  // only one game publishes, even when that field is sitting right there in stat_data.
  it('the MAIN profile ignores a wall clock it was never told about', () => {
    const p = pillStrings(world({
      WallDate: ['1999-01-01', 'WD'], WallWeekday: ['Fri', 'WW'], WallTime: ['03:00', 'WT'],
    }), labeler, undefined, MAIN);
    expect(p.time).toBe('2026-04-08 (週三) 07:45 · 晴朗');
  });
  it('no profile at all behaves as MAIN', () => {
    const p = pillStrings(world({ WallTime: ['03:00', 'WT'] }), labeler);
    expect(p.time).toContain('07:45');
  });

  it('returns null when there is no World at all (caller keeps polling)', () => {
    expect(pillStrings({}, labeler)).toBeNull();
    expect(pillStrings(null, labeler)).toBeNull();
  });

  it('accepts bare values as well as MVU [value,label] tuples', () => {
    const p = pillStrings({ World: { Date: '2026-04-08', Time: '07:45', Weather: 'Rain', Location: 'School_Rooftop', Weekday: 'Wed' } }, labeler);
    expect(p.location).toBe('頂樓');
    expect(p.time).toBe('2026-04-08 (週三) 07:45 · 雨天');
  });
});

describe('mvuVal', () => {
  it('unwraps a tuple and passes a bare value through', () => {
    expect(mvuVal(['Clear', 'Weather'])).toBe('Clear');
    expect(mvuVal('Clear')).toBe('Clear');
    expect(mvuVal(undefined)).toBeUndefined();
  });
});
