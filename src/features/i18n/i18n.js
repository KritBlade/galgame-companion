// galgame-companion · i18n — GUI translation overlay for bigmalove/galgame. v0.3
// MutationObserver over the PARENT document + exact-match dictionary keyed by the RENDERED
// Chinese text. Only replaces explicit dictionary/pattern hits, and never a node another
// translator keyed — SillyTavern's own UI or another extension's (i18n-core.js) (GCP §2).
// Untranslated new strings just stay Chinese.
// A pattern rule receives this translator as its second argument, so a capture that is itself
// on-screen text (an error message inside a toast) gets the dictionary and every pattern too.
// Harvest mode records every miss → __galI18nDump() downloads the key list (phase G1 loop).

import { DOC, log } from '../../env.js';
import { DICT, PATTERNS } from './i18n-dict.js';
import { isKeyedByAnotherTranslator } from './i18n-core.js';

const HARVEST = false; // true while the dictionary is being filled (G1); false for release (G5)
const ATTRS = ['placeholder', 'title', 'aria-label']; // attributes we also translate
const CJK = /[一-鿿㐀-䶿豈-﫿]/; // "does this string contain Chinese?"

// ── harvest bucket ────────────────────────────────────────────────────────────
const missing = new Set();

function exposeHarvest() {
  try {
    window.parent.__galI18nMissing = missing;
    window.parent.__galI18nDump = () => {
      const arr = [...missing].sort();
      const json = JSON.stringify(Object.fromEntries(arr.map((s) => [s, ''])), null, 2);
      console.log(`[galgame-i18n] ${arr.length} untranslated strings:\n` + json);
      const blob = new Blob([json], { type: 'application/json' });
      const a = DOC.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'galgame-i18n-missing.json';
      a.click();
      return arr;
    };
  } catch (e) {
    // cross-origin parent would land here; harvest is a dev nicety, translation still works
    log.warn('i18n: could not expose harvest helpers on parent window:', e);
  }
}

// ── core: translate one string ────────────────────────────────────────────────
function translate(raw) {
  const key = raw.trim();
  if (!key || !CJK.test(key)) return null; // nothing to do
  if (DICT[key] !== undefined) {
    return raw.replace(key, DICT[key]); // exact hit — preserve surrounding whitespace
  }
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) return raw.replace(key, fn(m, translateInner));
  }
  if (HARVEST) missing.add(key); // record the miss
  return null;
}

// The translation of a captured piece, or the piece itself when nothing matches.
function translateInner(text) {
  return translate(text) ?? text;
}

function doTextNode(node) {
  if (isKeyedByAnotherTranslator(node.parentElement)) return;
  const out = translate(node.nodeValue);
  if (out !== null && out !== node.nodeValue) node.nodeValue = out;
}

function doAttrs(el) {
  if (isKeyedByAnotherTranslator(el)) return;
  for (const name of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(name)) continue;
    const out = translate(el.getAttribute(name));
    if (out !== null) el.setAttribute(name, out);
  }
}

// sweep a subtree: text nodes + attributes
function sweep(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) return doTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  doAttrs(root);
  const walker = DOC.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) doTextNode(n);
  if (root.querySelectorAll) {
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(doAttrs);
  }
}

// ── observer (rAF-batched) ────────────────────────────────────────────────────
let scheduled = false;
const pending = new Set();

function flush() {
  scheduled = false;
  for (const node of pending) sweep(node);
  pending.clear();
}

const observer = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    if (mut.type === 'characterData') pending.add(mut.target);
    else if (mut.type === 'attributes') pending.add(mut.target);
    else mut.addedNodes.forEach((n) => pending.add(n));
  }
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
});

export function startI18n() {
  if (!DOC || !DOC.body) return setTimeout(startI18n, 200);
  exposeHarvest();
  sweep(DOC.body); // initial pass for anything already rendered
  observer.observe(DOC.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  log.info('i18n active' + (HARVEST ? ' (harvest mode — run __galI18nDump() when done)' : ''));
}
