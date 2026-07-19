// galgame-companion · choices — card-agnostic story-choice provider. v0.1
//
// A2 design (all-genre): galgame's "剧情选项 / Story choices" UI is a PURE READER of
// AutoCardUpdaterAPI.exportTableAsJson() → the 选项表/行动选项 sheet (galgame/src/ui/choices.js
// getOptionsFromDatabase). galgame never generates options itself; upstream that table is filled by
// the AutoCardUpdater (ACU) plugin via a SEPARATE table-fill AI call. We don't want ACU's machinery
// or its per-turn 2nd model call, so instead:
//   1. INJECT a tiny format instruction into the MAIN generation (setExtensionPrompt) asking the model
//      to append a <choices> block AFTER its narration close tag.
//   2. PARSE that block out of the current reply and expose it as a 选项表 sheet (via the shim in
//      location-time-bridge.js) so galgame's OWN pipeline (poll → button → auto-pop → select →
//      inject "<user>{value}。" + auto-send) renders it. Zero galgame edits, zero ACU dependency.
//
// WHY inline (not ACU's out-of-band call): the narrate model already holds full story context, so a
// <choices> block costs ~nothing extra and avoids a per-turn secondary generation.
// WHY after </maintext>: galgame renders ONLY <maintext> beats, so the block lands in beat-shaper's
// preserved TAIL — never displayed, never collides with beat-shaper's <p>-wrap / mvu-helper's <pic>
// index splice, and no strip pass is needed. beat-shaper leaves the tail verbatim, so the block is
// still readable here when we parse the (shaped) message. It DOES remain visible in the raw ST chat
// view outside galgame — acceptable for a galgame front-end (future: strip the tail in beat-shaper).
//
// GUARD: the inject is re-asserted per generation and cleared when galgame is absent, so a non-galgame
// chat sharing this script never gets the instruction.

import { DOC, topWindow, log } from './env.js';

const INJECT_KEY = 'galgame-companion-choices';
const OPTION_SHEET_KEY = 'sheet_gal_companion_options'; // galgame REQUIRES a "sheet_"-prefixed key (getOptionsFromDatabase)
const OPTION_SHEET_NAME = '选项表';                       // galgame matches sheet name ∈ {选项表, 行动选项}
const COL_TEXT = '选项内容';                              // galgame text col ∈ {选项内容, 选项文本, 内容, Text, …}
const COL_VALUE = '选项值';                              // galgame value col ∈ {选项值, 实际值, Value, Command, …}
const MAX_CHOICES = 6;                                   // galgame renders whatever we return; keep it sane

// The injected instruction — card-agnostic, no genre assumptions (the model already knows the story).
// `v` = the first-person action galgame sends verbatim as "<user>{v}。"; inner text = the button label.
const CHOICES_INSTRUCTION = [
  'At the very END of your reply, AFTER the closing tag of your narration (e.g. </maintext> or </gametxt>),',
  'output a player-choice block. Offer 3 to 5 distinct next actions — pick the count that fits the scene',
  '(more when the moment genuinely branches, fewer when it does not):',
  '<choices><c v="first-person action text">Verb-first action label</c>...</choices>',
  '- `v` = what the player does or says, in first person — sent verbatim as the player\'s next input.',
  '- Each label is an ACTION the player takes: START WITH A VERB and convey tone + target,',
  '  e.g. "Tease Mitsuki about her blush", "Coolly brush off Mana", "Pull Aoi aside to apologize".',
  '  NEVER a bare line of dialogue and never a lone verb — always verb + who/what + how.',
  'Write nothing after </choices>. Omit the block ONLY if the scene genuinely allows no meaningful choice.',
].join('\n');

const RE_CHOICES = /<choices>([\s\S]*?)<\/choices>/i;
const RE_C = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
const RE_V = /\bv\s*=\s*"([^"]*)"/i;

/**
 * Parse a <choices> block out of a raw reply into [{text, value}]. Pure.
 * @param {string} raw full raw message text
 * @returns {{text: string, value: string}[]}
 */
export function parseChoices(raw) {
  if (typeof raw !== 'string') return [];
  const block = raw.match(RE_CHOICES);
  if (!block) return [];
  const out = [];
  let m;
  RE_C.lastIndex = 0;
  while ((m = RE_C.exec(block[1])) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim(); // label (drop any stray inline tags)
    if (!text) continue;
    const vAttr = (m[1].match(RE_V) || [])[1];
    const value = (vAttr != null ? vAttr : text).trim(); // no v="" → send the label itself
    if (value) out.push({ text, value });
  }
  return out.slice(0, MAX_CHOICES);
}

// galgame's currently-displayed floor id (its overlay stamps it on the game container). The choice
// model is "current turn" — options belong to whatever reply galgame is showing.
function currentGalMesId() {
  try {
    const el = DOC.querySelector('#gal-global-overlay .gal-game-container');
    const v = el && el.getAttribute('data-mes-id');
    if (v == null || v === '') return -1;
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  } catch (e) {
    log.warn('choices: reading current gal mes id failed:', e);
    return -1;
  }
}

function rawMessage(id) {
  try {
    const arr = window.getChatMessages(id);
    const msg = Array.isArray(arr) ? arr[0] : arr;
    if (!msg) return null;
    if (msg.role && msg.role !== 'assistant') return null; // only AI replies carry choices
    return typeof msg.message === 'string' ? msg.message : (typeof msg.mes === 'string' ? msg.mes : null);
  } catch (e) {
    log.warn(`choices: getChatMessages(${id}) failed:`, e);
    return null;
  }
}

// Light cache so galgame's 1 s poll doesn't re-parse an unchanged reply every tick.
let _cache = { id: -1, len: -1, sheet: null };

/**
 * The shim (location-time-bridge) calls this to merge a 选项表 sheet into exportTableAsJson().
 * Reads galgame's current floor, parses its <choices>, returns { key, sheet } or null.
 * @returns {{ key: string, sheet: { name: string, content: string[][] } } | null}
 */
export function getOptionSheet() {
  const id = currentGalMesId();
  if (id < 0) return null;
  const raw = rawMessage(id);
  if (raw == null) return null;
  if (_cache.id === id && _cache.len === raw.length) return _cache.sheet; // cheap change-detect
  const parsed = parseChoices(raw);
  const sheet = parsed.length
    ? { key: OPTION_SHEET_KEY, sheet: { name: OPTION_SHEET_NAME, content: [[COL_TEXT, COL_VALUE], ...parsed.map((o) => [o.text, o.value])] } }
    : null;
  _cache = { id, len: raw.length, sheet };
  return sheet;
}

// Re-assert the inject each real generation based on current galgame presence (mirrors galgame's own
// GENERATION_STARTED pattern). Empty string clears it — so a non-galgame chat never gets instructed.
function applyInject(dryRun) {
  if (dryRun) return;
  let ctx = null;
  try { ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext(); }
  catch (e) { log.warn('choices: getContext threw:', e); return; }
  if (!ctx || typeof ctx.setExtensionPrompt !== 'function') return;
  const on = !!topWindow.galgame;
  try {
    // position IN_CHAT (1), depth 0, role SYSTEM (0) — the same slot galgame's own COT uses.
    ctx.setExtensionPrompt(INJECT_KEY, on ? CHOICES_INSTRUCTION : '', 1, 0, false, 0);
  } catch (e) {
    log.warn('choices: setExtensionPrompt failed:', e);
  }
}

export function startChoices() {
  if (typeof window.getChatMessages !== 'function' || typeof window.eventOn !== 'function') {
    log.warn('choices: TH globals (getChatMessages/eventOn) absent — choices provider disabled');
    return;
  }
  const te = window.tavern_events || {};
  if (!te.GENERATION_STARTED) {
    log.warn('choices: tavern_events.GENERATION_STARTED absent — inject disabled (shim reader still active)');
  } else {
    try {
      window.eventOn(te.GENERATION_STARTED, (_type, _option, dryRun) => applyInject(dryRun));
    } catch (e) {
      log.warn('choices: bind GENERATION_STARTED failed:', e);
    }
  }
  applyInject(false); // assert now so the next generation already carries it
  log.info('choices active (inject + 选项表 shim reader)');
}
