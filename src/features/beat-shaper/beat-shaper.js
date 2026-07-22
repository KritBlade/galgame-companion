// galgame-companion · beat-shaper — deterministic reshaping of AI replies into galgame's beat
// contract (plan: mvu-helper plans/GALGAME_DUMB_TERMINAL_PLAN.md §4 C1). v0.1
//
// Event-driven wrapper around the pure transform in beat-shaper-core.js: on MESSAGE_RECEIVED /
// MESSAGE_UPDATED, read the floor's raw text (TH getChatMessages), shape it, and write it back
// (TH setChatMessages) ONLY when the text actually changed.
//
// WHY THESE TRIGGERS / LOOP + RACE SAFETY (verified against the real sources 2026-07-17):
// - mvu-helper's imagegen captures <pic> tag string-INDICES at MESSAGE_RECEIVED and splices the
//   rendered <img> in by those indices AFTER a multi-second generation await (image-gen.js
//   REPLACE path). Rewriting the message meanwhile would corrupt that splice — so the core
//   DEFERS ('pics-pending') while any raw <pic> remains, and we retry on the MESSAGE_UPDATED
//   that mvu-helper emits once every tag has been replaced.
// - TH setChatMessages mutates chat[id] IN PLACE (_.set(t,'mes',…) + swipes[swipe_id] sync,
//   JS-Slash-Runner dist) → mvu-helper's `chat[mesId] !== message` race guard still passes.
// - Our write uses refresh:'affected', which re-renders the floor and fires
//   CHARACTER_MESSAGE_RENDERED — NOT one of our trigger events, so no self-loop; galgame's
//   .mes_text MutationObserver picks the re-render up and re-parses. Belt-and-braces: the
//   transform is idempotent, and a per-floor in-flight set blocks re-entry.

import { topWindow, log } from '../../env.js';
import { shapeMessage } from './beat-shaper-core.js';

const inFlight = new Set(); // message ids currently being shaped (re-entrancy guard)
const deferralLogged = new Set(); // one deferral log per floor per reason — not one per event

function rawMessage(id) {
  try {
    const arr = window.getChatMessages(id);
    const msg = Array.isArray(arr) ? arr[0] : arr;
    if (!msg) return null;
    if (msg.role && msg.role !== 'assistant') return null; // only AI replies carry beats
    return typeof msg.message === 'string' ? msg.message : (typeof msg.mes === 'string' ? msg.mes : null);
  } catch (e) {
    log.warn(`beat-shaper: getChatMessages(${id}) failed:`, e);
    return null;
  }
}

async function onMessageEvent(messageId) {
  const id = Number(messageId);
  if (!Number.isFinite(id) || id < 0) return;
  if (inFlight.has(id)) return;
  // galgame absent → its parser will never read the shaping; don't rewrite the user's chat text.
  if (!topWindow.galgame) return;

  const raw = rawMessage(id);
  if (raw === null) return;

  const { text, changed, deferred, stats } = shapeMessage(raw, id);

  if (deferred) {
    const key = `${id}:${deferred}`;
    if (!deferralLogged.has(key)) {
      deferralLogged.add(key);
      log.info(`beat-shaper msg=${id}: deferred (${deferred}) — will retry on next message event`);
    }
    return;
  }
  deferralLogged.forEach((k) => { if (k.startsWith(`${id}:`)) deferralLogged.delete(k); });

  if (!changed) return;

  inFlight.add(id);
  try {
    await window.setChatMessages([{ message_id: id, message: text }], { refresh: 'affected' });
    log.info(
      `beat-shaper msg=${id}:${stats.renamed ? ' gametxt→maintext' : ''} wrapped=${stats.wrapped}p ` +
      `scenes=${stats.scenes}${stats.scenes ? ' (hoisted #1)' : ''} strippedScenes=${stats.strippedScenes}` +
      `${stats.strippedBgimg ? ` strippedBgimg=${stats.strippedBgimg}` : ''}${stats.hidden ? ` hiddenBlocks=${stats.hidden}` : ''}`,
    );
  } catch (e) {
    log.warn(`beat-shaper: setChatMessages(${id}) failed — message left unshaped:`, e);
  } finally {
    inFlight.delete(id);
  }
}

export function startBeatShaper() {
  if (
    typeof window.getChatMessages !== 'function' ||
    typeof window.setChatMessages !== 'function' ||
    typeof window.eventOn !== 'function'
  ) {
    log.warn('beat-shaper: TH globals (getChatMessages/setChatMessages/eventOn) absent — shaper disabled');
    return;
  }
  const te = window.tavern_events || {};
  let bound = 0;
  for (const ev of [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED]) {
    if (!ev) continue;
    try {
      window.eventOn(ev, onMessageEvent);
      bound++;
    } catch (e) {
      log.warn(`beat-shaper: eventOn(${ev}) failed:`, e);
    }
  }
  if (bound === 0) {
    log.warn('beat-shaper: no tavern message events available — shaper disabled');
    return;
  }
  log.info(`beat-shaper active (${bound} event(s) bound)`);
}
