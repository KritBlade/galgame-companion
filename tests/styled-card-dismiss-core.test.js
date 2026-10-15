// styled-card-dismiss-core unit tests — a styled card closing the newest reply. v0.1
//
// galgame turns a click outside a styled card into NEXT. On the last page of the newest reply NEXT has
// nowhere to go, so the card used to stay over the backdrop until PREV. There, and only there, a click
// outside hides the card and the next one brings it back; every other click stays galgame's.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  styledCardClickAction, isProgressAtEnd, NOT_OUTSIDE_SELECTOR, DISMISSED_CLASS,
} from '../src/features/galgame-quirks/styled-card-dismiss-core.js';

// The page the user reported: the newest reply's last segment is a styled card, clicked outside.
const END_OF_NEWEST = {
  isStyledMode: true, hasCard: true, isOutsideCard: true, isCardDismissed: false,
  isLastSegment: true, hasLaterAiFloor: false,
};

describe('styledCardClickAction', () => {
  it('MUTATION TARGET — a click outside the card closing the newest reply hides it', () => {
    expect(styledCardClickAction(END_OF_NEWEST)).toBe('dismiss');
  });

  it('MUTATION TARGET — the next click outside brings the hidden card back', () => {
    expect(styledCardClickAction({ ...END_OF_NEWEST, isCardDismissed: true })).toBe('restore');
  });

  it('MUTATION TARGET — a card in the middle of a reply is left to galgame, whose NEXT advances', () => {
    expect(styledCardClickAction({ ...END_OF_NEWEST, isLastSegment: false })).toBe('pass');
  });

  it('MUTATION TARGET — a card closing an older reply is left to galgame, whose NEXT moves to the next reply', () => {
    expect(styledCardClickAction({ ...END_OF_NEWEST, hasLaterAiFloor: true })).toBe('pass');
  });

  it('MUTATION TARGET — a click on the card itself or on a control is never used', () => {
    expect(styledCardClickAction({ ...END_OF_NEWEST, isOutsideCard: false })).toBe('pass');
    expect(styledCardClickAction({ ...END_OF_NEWEST, isOutsideCard: false, isCardDismissed: true })).toBe('pass');
  });

  it('outside styled mode, or with no card on a shown stage, every click is galgame\'s', () => {
    expect(styledCardClickAction({ ...END_OF_NEWEST, isStyledMode: false })).toBe('pass');
    expect(styledCardClickAction({ ...END_OF_NEWEST, hasCard: false })).toBe('pass');
  });

  it('an empty or missing reading passes — the defaults never claim a click', () => {
    expect(styledCardClickAction()).toBe('pass');
    expect(styledCardClickAction({})).toBe('pass');
  });
});

describe('isProgressAtEnd', () => {
  it('MUTATION TARGET — galgame\'s 100% bar is the last segment', () => {
    expect(isProgressAtEnd('100%')).toBe(true);
  });

  it('any earlier segment is not the end', () => {
    expect(isProgressAtEnd('66.66666666666666%')).toBe(false);
    expect(isProgressAtEnd('99.9%')).toBe(false);
  });

  it('a bar galgame has not sized yet is not the end', () => {
    expect(isProgressAtEnd('')).toBe(false);
    expect(isProgressAtEnd(null)).toBe(false);
    expect(isProgressAtEnd(undefined)).toBe(false);
  });
});

describe('NOT_OUTSIDE_SELECTOR', () => {
  const parts = NOT_OUTSIDE_SELECTOR.split(',').map((s) => s.trim());

  it('MUTATION TARGET — the card container counts as the card, so a click on the card never hides it', () => {
    expect(parts).toContain('.gal-styled-stage-content');
  });

  it('keeps galgame\'s own controls and every interactive element out', () => {
    for (const sel of ['.gal-bottom-toolbar', '.gal-choice-layer', '.gal-popup-modal', 'button', 'a', 'input', '[data-action]']) {
      expect(parts).toContain(sel);
    }
  });

  it('a <label> counts as a control, since it forwards its click to one', () => {
    expect(parts).toContain('label');
  });
});

describe('the hiding CSS keys on the same class', () => {
  it('MUTATION TARGET — app/style.js hides the stage holding a card with DISMISSED_CLASS', () => {
    const css = readFileSync(new URL('../src/app/style.js', import.meta.url), 'utf8');
    expect(css).toContain(`.gal-styled-stage:has(> .gal-styled-stage-content > .${DISMISSED_CLASS})`);
  });
});
