// next-block-core unit tests — whether a genre gets an advance chip, and what that chip is. v0.1
//
// The bug this file exists for: the chip's existence was decided ONCE at boot, before the engine had
// loaded, so School's control never appeared (live 2026-08-19). The decision was extracted here so it
// can be held still; the tests below pin BOTH halves of it — the answer itself, and the fact that the
// answer is allowed to change during a session.
import { describe, it, expect } from 'vitest';
import { advanceControlFor, chipHtml, flagFromStatData, flagActionRequest, MENU_ACTION_MESSAGE, WRAP_CLASS, CB_CLASS, PATH_ATTR } from '../src/features/galgame-bridge/next-block-core.js';
import { MAIN, SCHOOL } from '../src/genre/genre-profile-core.js';

describe('advanceControlFor — who gets a chip', () => {
  it('gives School its own flag path', () => {
    expect(advanceControlFor(SCHOOL)).toEqual({
      bindPath: 'PendingState.BlockDone',
      label: 'Next',
      title: SCHOOL.advanceControl.title,
    });
  });

  it('gives the ordinary genre nothing', () => {
    expect(advanceControlFor(MAIN)).toBeNull();
  });

  // "No genre yet" is the state at boot, and it must read as "no chip", never as a chip bound to
  // whatever a default happens to name.
  it('gives nothing when no profile has resolved', () => {
    expect(advanceControlFor(null)).toBeNull();
    expect(advanceControlFor(undefined)).toBeNull();
    expect(advanceControlFor({})).toBeNull();
  });

  // A path is the whole contract: the chip drives the game's own checkbox by path. A control with no
  // usable path would render a button that writes nowhere — a dead control reads worse than none.
  it('refuses a control whose path is missing or blank', () => {
    for (const bad of [undefined, null, '', '   ']) {
      expect(advanceControlFor({ advanceControl: { bindPath: bad, label: 'X', title: 'Y' } })).toBeNull();
    }
  });

  it('trims the path, so a stray space cannot break the selector it is spliced into', () => {
    const got = advanceControlFor({ advanceControl: { bindPath: '  Some.Flag  ' } });
    expect(got.bindPath).toBe('Some.Flag');
  });

  // Generic wording on purpose — a genre that advances something other than a time block must not
  // inherit another genre's vocabulary just because it left the words out.
  it('fills in genre-neutral wording when a profile names only a path', () => {
    const got = advanceControlFor({ advanceControl: { bindPath: 'Turn.Advance' } });
    expect(got.label).toBe('Next');
    expect(got.title).toContain('next segment');
    expect(got.title.toLowerCase()).not.toContain('block');
    expect(got.title.toLowerCase()).not.toContain('school');
  });

  // THE REGRESSION. The answer must follow the profile it is handed, every time — a caller that asks
  // at boot (no engine) and again after the engine loads must get different answers. If this ever
  // returns a remembered first answer, the live bug is back.
  it('answers from the profile given NOW, not the first one it ever saw', () => {
    expect(advanceControlFor(MAIN)).toBeNull();          // boot: engine not loaded yet
    expect(advanceControlFor(SCHOOL)).not.toBeNull();    // later: engine loaded
    expect(advanceControlFor(MAIN)).toBeNull();          // and back again (pack switched away)
  });
});

describe('chipHtml — the markup handed to the overlay', () => {
  const control = advanceControlFor(SCHOOL);

  it('is a <label> so the whole chip is clickable, not just the 16px box', () => {
    expect(chipHtml(control).startsWith('<label ')).toBe(true);
  });

  it('carries the classes the bridge and the stylesheet look for', () => {
    const html = chipHtml(control);
    expect(html).toContain(`class="${WRAP_CLASS}"`);
    expect(html).toContain(`class="${CB_CLASS}"`);
    expect(html).toContain('type="checkbox"');
  });

  // The stamp is how a chip left by a previous genre is recognised as stale rather than assumed
  // current — the same latching mistake, one layer down.
  it('stamps the path it drives, so a stale chip can be told apart from a current one', () => {
    expect(chipHtml(control)).toContain(`${PATH_ATTR}="PendingState.BlockDone"`);
  });

  it('shows the profile’s own label text', () => {
    expect(chipHtml(control)).toContain('>Next<');
  });

  // Not a sanitiser — the words come from this repo — but an apostrophe or quote in a title must not
  // end the attribute early and swallow the rest of the chip.
  it('escapes quotes in the wording instead of letting them close the attribute', () => {
    const html = chipHtml(advanceControlFor({
      advanceControl: { bindPath: 'P.F', label: 'A & B', title: `it's "here" <now>` },
    }));
    expect(html).not.toContain(`it's`);
    expect(html).toContain('&#39;');
    expect(html).toContain('&quot;');
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('<now>');
    // still well formed: exactly the tags we opened, none introduced by the wording
    expect(html.match(/</g).length).toBe(5); // <label  <span  </span  <input  </label
  });
});

// The flag used to be read and written through the StatusMenu's own checkbox, reached inside a
// TavernHelper frame. A contained frame has an opaque origin, so the flag is read off stat_data and
// written through the verb that checkbox posts. MUTATION (recorded): return `cur` without unwrapping
// the [value, label] pair → the labelled-false case reads true and fails.
describe('flagFromStatData — the flag, off the state the menu draws from', () => {
  it('unwraps a [value, label] pair the way the menu checkbox does', () => {
    expect(flagFromStatData({ PendingState: { BlockDone: [true, 'Time Block Done'] } }, 'PendingState.BlockDone')).toBe(true);
    expect(flagFromStatData({ PendingState: { BlockDone: [false, 'Time Block Done'] } }, 'PendingState.BlockDone')).toBe(false);
    expect(flagFromStatData({ PendingState: { BlockDone: true } }, 'PendingState.BlockDone')).toBe(true);
  });
  it('no state, no member, a scalar in the way — false, never a throw', () => {
    expect(flagFromStatData(null, 'PendingState.BlockDone')).toBe(false);
    expect(flagFromStatData({}, 'PendingState.BlockDone')).toBe(false);
    expect(flagFromStatData({ PendingState: 5 }, 'PendingState.BlockDone')).toBe(false);
  });
});

describe('flagActionRequest — the verb the menu checkbox posts', () => {
  it('is setValue on the mvu-helper action wire, at the profile path', () => {
    expect(flagActionRequest('PendingState.BlockDone', 1, 'r1')).toEqual({
      type: 'mvu-statusmenu-action', requestId: 'r1', action: 'setValue',
      args: { path: 'PendingState.BlockDone', value: true, scopePath: '' },
    });
    expect(MENU_ACTION_MESSAGE).toBe('mvu-statusmenu-action');
    expect(flagActionRequest('X.Y', 0, 7).args.value).toBe(false);
  });
});
