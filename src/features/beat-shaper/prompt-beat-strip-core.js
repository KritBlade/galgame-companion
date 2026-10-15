// galgame-companion · prompt-beat-strip-core — PURE: galgame's beat markup out of the copy of each past reply
// that SillyTavern sends to the model (no TH globals, unit-testable). v1.0
//
// galgame builds its display beats from closed <p>…</p> tags and binds backdrops with <background scene/>
// lines, and it reads both from the SAVED reply. So the saved reply keeps them: the shaper writes them, and
// the model writes <p> itself whenever galgame's format rule is in the prompt. Every past reply then carries
// them back into the prompt, where they cost tokens and show the model nothing it needs.
//
// EVERY BEAT BOUNDARY BECOMES EXACTLY ONE BLANK LINE, whatever stood there: no whitespace, one newline,
// several, or a backdrop line. Deleting the tags alone is the failure this exists to prevent:
// `<p>A</p>\n<p>B</p>` reaches the model as `A\nB`, the model copies that single-newline layout, and the
// shaper — which splits bare prose on blank lines — wraps the whole story into one beat. A tag at the very
// start or end of the text has no neighbour on one side, so only the tag goes there.
//
// Never touched:
//   • the text inside a beat, its own single newlines included — a seam takes only ASCII whitespace, so a
//     full-width space opening a paragraph stays the story's indentation;
//   • machinery blocks (an image, a <pic>, a styled card …; beat-shaper-core's MACHINERY_BLOCK_SOURCE) —
//     a <p> inside one is that block's own HTML;
//   • any prompt entry that is not a past reply (the two prompt shapes, below). galgame's format rule
//     reaches the model as one of those, and its <p> examples must arrive whole.
import { RE_BACKGROUND_TAG, MACHINERY_BLOCK_SOURCE } from './beat-shaper-core.js';

// A beat tag: <p>, <p …> (galgame's TTS form is <p tts="…">) or </p>. The delimiter after `p` keeps
// <pic> and <pixiPerform> out.
const BEAT_TAG = '<\\/?p(?:\\s[^>]*)?>';
const RE_BEAT_TAG = new RegExp(BEAT_TAG, 'gi');
// Anything this file removes. A text with none of it comes back as the very same string.
const RE_HAS_MARKUP = new RegExp(`${BEAT_TAG}|<background\\b`, 'i');
// A seam: a run of beat tags and the ASCII whitespace around them.
const RE_SEAM = new RegExp(`[ \\t\\r\\n]*(?:${BEAT_TAG}[ \\t\\r\\n]*)+`, 'gi');

// The text in order, cut into machinery blocks (kept verbatim) and the rest. Two non-machinery parts are
// never adjacent, so a part with a neighbour has a machinery block there.
function splitAtMachinery(text) {
  const parts = [];
  let at = 0;
  for (const m of text.matchAll(new RegExp(MACHINERY_BLOCK_SOURCE, 'gi'))) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), machinery: false });
    parts.push({ text: m[0], machinery: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), machinery: false });
  return parts;
}

/**
 * One past reply, as it is about to be sent → the same reply without galgame's beat markup.
 * @param {string} text
 * @returns {{ text: string, beatTags: number, sceneLines: number }}
 *   beatTags = <p>/</p> tags removed; sceneLines = <background> lines removed. A text with neither comes
 *   back as the identical string.
 */
export function stripBeatMarkupForPrompt(text) {
  if (typeof text !== 'string' || !RE_HAS_MARKUP.test(text)) return { text, beatTags: 0, sceneLines: 0 };
  let beatTags = 0;
  let sceneLines = 0;
  const parts = splitAtMachinery(text);
  // Backdrop lines first, so a backdrop between two beats leaves a seam of beat tags and whitespace only.
  for (const part of parts) {
    if (part.machinery) continue;
    part.text = part.text.replace(RE_BACKGROUND_TAG, () => {
      sceneLines++;
      return '';
    });
  }
  parts.forEach((part, i) => {
    if (part.machinery) return;
    const machineryBefore = i > 0;
    const machineryAfter = i < parts.length - 1;
    part.text = part.text.replace(RE_SEAM, (seam, at, whole) => {
      beatTags += seam.match(RE_BEAT_TAG).length;
      const hasLeft = at > 0 || machineryBefore;
      const hasRight = at + seam.length < whole.length || machineryAfter;
      return hasLeft && hasRight ? '\n\n' : seam.replace(RE_BEAT_TAG, '');
    });
  });
  return { text: parts.map((part) => part.text).join(''), beatTags, sceneLines };
}

function emptyStats() {
  return { replies: 0, beatTags: 0, sceneLines: 0, charsBefore: 0, charsAfter: 0 };
}

// Strip one text into `stats`; a reply that carried no markup is not counted.
function stripCounted(text, stats) {
  const result = stripBeatMarkupForPrompt(text);
  if (result.text !== text) {
    stats.replies++;
    stats.beatTags += result.beatTags;
    stats.sceneLines += result.sceneLines;
    stats.charsBefore += text.length;
    stats.charsAfter += result.text.length;
  }
  return result.text;
}

/**
 * CHAT COMPLETION — CHAT_COMPLETION_PROMPT_READY's `chat`: the exact message list ST is about to send.
 * Past replies (role 'assistant') are stripped in place; system and user messages are never touched. A
 * multimodal entry carries its text in `content` parts: each text part is stripped, image parts are kept.
 * @param {Array<{role: string, content: string|Array<object>}>} chat
 * @returns {{ replies: number, beatTags: number, sceneLines: number, charsBefore: number, charsAfter: number }}
 */
export function stripChatCompletionPrompt(chat) {
  const stats = emptyStats();
  if (!Array.isArray(chat)) return stats;
  for (const entry of chat) {
    if (!entry || entry.role !== 'assistant') continue;
    if (typeof entry.content === 'string') {
      entry.content = stripCounted(entry.content, stats);
    } else if (Array.isArray(entry.content)) {
      for (const part of entry.content) {
        if (part && part.type === 'text' && typeof part.text === 'string') part.text = stripCounted(part.text, stats);
      }
    }
  }
  return stats;
}

/**
 * TEXT COMPLETION — GENERATE_BEFORE_COMBINE_PROMPTS's data. `finalMesSend` is this build's copy of the chat
 * history, which ST flattens into the prompt string right after the event, so its items are edited in place.
 * Items carry no role, and only past replies hold beat markup. Depth injections arrive as `injected` items
 * or in `extensionPrompts` (galgame's format rule is a world-info entry at depth 0), and neither is touched.
 * ST runs this same path for chat completion (api 'openai') and discards the string it builds; the chat
 * hook covers that API, so this returns null there.
 * @param {{ api: string, finalMesSend: Array<{message: string, extensionPrompts: string[], injected?: boolean}> }} data
 * @returns {null | { replies: number, beatTags: number, sceneLines: number, charsBefore: number, charsAfter: number }}
 */
export function stripTextCompletionPrompt(data) {
  if (!data || data.api === 'openai' || !Array.isArray(data.finalMesSend)) return null;
  const stats = emptyStats();
  for (const item of data.finalMesSend) {
    if (!item || item.injected === true || typeof item.message !== 'string') continue;
    item.message = stripCounted(item.message, stats);
  }
  return stats;
}
