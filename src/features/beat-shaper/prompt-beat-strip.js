// galgame-companion · prompt-beat-strip — galgame's beat markup out of the past replies SillyTavern sends to the
// model (what is removed, what never is, and why: prompt-beat-strip-core.js).
//
// One hook per prompt shape. Both edit only the copy built for this request, never the saved chat, so the
// saved reply — the one copy galgame reads — keeps its beats, and an edit made in SillyTavern still shows in
// galgame's GUI:
//   • chat completion: CHAT_COMPLETION_PROMPT_READY carries the exact message list ST sends (openai.js),
//     after mvu-helper's own listener has swapped rendered images back to <pic> tags;
//   • text completion: GENERATE_BEFORE_COMBINE_PROMPTS carries finalMesSend, a per-build structuredClone of
//     the history that ST flattens into the prompt right after the event (script.js getCombinedPrompt).
// Both run after ST has counted tokens, so the request gets smaller instead of taking in older replies.
//
// Dry runs are stripped too (the transform holds no state) but never logged. The text-completion event
// carries no dry-run flag, so its line waits for GENERATE_AFTER_COMBINE_PROMPTS, which ST fires right after
// for the same build and which does.

import { log } from '../../env.js';
import { stripChatCompletionPrompt, stripTextCompletionPrompt } from './prompt-beat-strip-core.js';

let pendingTextCompletion = null;

function report(kind, stats) {
  if (!stats || !stats.replies) return;
  const n = (v) => v.toLocaleString('en-US');
  log.info(`prompt-beat-strip (${kind}): ${n(stats.replies)} past replies · ${n(stats.beatTags)} beat tags + ${n(stats.sceneLines)} backdrop lines removed · ${n(stats.charsBefore)} → ${n(stats.charsAfter)} chars`);
}

function onChatCompletionPromptReady(eventData) {
  try {
    const stats = stripChatCompletionPrompt(eventData && eventData.chat);
    if (!(eventData && eventData.dryRun)) report('chat completion', stats);
  } catch (e) {
    log.warn('prompt-beat-strip: stripping the chat-completion prompt failed — this request carries past replies with galgame\'s beat markup:', e);
  }
}

function onBeforeCombinePrompts(data) {
  try {
    pendingTextCompletion = stripTextCompletionPrompt(data);
  } catch (e) {
    pendingTextCompletion = null;
    log.warn('prompt-beat-strip: stripping the text-completion history failed — this request carries past replies with galgame\'s beat markup:', e);
  }
}

function onAfterCombinePrompts(eventData) {
  const stats = pendingTextCompletion;
  pendingTextCompletion = null;
  if (!(eventData && eventData.dryRun)) report('text completion', stats);
}

export function startPromptBeatStrip() {
  const te = window.tavern_events || {};
  if (typeof window.eventOn !== 'function') {
    log.warn('prompt-beat-strip: eventOn is not on this window — past replies reach the model with galgame\'s beat markup');
    return;
  }
  const hooks = [
    [te.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady, 'chat completion'],
    [te.GENERATE_BEFORE_COMBINE_PROMPTS, onBeforeCombinePrompts, 'text completion'],
    [te.GENERATE_AFTER_COMBINE_PROMPTS, onAfterCombinePrompts, 'text-completion log line'],
  ];
  const bound = [];
  for (const [event, listener, what] of hooks) {
    if (!event) {
      log.warn(`prompt-beat-strip: tavern_events has no event for the ${what} — that path is not stripped`);
      continue;
    }
    try {
      window.eventOn(event, listener);
      bound.push(what);
    } catch (e) {
      log.warn(`prompt-beat-strip: eventOn(${event}) failed — the ${what} is not stripped:`, e);
    }
  }
  if (bound.length) log.info(`prompt-beat-strip active (${bound.join(', ')}): past replies reach the model without <p> beats or backdrop lines, one blank line at every beat boundary`);
}
