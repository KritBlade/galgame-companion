/**
 * galgame-companion — StatusMenu document extraction (features/menu/status-menu-core.js).
 *
 * THE REGRESSION (live 2026-09-08): the card's StatusMenu regex script stopped BEING the menu
 * document and became the document wrapped in a platform envelope — an mvu-helper region div,
 * begin/end marker comments, and a markdown code fence. Written into the modal's iframe whole, the
 * fence showed as literal ``` and the real <!DOCTYPE html> landed nested inside a div, so the
 * browser dropped the document element and the School Menu opened as an empty coloured panel.
 *
 * Run:  npm test
 */
import { describe, it, expect } from 'vitest';
import { extractMenuDocument } from '../src/features/menu/status-menu-core.js';

const DOC_HTML = '<!DOCTYPE html>\n<html lang="en">\n<head><title>StatusMenu</title></head>\n<body><div id="app">hi</div></body>\n</html>';

// The exact envelope shape read off the live card.
const wrapped = (doc) => [
  '<div class="mvu-helper-region" data-mvu-helper="statusmenu" data-mvu-helper-contract="move or hide this element whole - do not walk into it">',
  '',
  '<!-- mvu-helper:begin statusmenu -->',
  '',
  '```',
  doc,
  '```',
  '',
  '<!-- mvu-helper:end statusmenu -->',
  '',
  '</div>',
].join('\n');

describe('extractMenuDocument', () => {
  it('THE REGRESSION: takes the document out of the region + fence envelope', () => {
    const r = extractMenuDocument(wrapped(DOC_HTML));
    expect(r.html).toBe(DOC_HTML);
    expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);   // quirks mode would re-lay-out the menu
    expect(r.html).not.toContain('```');
    expect(r.html).not.toContain('mvu-helper-region');
    expect(r.wrapperChars).toBeGreaterThan(0);
  });

  it('a bare document is returned untouched, and says nothing was unwrapped', () => {
    expect(extractMenuDocument(DOC_HTML)).toEqual({ html: DOC_HTML, wrapperChars: 0 });
  });

  it("'</html>' inside the menu's own script or style is not mistaken for the document close", () => {
    const tricky = '<!DOCTYPE html>\n<html>\n<head><style>/* </html> */</style></head>\n'
      + '<body><script>const s = "</html>";<\/script>\n<div id="app">real</div></body>\n</html>';
    const r = extractMenuDocument(wrapped(tricky));
    expect(r.html).toBe(tricky);
    expect(r.html).toContain('<div id="app">real</div>');       // nothing cut short
  });

  it('a menu that is a bare FRAGMENT (no <html>) still mounts, unchanged', () => {
    const fragment = '<div id="app">no document element here</div>';
    expect(extractMenuDocument(fragment)).toEqual({ html: fragment, wrapperChars: 0 });
  });

  it('a TRUNCATED document (<html> that never closes) is left alone, not cut at a guess', () => {
    const cut = '<!DOCTYPE html>\n<html>\n<body><div id="app">stops mid';
    expect(extractMenuDocument(wrapped(cut)).wrapperChars).toBe(0);
  });

  it('the doctype comes from THIS document, even when the wrapper text mentions one', () => {
    const withDecoy = '<div class="wrap">a doctype is written <!DOCTYPE decoy> in the prose</div>\n' + DOC_HTML;
    expect(extractMenuDocument(withDecoy).html).toBe(DOC_HTML);
  });

  it('junk input is a no-op', () => {
    expect(extractMenuDocument('')).toEqual({ html: '', wrapperChars: 0 });
    expect(extractMenuDocument(null)).toEqual({ html: '', wrapperChars: 0 });
  });
});
