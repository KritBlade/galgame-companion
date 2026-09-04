/**
 * galgame-companion — tag-balance scanner tests (shared/tag-balance-core.js).
 *
 * The scanner is the DETECTION half of every mis-emitted-tag defense: it reports what is broken and
 * where, and repairs nothing. Cases below are the live shapes this stack has actually eaten time on —
 * the unclosed <think> (2026-09-04), the orphan </think> (2026-08), plus the prose/markup noise a
 * real reply carries that must never tokenize as a tag.
 *
 * Run:  npm test
 */
import { describe, it, expect } from 'vitest';
import { scanTagBalance } from '../src/shared/tag-balance-core.js';

const findings = (text, options) => scanTagBalance(text, options).findings;

describe('scanTagBalance — balanced markup is silent', () => {
  it('matched custom-tag pairs produce zero findings', () => {
    const r = scanTagBalance('<maintext>\n<p>a</p>\n<p>b</p>\n</maintext>\n<UpdateVariable>x</UpdateVariable>');
    expect(r.findings).toEqual([]);
    expect(r.events.filter((e) => e.kind === 'open').length).toBe(4);
  });

  it('void tags and self-closing tags never owe a closer', () => {
    expect(findings('<img src="/a.png"> <br> <roll/> <StatusPlaceHolderImpl/>')).toEqual([]);
  });

  it('the rendered auto-img-wrap (nested spans) is balanced', () => {
    const wrap = '<span class="auto-img-wrap" data-rawtag="&lt;pic char=&quot;M&quot;&gt;"><img src="/a.png"><span class="auto-img-regen"></span></span>';
    expect(findings(wrap)).toEqual([]);
  });

  it("a '>' inside a quoted attribute does not end the tag (the copied tokenizer's whole point)", () => {
    expect(findings('<c v="a > b">choice</c>')).toEqual([]);
  });

  it('tag-name pairing is case-insensitive, like every consumer regex in this stack', () => {
    expect(findings('<Think>x</think>')).toEqual([]);
  });

  it('comments are skipped whole, even when they contain tag-shaped text', () => {
    expect(findings('<!--gc:hidden\n<classmate_trait_check>\n-->')).toEqual([]);
  });
});

describe('scanTagBalance — prose noise never tokenizes', () => {
  it('math, kaomoji, CJK brackets, escaped tags: zero events', () => {
    const prose = 'A $\\rightarrow$ B, score < 3, i <3 u, 「<美月>」, &lt;pic char="M"&gt;';
    expect(scanTagBalance(prose).events).toEqual([]);
  });

  it("a tag name with '~' tokenizes (the copied charset's \\x37F quirk admits it) and pairs cleanly", () => {
    const r = scanTagBalance('<konatan_planning~>\nplan\n</konatan_planning~>');
    expect(r.findings).toEqual([]);
    expect(r.events.map((e) => e.kind)).toEqual(['open', 'close']);
  });

  it('raw-text elements are not scanned inside (CSS "<" is not markup)', () => {
    expect(findings('<style>.a { width: calc(1px < 2px); } </style>')).toEqual([]);
  });
});

describe('scanTagBalance — the findings, with positions', () => {
  it('THE LIVE BUG (2026-09-04): an unclosed <think> reports the OPEN position, not end-of-input', () => {
    const raw = '<think><konatan_planning~>\nplan\n</konatan_planning~>\n<maintext>\n<p>a</p>\n</maintext>';
    const f = findings(raw);
    // maintext + p are balanced; think is the only finding, anchored at its open.
    expect(f).toEqual([{ tag: 'think', kind: 'open', at: 0, end: 7, status: 'unclosed-open' }]);
  });

  it('THE 2026-08 SHAPE: an orphan </think> is reported at the close', () => {
    const raw = 'plan text\n</think>\n<maintext><p>a</p></maintext>';
    const f = findings(raw);
    expect(f.length).toBe(1);
    expect(f[0]).toMatchObject({ tag: 'think', kind: 'close', status: 'orphan-close', at: raw.indexOf('</think>') });
  });

  it('a close matching DEEPER in the stack proves the tags above it unclosed (no silent auto-close)', () => {
    const raw = '<outer><inner>x</outer>';
    const f = findings(raw);
    expect(f).toEqual([{ tag: 'inner', kind: 'open', at: 7, end: 14, status: 'unclosed-open' }]);
  });

  it('a matched pair carries its partner positions (what a repair policy cuts between)', () => {
    const raw = '<think>plan</think>rest';
    const { events } = scanTagBalance(raw);
    const open = events.find((e) => e.kind === 'open');
    expect(open).toMatchObject({ status: 'matched', at: 0, end: 7, pairAt: raw.indexOf('</think>'), pairEnd: raw.indexOf('</think>') + '</think>'.length });
  });

  it('an unclosed raw-text element is still reported (a <style> that never closes)', () => {
    const f = findings('<style>.a { color: red }');
    expect(f).toEqual([{ tag: 'style', kind: 'open', at: 0, end: 7, status: 'unclosed-open' }]);
  });

  it('several independent findings arrive in source order', () => {
    const raw = '</a>\n<b>\n<c>x</c>';
    const f = findings(raw);
    expect(f.map((e) => `${e.status}:${e.tag}`)).toEqual(['orphan-close:a', 'unclosed-open:b']);
  });

  it('junk input is a no-op', () => {
    expect(scanTagBalance('').events).toEqual([]);
    expect(scanTagBalance(null).events).toEqual([]);
  });
});
