// genre-profile-core unit tests — which profile a given engine resolves to. v0.1
//
// The rule this file exists for: an engine this companion has never heard of must get the ORDINARY
// profile, not a broken one. Everything genre-specific now hangs off `profileFor`, so a wrong answer
// here means either a game losing a control it should have, or — worse — a game being handed another
// game's state paths.
import { describe, it, expect } from 'vitest';
import { profileFor, genreIds, MAIN, SCHOOL } from '../src/genre/genre-profile-core.js';

describe('profileFor — resolution', () => {
  it('resolves School by the name mvu-helper actually reports', () => {
    // engineInfo() reports the engine's own `name`, and School's bundle spells it capitalised.
    expect(profileFor('School')).toBe(SCHOOL);
  });

  it('is case-insensitive, because the folder id and the engine name are spelled differently', () => {
    for (const spelling of ['school', 'SCHOOL', 'School', '  School  ']) {
      expect(profileFor(spelling)).toBe(SCHOOL);
    }
  });

  // THE DEFAULT IS THE WHOLE POINT. RPG, Love and anything not yet written share MAIN.
  it('falls back to MAIN for an engine with no profile', () => {
    expect(profileFor('RPG')).toBe(MAIN);
    expect(profileFor('Love')).toBe(MAIN);
    expect(profileFor('something-nobody-has-written-yet')).toBe(MAIN);
  });

  it('falls back to MAIN when there is no engine at all', () => {
    // null = mvu-helper absent, engine still loading, or a plain card with no pack. All one fact here.
    expect(profileFor(null)).toBe(MAIN);
    expect(profileFor(undefined)).toBe(MAIN);
    expect(profileFor('')).toBe(MAIN);
    expect(profileFor('   ')).toBe(MAIN);
  });
});

describe('profile shape — what every genre must declare', () => {
  it('every registered profile is complete, so no consumer needs a null check', () => {
    for (const id of genreIds()) {
      const p = profileFor(id);
      expect(p.name, id).toBe(id);
      for (const slot of ['clockDate', 'clockWeekday', 'clockTime']) {
        expect(Array.isArray(p[slot]), `${id}.${slot}`).toBe(true);
        expect(p[slot].length, `${id}.${slot} must name at least one field`).toBeGreaterThan(0);
      }
      // advanceControl is optional, but if present it must be usable without further checks
      if (p.advanceControl) {
        expect(typeof p.advanceControl.bindPath, `${id}.advanceControl.bindPath`).toBe('string');
        expect(p.advanceControl.bindPath.length).toBeGreaterThan(0);
        expect(typeof p.advanceControl.label).toBe('string');
        expect(typeof p.advanceControl.title).toBe('string');
      }
    }
  });

  // The default genre must stay the PLAIN one. If MAIN ever grows a game's invented field or a control
  // only one game has, every unrelated card inherits it — which is the defect this directory undid.
  it('MAIN names only the plain World fields and declares no advance control', () => {
    expect(MAIN.clockDate).toEqual(['Date']);
    expect(MAIN.clockWeekday).toEqual(['Weekday']);
    expect(MAIN.clockTime).toEqual(['Time']);
    expect(MAIN.advanceControl).toBeNull();
  });

  it('School prefers its wall clock but still falls back to the plain fields', () => {
    // the fallback is what lets a save written before the wall clock existed still render a pill
    expect(SCHOOL.clockDate).toEqual(['WallDate', 'Date']);
    expect(SCHOOL.clockWeekday).toEqual(['WallWeekday', 'Weekday']);
    expect(SCHOOL.clockTime).toEqual(['WallTime', 'Time']);
  });

  it('profiles are frozen — a consumer cannot mutate another genre by accident', () => {
    expect(Object.isFrozen(MAIN)).toBe(true);
    expect(Object.isFrozen(SCHOOL)).toBe(true);
  });
});
