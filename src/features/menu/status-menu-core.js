// features/menu/status-menu-core.js — PURE: find the StatusMenu's own HTML document inside whatever
// the card wraps it in. No host imports (tested by tests/status-menu-core.test.js).
//
// WHY (live 2026-09-08): the card's StatusMenu regex script used to BE the menu document. It is now
// the document wrapped in a platform envelope — an mvu-helper region div, begin/end marker comments,
// and a MARKDOWN CODE FENCE, which is how the block reaches SillyTavern's own renderer. Written into
// our iframe whole, the fence shows as literal ``` and the real `<!DOCTYPE html>` lands nested inside
// a div, so the browser drops the nested document element and the menu rendered as an empty coloured
// panel. Nothing was wrong with the menu; we were mounting its packaging.
//
// So the mount takes the DOCUMENT, not the wrapper. Located by shape, never by the wrapper's
// vocabulary: a card is free to change its region class, its marker comments or its fence, and this
// still finds the same document — which is the only reason a blind adapter can survive its
// consumers' packaging changing again.

import { scanTagBalance } from '../../shared/tag-balance-core.js';

// A doctype is invisible to the tag scanner (it is neither a comment nor an element), so it is found
// with its own search — and it must be KEPT: writing a document without one puts the iframe in quirks
// mode, where the menu's layout is not the layout it was authored against.
const RE_DOCTYPE = /<!doctype\b[^>]*>/gi;

/**
 * Pull the complete HTML document out of `raw`.
 *
 * @param {string} raw the card's StatusMenu source, wrapped or bare.
 * @returns {{html: string, wrapperChars: number}} `html` = the document (doctype included) when one
 *   is present, otherwise `raw` unchanged — a card whose menu is a bare fragment still mounts, and a
 *   TRUNCATED document (an <html> that never closes) is left alone rather than cut at a guessed
 *   boundary. `wrapperChars` = how much packaging was dropped; 0 means nothing was unwrapped.
 */
export function extractMenuDocument(raw) {
  const text = String(raw == null ? '' : raw);
  if (!text) return { html: '', wrapperChars: 0 };

  // The scanner walks <script>/<style> as raw text, so a '</html>' inside the menu's own JS or CSS
  // cannot be mistaken for the document's close.
  const open = scanTagBalance(text).events.find(
    (e) => e.kind === 'open' && e.status === 'matched' && /^html$/i.test(e.tag),
  );
  if (!open) return { html: text, wrapperChars: 0 };

  // Start at the doctype that introduces THIS document (the last one before the <html> open).
  let start = open.at;
  RE_DOCTYPE.lastIndex = 0;
  const before = text.slice(0, open.at);
  let m;
  while ((m = RE_DOCTYPE.exec(before)) !== null) start = m.index;

  const html = text.slice(start, open.pairEnd);
  return { html, wrapperChars: text.length - html.length };
}
