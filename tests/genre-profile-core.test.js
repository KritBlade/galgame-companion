// genre-profile-core unit tests — which profile a given engine resolves to, and its shape. v0.2
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
      // meterPanel is optional too; if present, every bar must name a path, a scale and a colour
      expect('meterPanel' in p, `${id}.meterPanel must be declared (null when none)`).toBe(true);
      if (p.meterPanel) {
        expect(typeof p.meterPanel.showWhen, `${id}.meterPanel.showWhen`).toBe('string');
        const groups = [p.meterPanel.player, p.meterPanel.cast].filter(Boolean);
        expect(groups.length, `${id}.meterPanel declares no group`).toBeGreaterThan(0);
        for (const g of groups) {
          expect(typeof g.root).toBe('string');
          expect(g.bars.length).toBeGreaterThan(0);
          for (const bar of g.bars) {
            expect(typeof bar.path, `${id} bar ${bar.key}`).toBe('string');
            expect(typeof bar.label).toBe('string');
            expect(typeof bar.color).toBe('string');
            expect(bar.maxPath || (typeof bar.max === 'number' && bar.max > 0), `${id} bar ${bar.key} needs a scale`).toBeTruthy();
          }
        }
        if (p.meterPanel.cast) {
          expect(typeof p.meterPanel.cast.presentPath).toBe('string');
          expect(typeof p.meterPanel.cast.namePath).toBe('string');
        }
      }
    }
  });

  // The default genre must stay the PLAIN one. If MAIN ever grows a game's invented field or a control
  // only one game has, every unrelated card inherits it — which is the defect this directory undid.
  it('MAIN names only the plain World fields and declares no advance control and no meters', () => {
    expect(MAIN.clockDate).toEqual(['Date']);
    expect(MAIN.clockWeekday).toEqual(['Weekday']);
    expect(MAIN.clockTime).toEqual(['Time']);
    expect(MAIN.advanceControl).toBeNull();
    expect(MAIN.meterPanel).toBeNull();
  });

  it("School's meters are gated on its H latch — outside a scene the bars would only cover the artwork", () => {
    expect(SCHOOL.meterPanel.showWhen).toBe('PendingState.IntimacyActive');
    expect(SCHOOL.meterPanel.player.root).toBe('Mainchar');
    expect(SCHOOL.meterPanel.cast.root).toBe('Classmate');
    expect(SCHOOL.meterPanel.cast.bars.map((b) => b.path)).toEqual(['Energy', 'Arousal', 'ClimaxGauge']);
  });

  it('School reads the plain civil clock like everyone else (v4 game-time model: Wall* is gone)', () => {
    expect(SCHOOL.clockDate).toEqual(['Date']);
    expect(SCHOOL.clockWeekday).toEqual(['Weekday']);
    expect(SCHOOL.clockTime).toEqual(['Time']);
  });

  it('profiles are frozen — a consumer cannot mutate another genre by accident', () => {
    expect(Object.isFrozen(MAIN)).toBe(true);
    expect(Object.isFrozen(SCHOOL)).toBe(true);
  });
});
