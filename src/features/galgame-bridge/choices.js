// galgame-companion · choices — card-agnostic story-choice provider. v0.7
//
// BUTTON-ONLY: the choice panel NEVER auto-pops. galgame's checkAndRenderOptions auto-shows the panel when
// options are new AND the reader is on the last segment (or a panel was already open) — which fires over UNREAD
// narration on short / few-segment replies. We can't patch galgame's internal renderGalgameChoices call, so
// instead we DISMISS any panel that opens WITHOUT a recent click on the "剧情选项 / Story choices" button
// (enforceButtonOnlyChoices), and on each real new generation fire galgame's own dismiss so its read-gate
// re-applies per message. The pending-choices BUTTON is untouched — options are never lost; the reader opens
// them when ready.
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

import { DOC, topWindow, log } from '../../env.js';
import { isGalgameModeFlagOn, GALGAME_MODE_FLAG_PATH } from './galgame-mode-core.js';

const INJECT_KEY = 'galgame-companion-choices';
const OPTION_SHEET_KEY = 'sheet_gal_companion_options'; // galgame REQUIRES a "sheet_"-prefixed key (getOptionsFromDatabase)
const OPTION_SHEET_NAME = '选项表';                       // galgame matches sheet name ∈ {选项表, 行动选项}
const COL_TEXT = '选项内容';                              // galgame text col ∈ {选项内容, 选项文本, 内容, Text, …}
const COL_VALUE = '选项值';                              // galgame value col ∈ {选项值, 实际值, Value, Command, …}
const MAX_CHOICES = 6;                                   // galgame renders whatever we return; keep it sane

// The injected instruction — card-agnostic, no genre assumptions (the model already knows the story).
// `v` = the first-person action galgame sends verbatim as "<user>{v}。"; inner text = the button label.
//
// "LAST, after every other block" — NOT "the reply ends here" (live suppression, 2026-08-15). The
// original wording was "at the very END of your reply … Write nothing after </choices>", and the model
// obeyed it at the expense of everyone else: a preset that mandates its own trailing block (a World
// State <details> summary) simply stopped emitting it whenever galgame mode was on, because our
// depth-0 inject outranked the preset's instruction. This inject may order its OWN block; it has no
// business truncating the reply.
//
// SECOND ITERATION, SAME LESSON (2026-08-15): the first rewrite said other blocks may sit "at the
// START of your reply or after the narration" — naming both placements but leaving the model to pick,
// and depth-0 recency pulled a preset's head-of-reply INTERNAL THOUGHTS block down to just before the
// choices. Any positional phrase in this inject about OTHER blocks becomes an order. So the rule now
// positions ONLY the choice block, and the one thing said about everything else is a counter-order:
// keep the exact position your own instructions gave you — head blocks stay at the head. (galgame's
// own COT example opens the reply at <maintext>, which already pressures head blocks toward the tail;
// this line is the counterweight, and it is the part that keeps working when that COT changes.)
// THE COUNT DEFERS, AND THE DEFERRAL COMES FIRST (2026-09-08): a card may assign the options — slot by
// slot, with its own genre content — and a count rule that says "fewer when the moment does not branch"
// lets the model drop assigned slots. Stated as a trailing "unless" after "3 to 5", the deferral lost
// live: six assigned, three offered. Depth-0 recency makes the first clause the order, so the assigned
// case is stated first and the 3-to-5 default is the fallback sentence. This inject never knows what
// the slots ARE — the card does — so it stays card-agnostic.
const CHOICES_INSTRUCTION = [
  'Also append ONE player-choice block as the very last block of your reply, outside the narration',
  'tags (after </maintext> / </gametxt>):',
  '<choices><c v="first-person action text">Verb-first action label</c>...</choices>',
  '- `v` = what the player does or says, in first person — sent verbatim as the player\'s next input.',
  '- Each label is an ACTION the player takes: START WITH A VERB and convey tone + target,',
  '  e.g. "Tease Mitsuki about her blush", "Coolly brush off Mana", "Pull Aoi aside to apologize".',
  '  NEVER a bare line of dialogue and never a lone verb — always verb + who/what + how.',
  'WHICH actions: if another instruction in your context ASSIGNS the options (what each one is, in what',
  'order), offer exactly those, in that order, as many as it assigns — skip one only when the source it',
  'names is absent, never because the scene seems not to call for it. Only when nothing assigns them,',
  'offer 3 to 5 distinct actions — more when the moment genuinely branches, fewer when it does not.',
  'This rule positions ONLY the choice block and relocates NOTHING else: every other block keeps the',
  'exact position its own instructions give it. A block that belongs BEFORE the narration (thoughts,',
  'plans, state) still goes BEFORE the opening narration tag — never moved to the end; a block that',
  'belongs after the narration stays there. Never move or drop another block because of this rule.',
  'Omit the choice block ONLY if the scene genuinely allows no meaningful choice.',
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

// Is the player IN galgame mode right now? galgame present on the page AND its own per-character mode
// flag ON (galgame-mode-core says why presence alone is not enough). Read through Tavern-Helper's
// `getVariables`, a bare global in this script iframe like `getChatMessages` above; the store is the
// same one galgame's buttons write, so a toggle mid-session is seen on the next generation.
function isGalgameModeOn() {
  if (!topWindow.galgame) return false;
  if (typeof window.getVariables !== 'function') {
    log.warn(`choices: getVariables is not on this window — cannot read ${GALGAME_MODE_FLAG_PATH}; treating galgame mode as OFF`);
    return false;
  }
  try {
    return isGalgameModeFlagOn(window.getVariables({ type: 'character' }));
  } catch (e) {
    log.warn(`choices: reading ${GALGAME_MODE_FLAG_PATH} threw — treating galgame mode as OFF:`, e);
    return false;
  }
}

// The last decision, so the log says something only when the answer CHANGES — a line per generation
// would drown the pipeline log for a state that flips a few times a session at most.
let _lastInjectOn = null;

// Re-assert the inject each real generation from the live galgame MODE (mirrors galgame's own
// GENERATION_STARTED pattern). Empty string clears it — so a chat outside galgame mode never gets
// instructed, whether galgame is absent or merely switched off for this character.
function applyInject(dryRun) {
  if (dryRun) return;
  let ctx = null;
  try { ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext(); }
  catch (e) { log.warn('choices: getContext threw:', e); return; }
  if (!ctx || typeof ctx.setExtensionPrompt !== 'function') return;
  const on = isGalgameModeOn();
  if (on !== _lastInjectOn) {
    _lastInjectOn = on;
    log.info(`choices: galgame mode ${on ? 'ON' : 'OFF'} (${topWindow.galgame ? GALGAME_MODE_FLAG_PATH : 'galgame not on the page'}) → choice instruction ${on ? 'injected' : 'cleared'}`);
  }
  try {
    // position IN_CHAT (1), depth 0, role SYSTEM (0) — the same slot galgame's own COT uses.
    ctx.setExtensionPrompt(INJECT_KEY, on ? CHOICES_INSTRUCTION : '', 1, 0, false, 0);
  } catch (e) {
    log.warn('choices: setExtensionPrompt failed:', e);
  }
}

// Break galgame's choice CARRY-OVER (upstream choices.js checkAndRenderOptions): once its panel is visible,
// the next reply's options auto-pop INSTANTLY, skipping galgame's own read-gate (it otherwise pops only when
// the reader reaches the last beat). On each REAL new generation we fire galgame's OWN dismiss — a backdrop
// click on #gal-layer-choices, whose handler (`e.target === this` → hideGalgameChoices(true)) sets its internal
// _galgameChoicesVisible=false — so the read-gate re-applies per message and choices auto-show only AFTER the
// story is read. `layer.click()` sets e.target to the layer itself, exactly matching the backdrop-click guard.
// The panel is mounted in the parent doc (DOC), same as the overlay. Degrades to a no-op if it isn't open.
function dismissStaleChoices() {
  try {
    const layer = DOC.getElementById('gal-layer-choices');
    if (layer && layer.classList.contains('active')) {
      layer.click();
      log.info('choices: dismissed stale choice panel for new generation (read-gate re-applies)');
    }
  } catch (e) {
    log.warn('choices: dismissStaleChoices failed:', e);
  }
}

// BUTTON-ONLY enforcement (v0.3): suppress galgame's auto-pop so the choice panel opens ONLY on an explicit click
// of the "剧情选项 / Story choices" button. We can't block galgame's internal renderGalgameChoices() call, so we
// watch #gal-layer-choices for the `active` class and, unless a button click set the panel active moments ago,
// DISMISS it via galgame's own backdrop-click path (layer.click() → e.target===layer → hideGalgameChoices(true),
// which keeps the pending button). A capture-phase listener on the button stamps the allow-window BEFORE galgame's
// bubble-phase handler runs renderGalgameChoices, so a user open is never dismissed.
const USER_OPEN_WINDOW_MS = 1500;
let _userOpenedChoicesAt = 0;

function enforceButtonOnlyChoices() {
  try {
    DOC.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('[data-action="show-choices"]')) _userOpenedChoicesAt = Date.now();
    }, true); // capture — fires before galgame's delegated bubble handler that opens the panel

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target;
        if (el && el.id === 'gal-layer-choices' && el.classList && el.classList.contains('active')) {
          if (Date.now() - _userOpenedChoicesAt > USER_OPEN_WINDOW_MS) {
            el.click(); // auto-pop → galgame's own dismiss (pending button stays; options never lost)
            log.info('choices: suppressed auto-pop (button-only) — panel dismissed, 剧情选项 button stays');
          }
        }
      }
    });
    observer.observe(DOC, { subtree: true, attributes: true, attributeFilter: ['class'] });
  } catch (e) {
    log.warn('choices: enforceButtonOnlyChoices setup failed (auto-pop not suppressed):', e);
  }
}

export function startChoices() {
  if (typeof window.getChatMessages !== 'function' || typeof window.eventOn !== 'function') {
    log.warn('choices: TH globals (getChatMessages/eventOn) absent — choices provider disabled');
    return;
  }
  enforceButtonOnlyChoices();
  const te = window.tavern_events || {};
  if (!te.GENERATION_STARTED) {
    log.warn('choices: tavern_events.GENERATION_STARTED absent — inject disabled (shim reader still active)');
  } else {
    try {
      window.eventOn(te.GENERATION_STARTED, (_type, _option, dryRun) => { if (!dryRun) dismissStaleChoices(); applyInject(dryRun); });
    } catch (e) {
      log.warn('choices: bind GENERATION_STARTED failed:', e);
    }
  }
  applyInject(false); // assert now so the next generation already carries it
  log.info('choices active (inject + 选项表 shim reader)');
}
