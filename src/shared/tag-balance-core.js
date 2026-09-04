// shared/tag-balance-core.js — generic tag-balance scanner: WHERE the markup is broken, never how to
// fix it. v0.1
//
// WHY THIS EXISTS (2026-09-05): mis-emitted tags kept arriving one novel shape at a time — a matched
// <think> pair, then an orphan </think> (2026-08), then an unclosed <think> that ran straight into
// <maintext> (2026-09-04) — and each shape got its own detection fork with its own regexes. This file
// replaces every future fork's DETECTION half with one scan: tokenize all tags, walk a stack, and
// report each tag's resolution with positions. REPAIR stays with the caller (beat-shaper's §0b/§4c
// policies), because where a missing closer belongs is semantics no scanner can know — an HTML parser
// would close the leaked <think> at end-of-input, swallowing the whole game text.
//
// TOKENIZER COPIED from node-html-parser (github.com/taoqf/node-html-parser, MIT, © 2019 Tao Qiufeng)
// src/nodes/html.ts — kMarkupPattern and the base_parse stack walk, battle-tested against the
// attribute/comment edge cases a hand-rolled regex gets wrong for a year (quoted '>' inside
// attributes, both quote styles, comments). Kept verbatim, including its charset quirks (\x37F).
// WHAT IS DELIBERATELY NOT COPIED:
//   • the DOM tree — nothing here needs one; events with positions are the whole product.
//   • the HTML implicit-close tables (kElementsClosedBy*) and silent recovery — a validator that
//     quietly fixes is the failure mode this file exists to end. An imbalance is REPORTED, only.
//   • the <documentfragmentcontainer> frame trick and CDATA — tree/HTML concerns, not ours.
//
// PURE: no host imports, no logging (a caller logs findings — this file cannot know which ones
// matter). Tag-name pairing is CASE-INSENSITIVE, matching how every consumer in this stack matches
// tags (/i regexes in beat-shaper, galgame, mvu-helper); events carry the original spelling.

// node-html-parser's kMarkupPattern, verbatim (minus the CDATA variant). Group 1: leading slash.
// Group 2: tag name — must START with a letter, so prose '<3', '$\rightarrow$' and CJK '<美月>'
// never tokenize. The charset's \x37F quirk (parsed as \x37 + the range F-\u1FFF) admits most ASCII
// punctuation after the first letter, so a card oddity like '<konatan_planning~>' tokenizes and pairs
// like any tag — kept verbatim, because proven-in-production beats a silent "fix" of the quirk.
// Group 3: attributes (quote-aware — a '>' inside quotes does not end the tag). Group 4: self-close.
const kMarkupPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][-.:0-9_a-zA-Z@\xB7\xC0-\xD6\xD8-\xF6\u00F8-\u03A1\u03A3-\u03D9\u03DB-\u03EF\u03F7-\u03FF\u0400-\u04FF\u0500-\u052F\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E00-\u1E9B\u1F00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2126\u212A-\u212B\u2132\u214E\u2160-\u2188\u2C60-\u2C7F\uA722-\uA787\uA78B-\uA78E\uA790-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA7FF\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64-\uAB65\uFB00-\uFB06\uFB13-\uFB17\uFF21-\uFF3A\uFF41-\uFF5A\x37F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*)((?:\s+[^>]*?(?:(?:'[^']*')|(?:"[^"]*"))?)*)\s*(\/?)>/gu;

// HTML's void elements (node-html-parser's default VoidTag list): an open IS the whole element, no
// closer ever comes, so one must never be reported missing. Extendable per call for a consumer's own
// closer-less tags.
const DEFAULT_VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

// Elements whose CONTENT is raw text, never markup (node-html-parser's blockTextElements default):
// scanning inside them would report every '<' of CSS/JS as a tag. The close is found by literal
// string search, exactly as upstream does.
const DEFAULT_RAW_TEXT_TAGS = ['script', 'noscript', 'style', 'pre'];

/**
 * Scan `text` for tag-balance problems. One pass, no tree, nothing repaired.
 *
 * @param {string} text
 * @param {{voidTags?: string[], rawTextTags?: string[]}} [options] both lists REPLACE the defaults
 *   (exported below) rather than extend them, so a caller states its whole contract in one place.
 * @returns {{events: Array<{tag: string, kind: 'open'|'close'|'self'|'void', at: number, end: number,
 *   status: 'matched'|'orphan-close'|'unclosed-open', pairAt?: number, pairEnd?: number}>,
 *   findings: Array<same>}} `events` = every tag token in source order; `findings` = the subset whose
 *   status is not 'matched'. An 'unclosed-open' whose close never came reports the OPEN's position —
 *   which is where a repair policy has to look, not end-of-input.
 */
export function scanTagBalance(text, options = {}) {
  const src = String(text || '');
  const voidTags = new Set((options.voidTags || DEFAULT_VOID_TAGS).map((t) => t.toLowerCase()));
  const rawTextTags = new Set((options.rawTextTags || DEFAULT_RAW_TEXT_TAGS).map((t) => t.toLowerCase()));

  const events = [];
  const stack = []; // open events awaiting their close

  const re = new RegExp(kMarkupPattern.source, kMarkupPattern.flags); // fresh lastIndex per call
  let match;
  while ((match = re.exec(src))) {
    const { 0: matchText, 1: leadingSlash, 2: tagName, 4: closingSlash } = match;
    const at = re.lastIndex - matchText.length;
    const end = re.lastIndex;
    if (matchText[1] === '!') continue; // comment
    const lower = tagName.toLowerCase();

    if (!leadingSlash) {
      if (closingSlash || voidTags.has(lower)) {
        events.push({ tag: tagName, kind: closingSlash ? 'self' : 'void', at, end, status: 'matched' });
        continue;
      }
      const ev = { tag: tagName, kind: 'open', at, end, status: 'unclosed-open' }; // proven wrong by its close
      events.push(ev);
      stack.push(ev);
      if (rawTextTags.has(lower)) {
        // Raw-text content: jump to the literal closer, exactly as upstream. No closer → the open
        // stays on the stack and is reported at end-of-input.
        const closeMarkup = `</${tagName}>`;
        const closeIndex = src.toLowerCase().indexOf(closeMarkup.toLowerCase(), re.lastIndex);
        if (closeIndex !== -1) {
          const closeEnd = closeIndex + closeMarkup.length;
          ev.status = 'matched';
          ev.pairAt = closeIndex;
          ev.pairEnd = closeEnd;
          events.push({ tag: tagName, kind: 'close', at: closeIndex, end: closeEnd, status: 'matched', pairAt: at, pairEnd: end });
          stack.pop();
          re.lastIndex = closeEnd;
        }
      }
      continue;
    }

    // Closing tag. Search the stack from the top; a match DEEPER down proves everything above it
    // never got its close (upstream silently auto-closes those — the one behavior this file refuses).
    let found = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag.toLowerCase() === lower) { found = i; break; }
    }
    if (found === -1) {
      events.push({ tag: tagName, kind: 'close', at, end, status: 'orphan-close' });
      continue;
    }
    for (let i = stack.length - 1; i > found; i--) stack.pop(); // those stay status 'unclosed-open'
    const open = stack.pop();
    open.status = 'matched';
    open.pairAt = at;
    open.pairEnd = end;
    events.push({ tag: tagName, kind: 'close', at, end, status: 'matched', pairAt: open.at, pairEnd: open.end });
  }
  // Whatever is still open at end-of-input never got its close; the events already carry
  // status 'unclosed-open' and the OPEN position — nothing to synthesize.

  return { events, findings: events.filter((e) => e.status !== 'matched') };
}

export { DEFAULT_VOID_TAGS, DEFAULT_RAW_TEXT_TAGS };
