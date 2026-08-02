// galgame-companion · beat-shaper — deterministic reshaping of AI replies into galgame's beat
// contract (plan: mvu-helper plans/GALGAME_DUMB_TERMINAL_PLAN.md §4 C1). v0.2
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
import { shapeMessage, sceneUid, shortHash } from './beat-shaper-core.js';

const inFlight = new Set(); // message ids currently being shaped (re-entrancy guard)
const deferralLogged = new Set(); // one deferral log per floor per reason — not one per event

// ── chat identity (feeds the scene uid's chatKey half, core §2.1) ─────────────
// SillyTavern's chat id, resolved in galgame's OWN order (its special-cg-trigger.js
// collectCurrentChatCandidates tries the global getter first, then the context field) so both sides
// agree on what "this chat" means. null when neither is reachable.
export function currentChatId() {
  try {
    const getter = topWindow.getCurrentChatId;
    if (typeof getter === 'function') {
      const id = getter.call(topWindow);
      if (id) return String(id);
    }
  } catch (e) {
    log.warn('beat-shaper: getCurrentChatId() threw — falling back to the context field:', e);
  }
  try {
    const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === 'function'
      ? topWindow.SillyTavern.getContext() : null;
    if (ctx && ctx.chatId) return String(ctx.chatId);
  } catch (e) {
    log.warn('beat-shaper: SillyTavern.getContext() threw — chat id unresolved:', e);
  }
  return null;
}

// Compact, stable key for the current chat. null propagates: the image-seam REFUSES to sweep without
// one rather than risk deleting another chat's backdrops (core §2.1).
export function currentChatKey() {
  const id = currentChatId();
  return id ? shortHash(id) : null;
}

// Chat id unreachable — the names still work (uid uniqueness does not depend on the key); only the
// orphan sweep is scoped out, and it declines to run rather than guess. Marked in the name so a
// record written under this condition is recognisable in galgame's Background Manager.
const UNKNOWN_CHAT_KEY = 'nochat';
const UID_RANDOM_LEN = 6;

// 6 base36 chars ≈ 2.1e9 values. Uniqueness only has to hold WITHIN one chat (a few hundred messages),
// where the collision odds are ~1e-4 — and a collision merely reproduces the old shared-name bug for
// one pair, it cannot corrupt anything else.
function randomToken() {
  let out = '';
  while (out.length < UID_RANDOM_LEN) out += Math.random().toString(36).slice(2);
  return out.slice(0, UID_RANDOM_LEN);
}

function mintUidForCurrentChat() {
  return sceneUid(currentChatKey() || UNKNOWN_CHAT_KEY, randomToken());
}

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

  const { text, changed, deferred, stats } = shapeMessage(raw, mintUidForCurrentChat);

  if (deferred) {
    const key = `${id}:${deferred}`;
    if (!deferralLogged.has(key)) {
      deferralLogged.add(key);
      log.image(`beat-shaper msg=${id}: deferred (${deferred}) — will retry on next message event`);
    }
    return;
  }
  deferralLogged.forEach((k) => { if (k.startsWith(`${id}:`)) deferralLogged.delete(k); });

  if (!changed) return;

  inFlight.add(id);
  try {
    await window.setChatMessages([{ message_id: id, message: text }], { refresh: 'affected' });
    log.image(
      `beat-shaper msg=${id}:${stats.renamed ? ' gametxt→maintext' : ''} wrapped=${stats.wrapped}p ` +
      `scenes=${stats.scenes}${stats.scenes ? ' (hoisted #1)' : ''} strippedScenes=${stats.strippedScenes}` +
      `${stats.uid ? ` uid=${stats.uid}(${stats.uidMinted ? 'minted' : 'kept'})` : ''}` +
      `${stats.strippedBgimg ? ` strippedBgimg=${stats.strippedBgimg}` : ''}${stats.hidden ? ` hiddenBlocks=${stats.hidden}` : ''}` +
      // ALWAYS printed, including the 0 case: "rolls=0" is the difference between "this reply had no
      // check" and "the roll rendering silently failed", which a conditional suffix would blur. Both
      // halves are named because rolls=3 alone cannot tell a fully-marked reply from an unmarked one.
      ` rolls=${stats.rolls}(placed=${stats.rollsPlaced} unplaced=${stats.rollsUnplaced})`,
    );
    // A short/missing marker set is a CARD-PROMPT defect, not a companion one: the roll still shows,
    // but at the top instead of its moment. Warn so it is fixable, and name the count so it is obvious
    // whether the narrator skipped one marker or all of them.
    if (stats.rollsUnplaced) {
      log.warn(
        `beat-shaper msg=${id}: ${stats.rollsUnplaced} of ${stats.rolls} roll(s) had no <roll/> marker ` +
        'in <gametxt> — shown as a beat at the TOP instead of at the moment they resolved. The narrator ' +
        'should emit one <roll/> per <combat_log> line, in the same order.',
      );
    }
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
  log.image(`beat-shaper active (${bound} event(s) bound)`);
}
