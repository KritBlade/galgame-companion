// galgame-companion · i18n core tests — the overlay never rewrites a node another translator keyed.
import { describe, it, expect } from 'vitest';
import { KEYED_BY_ANOTHER_TRANSLATOR, isKeyedByAnotherTranslator } from '../src/features/i18n/i18n-core.js';

// A stand-in element: attribute names and a parent, with closest() answering the selector the way the DOM
// does for a list of bare attribute selectors ("[a],[b]").
function element(attributes = [], parent = null) {
  const node = {
    attributes: new Set(attributes),
    parent,
    closest(selector) {
      const wanted = selector.split(',').map((part) => part.trim().replace(/^\[|\]$/g, ''));
      for (let at = node; at; at = at.parent) {
        if (wanted.some((name) => at.attributes.has(name))) return at;
      }
      return null;
    },
  };
  return node;
}

describe('isKeyedByAnotherTranslator', () => {
  it('a node keyed for its text, its tooltip or its placeholder belongs to that translator', () => {
    expect(isKeyedByAnotherTranslator(element(['data-i18n']))).toBe(true);
    expect(isKeyedByAnotherTranslator(element(['data-i18n-title']))).toBe(true);
    expect(isKeyedByAnotherTranslator(element(['data-i18n-placeholder']))).toBe(true);
  });

  it('anything inside a keyed node is that translator\'s output too', () => {
    const keyed = element(['data-i18n']);
    expect(isKeyedByAnotherTranslator(element([], element(['class'], keyed)))).toBe(true);
  });

  it('galgame\'s own GUI keys nothing, so the overlay translates it', () => {
    expect(isKeyedByAnotherTranslator(element(['class', 'title'], element(['id'])))).toBe(false);
  });

  it('a missing element (a text node with no parent) is not keyed', () => {
    expect(isKeyedByAnotherTranslator(null)).toBe(false);
    expect(isKeyedByAnotherTranslator({})).toBe(false);
  });

  it('the selector names all three conventions', () => {
    expect(KEYED_BY_ANOTHER_TRANSLATOR.split(',')).toEqual(['[data-i18n]', '[data-i18n-title]', '[data-i18n-placeholder]']);
  });
});
