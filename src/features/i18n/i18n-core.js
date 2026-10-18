// galgame-companion · i18n core — which page nodes the overlay may translate. v0.1
// Pure: unit-tested in tests/i18n-core.test.js; the overlay (i18n.js) asks it before every rewrite.
//
// The overlay watches the whole SillyTavern page, because galgame renders its GUI there. Other translators
// share that page: SillyTavern keys its own UI with data-i18n (an attribute as "[title]key"), and extensions
// follow the same convention (data-i18n, data-i18n-title, data-i18n-placeholder). galgame keys none of its GUI,
// so a keyed node — or anything inside one — holds another translator's choice, and the overlay leaves it alone.
// Rewriting it would put galgame's English over that translator's language (an extension's Chinese 取消 read
// back as "Cancel").

export const KEYED_BY_ANOTHER_TRANSLATOR = '[data-i18n],[data-i18n-title],[data-i18n-placeholder]';

/** Is `element`, or an element it sits inside, keyed by another translator? `element` may be null. */
export function isKeyedByAnotherTranslator(element) {
  return !!(element && typeof element.closest === 'function' && element.closest(KEYED_BY_ANOTHER_TRANSLATOR));
}
