// galgame-companion · beat-shaper — deterministic reshaping of AI replies into galgame's beat
// contract (plan: mvu-helper plans/GALGAME_DUMB_TERMINAL_PLAN.md §4 C1). v0.3
//
// Event-driven wrapper around the pure transform in beat-shaper-core.js: on MESSAGE_RECEIVED /
// MESSAGE_UPDATED, read the floor's raw text (TH getChatMessages), shape it, and write it back
// (TH setChatMessages) ONLY when the text actually changed.
//
// WHY THESE TRIGGERS / LOOP + RACE SAFETY (verified against the real sources 2026-07-17):
// - mvu-helper's imagegen splices the rendered <img> in AFTER a multi-second generation await
//   (image-gen.js REPLACE path). Since 2026-07-22 it RE-ANCHORS each splice by searching the
//   CURRENT text for the raw tag, so our edits shifting offsets is a non-event — we shape the
//   message immediately and hold back only the scene binding (core §3b), retrying it on the
//   MESSAGE_UPDATED mvu-helper emits once every tag has been replaced. It used to defer the whole
//   transform; see core §3b for why an unreachable image backend then took the GUI down with it.
// - TH setChatMessages mutates chat[id] IN PLACE (_.set(t,'mes',…) + swipes[swipe_id] sync,
//   JS-Slash-Runner dist) → mvu-helper's `chat[mesId] !== message` race guard still passes.
// - Our write uses refresh:'affected', which re-renders the floor and fires
//   CHARACTER_MESSAGE_RENDERED — NOT one of our trigger events, so no self-loop; galgame's
//   .mes_text MutationObserver picks the re-render up and re-parses. Belt-and-braces: the
//   transform is idempotent, and a per-floor in-flight set blocks re-entry.

import { topWindow, log, warnToast } from '../../env.js';
import { shapeMessage, sceneUid, shortHash, repairTruncatedEnvelope } from './beat-shaper-core.js';
import { isSillyTavernBusy } from '../galgame-quirks/index.js';

const inFlight = new Set(); // message ids currently being shaped (re-entrancy guard)
const deferralLogged = new Set(); // one deferral log per floor per reason — not one per event
// One incomplete-reply toast per message, keyed `${id}:${reason}`. Without this the GENERATION_ENDED
// retry + every later MESSAGE_UPDATED (image splices) would each re-toast the same dead turn.
const incompleteToasted = new Set();

// ── incomplete-reply detection (§4b) ─────────────────────────────────────────
// TWO independent ways a generation can end without a usable turn, and the player must be told
// about BOTH because the consequence is identical and invisible: the prose advanced the story and
// the ENGINE DID NOT MOVE. Next turn the narrator reads that prose as fact while stat_data says it
// never happened, and the divergence compounds silently from there.
//
//   • envelope    — no </maintext>|</gametxt>. Cut off mid-output; also breaks galgame's parser.
//   • no-updatevar— envelope closed, but no <UpdateVariable> at all. Either the cut landed after
//                   the closing tag, or the narrator simply omitted it. Either way RES gets no
//                   Intent, resolves nothing, and the reply LOOKS complete — which makes this the
//                   more dangerous of the two.
//
// A greeting / imported first message legitimately has no <UpdateVariable>, so id 0 is exempt.
const RE_HAS_UPDATEVAR = /<UpdateVariable>/i;
const RE_ENVELOPE_CLOSE = /<\/maintext>|<\/gametxt>/i;
const RE_ENVELOPE_OPEN = /<maintext>|<gametxt>/i;

function incompleteReplyReason(raw, id) {
  if (id === 0) return null;                            // greeting: no engine turn is expected
  if (!RE_ENVELOPE_OPEN.test(raw)) return null;         // not a galgame-format reply at all
  if (!RE_ENVELOPE_CLOSE.test(raw)) return 'envelope';
  if (!RE_HAS_UPDATEVAR.test(raw)) return 'no-updatevar';
  return null;
}

// The player-facing half. Deliberately says REGENERATE rather than "continue": a continue can
// truncate again at the same ceiling and leaves a stitched reply, while a regenerate is one action
// with a clean result. Nothing is auto-recovered — that is the user's call to make, not ours.
function toastIncompleteReply(id, reason) {
  const key = `${id}:${reason}`;
  if (incompleteToasted.has(key)) return;
  incompleteToasted.add(key);
  const why = reason === 'envelope'
    ? 'the reply was CUT OFF mid-output'
    : 'the reply carries no <UpdateVariable> block';
  warnToast(`Incomplete reply (message ${id}): ${why}, so NO game state was applied this turn — stats, time and relationships did not move. Regenerate this message.`);
  log.warn(`beat-shaper msg=${id}: incomplete reply (${reason}) — no state applied this turn; player advised to regenerate.`);
}

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

// STASH THE STRIPPED CoT WHERE A HUMAN CAN READ IT (extra.reasoning — ST's Thinking panel).
// §0b removes the leaked chain-of-thought because the player must not read it; that stays. What
// changed 2026-08-11 is that it is no longer DESTROYED on the way out. ST never held this text
// (parseReasoningFromString needs both tags and this is a close with no open), so before this the
// strip was the end of it — and a turn whose reasoning vanished looked exactly like a turn that
// never reasoned. `parsed` is ST's own label for reasoning recovered out of message text.
//
// WHY NOT setChatMessages({extra}), WHICH IS HOW THIS MODULE WRITES EVERYTHING ELSE: TH's extra
// branch guards on `data?.swipes_info` (chat_message.ts:257) while ST's field is `swipe_info` —
// TH's own reader uses the singular (:123). So the guard is ALWAYS true on a real message and
// :258 rebuilds swipe_info as an array of empty objects, wiping every OTHER swipe's extra (its
// reasoning, model, image data) to write ours. An in-place merge touches one field of one slot and
// cannot take siblings with it. Written BEFORE the text write on purpose: setChatMessages ends in
// saveChatConditional (:173), so one save persists both.
function stashStrippedReasoning(id, cot) {
    if (!cot) return;
    try {
        const context = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
        const message = context && Array.isArray(context.chat) ? context.chat[id] : null;
        if (!message) return;
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        const already = String(message.extra.reasoning || '');
        if (already.includes(cot)) return;                       // a re-shape must not stack duplicates
        message.extra.reasoning = already ? `${already}\n\n${cot}` : cot;
        // Never overwrite a type ST set itself — only claim the slot when it is empty.
        if (!message.extra.reasoning_type) message.extra.reasoning_type = 'parsed';
        // Keep the swipe's own copy in step, or swiping away and back reads the stale one.
        const swipe = message.swipe_id ?? 0;
        if (Array.isArray(message.swipe_info) && message.swipe_info[swipe] && message.swipe_info[swipe] !== message.extra) {
            message.swipe_info[swipe].reasoning = message.extra.reasoning;
            if (!message.swipe_info[swipe].reasoning_type) message.swipe_info[swipe].reasoning_type = 'parsed';
        }
        // Paint it now; without this the panel only appears after the message is next re-rendered.
        if (typeof context.updateReasoningUI === 'function') context.updateReasoningUI(id);
    } catch (e) {
        log.warn(`beat-shaper msg=${id}: could not stash the stripped reasoning (it is still removed from the reply, just not kept):`, e);
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

  // Tell the player BEFORE any repair — the repair fixes the display, never the lost turn, and a
  // repaired message looks healthy afterwards. Only once ST is idle: mid-stream every reply is
  // legitimately "incomplete".
  if (!isSillyTavernBusy()) {
    const reason = incompleteReplyReason(raw, id);
    if (reason) toastIncompleteReply(id, reason);
    else incompleteToasted.forEach((k) => { if (k.startsWith(`${id}:`)) incompleteToasted.delete(k); });
  }

  let { text, changed, deferred, stats } = shapeMessage(raw, mintUidForCurrentChat);

  // §4b: an unclosed envelope means "still streaming" ONLY while something is actually generating.
  // Once ST is idle it means TRUNCATED — the closing tag is never coming, so deferring forever
  // leaves galgame parsing raw text (which blocked the whole GUI once — see repairTruncatedEnvelope).
  // Repair, then re-shape the repaired text so this turn still gets its normal treatment.
  if ((deferred === 'maintext-unclosed' || deferred === 'gametxt-unclosed') && !isSillyTavernBusy()) {
    const repair = repairTruncatedEnvelope(raw);
    if (repair) {
      log.warn(
        `beat-shaper msg=${id}: reply is TRUNCATED — no ${repair.closeTag} and ST is idle, so it is never coming. ` +
        `Inserted ${repair.closeTag} after the last complete </p>; ${repair.droppedChars} char(s) of partial output now sit ` +
        'OUTSIDE the envelope (kept, not deleted). The turn likely emitted no <UpdateVariable>, so RES resolved nothing — ' +
        'check the narrator\'s max response tokens.',
      );
      ({ text, changed, deferred, stats } = shapeMessage(repair.text, mintUidForCurrentChat));
      changed = true;   // the repair itself is a change even if shaping found nothing else to do
    } else {
      log.warn(`beat-shaper msg=${id}: reply is TRUNCATED with no complete </p> to close after — leaving it raw (galgame may mis-parse it).`);
    }
  }

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
    stashStrippedReasoning(id, stats.strippedThinkText);
    await window.setChatMessages([{ message_id: id, message: text }], { refresh: 'affected' });
    log.image(
      `beat-shaper msg=${id}:${stats.renamed ? ' gametxt→maintext' : ''} wrapped=${stats.wrapped}p ` +
      // picsPending is named EXPLICITLY: without it `scenes=0` reads as "scene binding ran and found
      // nothing", when in fact it was the one step deliberately held back (core §3b). Same line, two
      // very different situations — one is normal for a text-only reply, the other means an image is
      // still generating (or its backend is wedged) and backdrops are still owed.
      `scenes=${stats.scenes}${stats.scenes ? ' (hoisted #1)' : ''}` +
      `${stats.picsPending ? ' [scene binding HELD BACK — raw <pic> still un-rendered]' : ''}` +
      ` strippedScenes=${stats.strippedScenes}` +
      `${stats.uid ? ` uid=${stats.uid}(${stats.uidMinted ? 'minted' : 'kept'})` : ''}` +
      `${stats.strippedBgimg ? ` strippedBgimg=${stats.strippedBgimg}` : ''}${stats.hidden ? ` hiddenBlocks=${stats.hidden}` : ''}` +
      // strippedThink is the one stat here that REMOVES text from the reply, so it must never be
      // silent: unlogged, a turn whose chain-of-thought vanished at generation-end looked EXACTLY
      // like a turn that never had one, and 2026-08-11 it took a property trap on `mes` to find out
      // who the remover was, because this line did not say. The char count is named because it is
      // the receipt — it says the text went to extra.reasoning rather than into a hole.
      `${stats.strippedThink ? ` strippedThink=1 (${stats.strippedThinkText.length}c leaked CoT moved to extra.reasoning)` : ''}` +
      // ALWAYS printed, including the 0 case: "rolls=0" is the difference between "this reply had no
      // check" and "the roll rendering silently failed", which a conditional suffix would blur. Both
      // halves are named because rolls=3 alone cannot tell a fully-marked reply from an unmarked one.
      ` rolls=${stats.rolls}(placed=${stats.rollsPlaced} unplaced=${stats.rollsUnplaced})` +
      // Only when it fired, because it is an EVENT rather than a census: the tail rescue MOVED the
      // narrator's markup (core §0a). Silent, `scenes=1` would look like an ordinary bind and hide the
      // fact that the image is anchored to the wrong beat — and that the reply broke its contract.
      `${stats.imagesRehomed ? ` imagesRehomed=${stats.imagesRehomed} (were OUTSIDE <maintext>)` : ''}`,
    );
    // A CARD-PROMPT defect, same class as the missing <roll/> markers below: the image is recovered and
    // the stage is no longer blank, but it lands after the last beat instead of beside the beat it
    // depicts. Warn so the placement is fixable rather than permanently papered over here.
    if (stats.imagesRehomed) {
      log.warn(
        `beat-shaper msg=${id}: ${stats.imagesRehomed} <pic>/image block(s) were emitted OUTSIDE <maintext> ` +
        '(in the tail, past the engine blocks) and were moved back in so they bind to a beat at all. ' +
        'Un-rescued they would produce NO backdrop. Fix the narrator prompt: each <pic> belongs under the ' +
        'sentence it depicts, inside the envelope — never bunched or trailing.',
      );
    }
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
  // §4b retry hook. MESSAGE_RECEIVED can land while ST still reads BUSY (GENERATION_ENDED trails
  // it), and a truncated reply produces no further message event — so the idle-only repair would
  // never get its chance, which is the exact "defers forever" bug it exists to fix. Re-run the last
  // message once generation is provably over. GENERATION_STOPPED matters most: a user pressing stop
  // is the commonest way to strand an unclosed envelope. Idempotent — a healthy message re-shapes
  // to identical text and the `changed` check makes it a no-op.
  for (const ev of [te.GENERATION_ENDED, te.GENERATION_STOPPED]) {
    if (!ev) continue;
    try {
      window.eventOn(ev, () => {
        const chat = topWindow.SillyTavern
          && typeof topWindow.SillyTavern.getContext === 'function'
          && topWindow.SillyTavern.getContext().chat;
        if (Array.isArray(chat) && chat.length) void onMessageEvent(chat.length - 1);
      });
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
