// galgame-companion · beat-shaper-core — PURE message-shaping transform (no TH globals, unit-testable). v1.3
//
// Deterministically reshapes an AI reply into galgame's beat contract (plan: mvu-helper
// plans/GALGAME_DUMB_TERMINAL_PLAN.md §4 C1). galgame's standard parser builds display beats ONLY
// from closed <p>…</p> tags, and resolves each beat's backdrop to the nearest PRECEDING
// <background scene="X"/> tag — so we (0) rename the engine's <gametxt> envelope to <maintext>
// when no <maintext> exists (presets without galgame's COT keep the engine-native tag, which
// galgame's parser ignores), (1) wrap bare prose in <p>, (2) strip every scene tag the
// narrator/galgame-COT emitted PLUS engine display-noise (<bgimg> prompt stripped;
// <classmate_trait_check> hidden in an HTML comment so POST's inputRegex still reads it while
// ST's renderer — which p-wraps bare lines before galgame parses the HTML — can't display it),
// and (3) inject our own per-message scene per rendered image, bound to BEATS not raw image offsets:
// each <p> beat is assigned to the image that depicts it (the nearest image AFTER it — the narrator is
// taught to place a <pic> right after the beat it depicts), and each image's scene tag OPENS its beat run.
// galgame binds a beat to the nearest PRECEDING <background>, so the scene must LEAD the beat's prose.
// Beat binding survives TAIL-CLUSTERING: a reasoning model sometimes dumps EVERY image at the end (all
// prose, then img1 img2), which would leave image #2's scene governing no beat, so it never shows. Every
// image is guaranteed >=1 beat (a starved tail image steals a trailing beat). A leaked reasoning block
// before <maintext> is stripped too — anchored on a </think> close (matched or orphan) OR on an unclosed
// <think> open; either half can arrive alone. The write-back (shapeAndWriteWhenSettled) settles its async
// prerequisites first and then reads, shapes and writes in one synchronous step, so it never overwrites
// an edit another writer made while the shaper waited.
// Scene names are keyed by a per-message UID, never the chat index (§2.1 says why the index is wrong).
// The engine's player-visible <combat_log> lines are re-homed INTO the prose at the narrator's <roll/>
// markers (§4): the block sits in the TAIL, outside <maintext>, where no roll would ever reach the GUI.
// The injected beat is PLAIN TEXT — galgame silently drops any beat carrying HTML — so severity rides in
// an emoji, not a colour.
// A pending <pic> defers only scene injection, never the whole transform (§3b): the envelope rename is
// what keeps galgame's parser scoped, so a stalled image backend must not hold it back.
// The image census requires an actual <img> (see RE_IMG_WRAP): an UNRENDERED <pic> carries the same
// auto-img-wrap envelope, and counting it would bind a beat run to a scene nobody can write a record for.
//
// The transform must be IDEMPOTENT: shape(shape(x)) === shape(x). It re-derives all scene tags
// from scratch each run (strip-then-inject) and unwraps-then-rehides its own gc:hidden comments,
// so re-runs converge with changed=false. The uid is the one piece it does NOT re-derive: it is
// recovered from the previous run's own output (§2.1), which is exactly what makes re-runs converge.

// ── §2.1 scene naming contract (shared with the image-seam prune/sweep — keep in ONE place) ────
// Name = {uid}_scene_{n}_{hash},  where  uid = gc{chatKey}-{random}.
//
// WHY A UID AND NOT THE MESSAGE INDEX: SillyTavern has no stable message identifier — the chat[] index
// IS the id — so deleting one message RENUMBERS every message after it. Scene names are baked into the
// message TEXT, which moves with the message, so after a delete a message still carried its OLD
// neighbour's msg{index} prefix and two different messages could claim the SAME name (live 2026-07-28:
// messages 2 and 6 both referenced msg2_scene_2_159y58o). Worse, the sibling prune keys off that prefix,
// so shaping message 2 DELETED message 6's backdrop record (msg2_scene_1_1rg3995 — referenced, absent).
// A per-message random uid is index-free: renumbering cannot touch it, and two messages cannot collide.
//
// The uid is minted ONCE, on a message's first shape, and thereafter RECOVERED from that message's own
// existing scene tags (RE_EXISTING_UID, read BEFORE the strip pass). That recovery is what keeps the
// transform idempotent AND what makes the identity survive a delete: it travels inside the text it names.
//
// chatKey — a shortHash of SillyTavern's chat id — scopes the uid to one chat. galgame's background DB
// is GLOBAL across every chat, so chatKey is the only thing that lets the orphan sweep tell "record from
// a deleted message in THIS chat" (deletable) from "record from another chat" (must never be touched).
//
// The trailing hash digests the bound image's src and is LOAD-BEARING, not decoration: galgame memoizes
// scene→url by NAME in an in-session Map (backgrounds.js getBackground → sceneBackgrounds.has(name)
// short-circuits the DB). We write the DB DIRECTLY (bypassing galgame's saveBackground, the only thing
// that updates that Map), so re-using a name after a swipe/regen leaves galgame serving the STALE url
// until a full reload. A fresh image → fresh src → fresh hash → a name galgame has never cached →
// guaranteed Map miss → fresh DB read. The hash is content-derived (not time/random) so a re-shape of
// the SAME reply yields the SAME name. The image-seam prunes superseded siblings (same uid+n, old hash).
//
// Capture groups: 1 = uid, 2 = chatKey, 3 = beat number, 4 = image hash.
import { scanTagBalance } from '../../shared/tag-balance-core.js';

export const SCENE_NAME_RE = /^(gc([0-9a-z]+)-[0-9a-z]+)_scene_(\d+)_([0-9a-z]+)$/;

// Pre-uid names (msg{index}_scene_{n} with an optional hash). NOTHING mints these any more — the regex
// exists only so the image-seam's sweep can recognise a leftover as OURS and delete it.
export const LEGACY_SCENE_NAME_RE = /^msg\d+_scene_\d+(?:_[0-9a-z]+)?$/;

// `-` (not `_`) separates the two uid halves so `_scene_` stays an unambiguous split point.
export function sceneUid(chatKey, random) {
  return `gc${chatKey}-${random}`;
}

export function sceneName(uid, n, hash) {
  return `${uid}_scene_${n}_${hash}`;
}

// null for anything that is not one of our uid-scoped names (foreign scene, legacy name, junk).
export function uidOfSceneName(name) {
  const m = SCENE_NAME_RE.exec(String(name || ''));
  return m ? m[1] : null;
}

export function chatKeyOfSceneName(name) {
  const m = SCENE_NAME_RE.exec(String(name || ''));
  return m ? m[2] : null;
}

// The bound image's src-hash. THIS is what the image-seam binds a rendered <img> to its scene by —
// the name carries the identity, so neither module has to infer it from document order (see the
// image-seam's pairImagesToScenes for why order-based binding was wrong).
export function hashOfSceneName(name) {
  const m = SCENE_NAME_RE.exec(String(name || ''));
  return m ? m[4] : null;
}

// FNV-1a 32-bit → base36. Pure, deterministic, ~7 chars in [0-9a-z] (matches SCENE_NAME_RE's group).
// Same image src → same hash (idempotent); a regenerated image (new src) → different hash.
export function shortHash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Pull the first <img src="…"> out of a rendered image block (RE_IMG_WRAP match). The src is what
// changes between generations, so it — not the wrapper chrome — is what we hash. Fall back to the
// whole block if somehow src-less (never in practice; keeps the hash defined).
function imgSrcOf(block) {
  const m = /<img\b[^>]*\bsrc="([^"]*)"/i.exec(block);
  return m ? m[1] : block;
}

// ── tag patterns ──────────────────────────────────────────────────────────────
const RE_MAINTEXT_OPEN = /<maintext>/i;
const RE_MAINTEXT_CLOSE = /<\/maintext>/i;
// Engine-native display envelope (School v3 output.txt). galgame parses ONLY <maintext>; presets
// carrying galgame's COT teach the model <maintext>, but any other preset keeps <gametxt> and the
// GUI renders nothing scene-wise. Renamed to <maintext> ONLY when no <maintext> exists.
// BLOCK MACHINERY THAT LIVES OUTSIDE THE ENVELOPE — the anchor §4c closes against.
// These are the blocks a finished reply puts AFTER </maintext>, and the pipeline already assumes it:
// parseCombatLog reads <combat_log> off the TAIL. So closing the envelope before the first of them
// hands the rest of this file the shape it was written for, rather than inventing a new one.
// <classmate_trait_check> is deliberately ABSENT: it is comment-hidden INSIDE inner (step 1), so
// treating it as a boundary would move it to the tail and lose the hide.
const RE_TAIL_MACHINERY = /<(?:combat_log|choices|UpdateVariable|POSTUpdateVariable|RES_Variable|RES_POST_Variable|StoryAnalysis|combat_calculation)\b/i;
const RE_GAMETXT_OPEN = /<gametxt>/i;
const RE_GAMETXT_CLOSE = /<\/gametxt>/i;
// Engine/galgame-COT realtime-bg-gen prompt (<bgimg>TAGS</bgimg>, parser.js pairs it with the
// PRECEDING <background> tag). Unused in our pipeline (backdrops come from the image-seam DB) and
// ST's markdown renderer p-wraps the bare line → the raw prompt shows as a beat (proven live
// 2026-07-18). Stripped like foreign scene tags.
const RE_BGIMG_TAG = /[ \t]*<bgimg>[\s\S]*?<\/bgimg>[ \t]*\r?\n?/gi;
// Engine-internal narrator self-check block — display noise, but mvu-helper's POST call reads the
// message through its inputRegex capture, so it must SURVIVE in the raw text. HTML-comment-hiding
// keeps the data while the renderer/DOM drops it from what galgame parses. Idempotent via
// unwrap-then-rehide (RE_GC_HIDDEN below).
const RE_TRAIT_CHECK = /<classmate_trait_check>[\s\S]*?<\/classmate_trait_check>/gi;
const RE_GC_HIDDEN = /<!--gc:hidden\n([\s\S]*?)\n-->/g;
// Any <background …> tag, self-closing or not (we strip ALL and re-inject our own).
const RE_BACKGROUND_TAG = /[ \t]*<background\b[^>]*\/?>(?:\s*<\/background>)?[ \t]*\r?\n?/gi;
// Un-rendered image tag — its presence means mvu-helper's generation is still in flight (or failed).
// It gates SCENE INJECTION ONLY (§3b): the image set is incomplete, so beat→image binding would be
// derived from a partial set. Everything else — envelope rename, <p>-wrap, roll placement — runs now.
//
// IT USED TO GATE THE WHOLE TRANSFORM, and that was a GUI-killer. Rationale then (2026-07-17):
// "mvu-helper replaces <pic> by STRING INDEX captured at detection time, so rewriting the message now
// would corrupt that splice." That stopped being true five days later — mvu-helper's REPLACE pass
// re-anchors every splice with indexOf against the CURRENT text (image-gen.js, 2026-07-22), so our
// edits shifting offsets is a non-event. Meanwhile the deferral had a failure mode nobody costed:
// mvu-helper awaits ST's /sd with NO timeout and ST's /sd has no wall-clock abort, so an image backend
// that HANGS (blocked port, dropped packets, stalled VPN, wedged queue — not a clean failure, which the
// leftover-<pic> sweep already handles) leaves the raw <pic> in the message forever. We then deferred
// forever, so the message kept its <gametxt> envelope, so galgame's RE_MAINTEXT_* never matched, so its
// parser fell through to the WHOLE message including <UpdateVariable> — and read `{ "op"` as a speaker
// name. The embedded quote made `[data-character="{ "op"]` invalid CSS, jQuery threw, and the main
// interface failed to render on every attempt until a reload (live 2026-08-04 and again 2026-08-07).
//
// So: a stalled image now costs backdrops, never the GUI. That is the whole point of the split — the
// rename is what SCOPES galgame's parser, and it must never be hostage to an image backend.
const RE_PIC_TAG = /<pic\b/i;
// A WHOLE unrendered <pic …> tag, for the tail rescue (§0a) — RE_PIC_TAG only answers "is one present?".
// Self-closing or not; mvu-helper's own scanner is equally `[^>]*>`-shaped, so a prompt containing a
// literal '>' would already have defeated the renderer long before it reached us.
const RE_PIC_TAG_FULL = /[ \t]*<pic\b[^>]*>[ \t]*\r?\n?/gi;
// An image-machinery block from mvu-helper imagegen, fixed structure:
// <span class="auto-img-wrap" data-rawtag="…"><img …><span class="auto-img-regen" …></span></span>
// The outer span contains exactly ONE nested span → match through the second </span>.
//
// TWO KINDS OF WRAP SHARE THIS ENVELOPE, and the difference is load-bearing here. mvu-helper also
// wraps a <pic> it could NOT render (generation failed, or over the per-reply image cap) in the same
// envelope — deliberately, so every consumer keeps recognising it as image machinery instead of prose
// (a bare <code> got <p>-wrapped by ST's renderer and corrupted our display, live 2026-08-09). The
// placeholder carries no <img> and no regen control; that is what tells the two apart.
//
// So this regex answers "is this ours to protect from the <p>-wrap?" — yes for BOTH kinds — while the
// image census (§3) additionally requires an <img>. Counting a placeholder as an image is not cosmetic:
// it mints a scene tag for an image that does not exist, image-seam's pairImagesToScenes finds no <img>
// whose hash matches, the record is never written, and every beat that scene governs renders with NO
// BACKDROP (live 2026-08-09: image on the first beats, blank stage from the placeholder's beat on).
const RE_IMG_WRAP = /<span class="(?:custom-)?auto-img-wrap"[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi;
// A wrap that actually holds a displayable image. Non-global on purpose — .test() on a /g regex carries
// lastIndex between calls and would skip every other match.
const RE_HAS_IMG = /<img\b/i;
// A prose BEAT open tag — <p> or <p class="…">. Requires a delimiter right after `p` (`>` or whitespace),
// so it never false-matches <pixiPerform>/<pic>. Used to bind scenes to beats (§3 below), not raw images.
const RE_P_OPEN = /<p(?:\s[^>]*)?>/gi;
// This message's OWN uid, recovered from a scene tag a previous shape wrote (§2.1). Read BEFORE the
// strip pass — the strip is what makes the transform idempotent, so this is the last moment the prior
// identity is visible. Mirrors SCENE_NAME_RE's uid shape; not anchored, since it matches inside a tag.
const RE_EXISTING_UID = /<background\s+scene="(gc[0-9a-z]+-[0-9a-z]+)_scene_\d+_[0-9a-z]+"/i;
// A leaked chain-of-thought CLOSE that survived into the message before <maintext>: a reasoning model can
// emit </think> without a paired <think> (the open gets consumed upstream), so galgame's matched-tag strip
// misses it. Everything up to the LAST such close in the head is CoT; we drop through it (Fix, §0b).
// Which balance events are a leaked reasoning block. Detection itself is the shared tag-balance
// scanner (shared/tag-balance-core.js — every mis-emitted-tag shape used to grow its own regex fork
// here); this file keeps only the POLICY: which tags are reasoning, and how a leak is repaired.
const RE_THINK_TAG = /^think(?:ing)?$/i;
// A run of bare self-closing tags (`<Name/>`, `<Name attr="x"/>`) at the very END of an unclosed
// <think> span, right before the envelope: the reply's own markup, which the model wrote after its
// thinking and before <maintext>. A placeholder such as a card's bare caption tag is the only anchor
// its later text replacement has, so it must stay in the reply rather than go out with the CoT.
const RE_TRAILING_SELF_CLOSING_RUN = /(?:\s*<[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/>)+\s*$/;
const RE_SELF_CLOSING_TAG = /<[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/>/g;

// Blocks whose CONTENT must never be re-wrapped (protected verbatim during the <p>-wrap pass).
// Built as alternatives of one scanning regex; order matters only for overlap (none in practice).
const PROTECTED_BLOCK_RE = new RegExp(
  [
    '<p(?:\\s[^>]*)?>[\\s\\S]*?<\\/p>', // existing beats — never nest/double-wrap
    RE_IMG_WRAP.source, // rendered images
    '<styled\\b[^>]*>[\\s\\S]*?<\\/styled>',
    '<弹窗一>[\\s\\S]*?<\\/弹窗一>',
    '<弹窗二>[\\s\\S]*?<\\/弹窗二>',
    '<option\\b[^>]*>[\\s\\S]*?<\\/option>',
    '<bgm>[\\s\\S]*?<\\/bgm>',
    '<!--gc:hidden\\n[\\s\\S]*?\\n-->', // our own comment-hidden engine blocks — never wrap the hider
  ].join('|'),
  'gi',
);

// A paragraph that is nothing but tags/whitespace (e.g. a lone <sprite …/> or <pixiPerform …/>
// command line) — leave it bare; wrapping it in <p> would turn a command into a fake text beat.
const RE_TAG_ONLY_PARAGRAPH = /^(?:\s|<[^>]+>)*$/;

// ── §4 the roll line: re-home <combat_log> into a beat ────────────────────────
// The engine ALREADY emits a player-visible check log — Schoolv4 engine/output.txt's OUTPUT SEQUENCE
// lists <combat_log> among the VISIBLE blocks, "print EVERY reply, one line per check". But it sits
// AFTER </gametxt>, and galgame builds beats only from INSIDE <maintext>, so it lands in our untouched
// TAIL and the player never sees a single roll.
//
// Live 2026-08-02: a reply read as "she got mad at me for no reason" while its tail held
//   [Support] on Mitsuki — DC 12, RawDie ①1 +2 CHA = 3 → CritFail
// a natural 1. The information was written, correct, and invisible.
//
// WE RE-HOME IT, WE NEVER RE-AUTHOR IT. output.txt's "★ ONE ROLL, NO DESYNC" binds prose ≡
// <combat_calculation> ≡ /Intent/check to one die; a companion-owned <diceroll> the narrator had to
// fill would be a FOURTH copy of the same number, and the first one to drift silently. Copying the
// tail's own line cannot desync from itself.
// WHERE each roll goes is a SEPARATE question from what it says, and <combat_log> answers only the
// second — it is a block of lines with no anchor into the prose. Three rolls in one reply cannot all
// belong at the top: a check is read correctly only IMMEDIATELY BEFORE the beat it explains.
//
// So the narrator emits a POSITION MARKER and nothing else: `<roll/>` inline at the moment each check
// resolves, in the SAME ORDER as the <combat_log> lines. We substitute marker #k with line #k. The
// narrator never re-types a number, so this adds no fourth copy to desync — it says WHERE, never WHAT.
const RE_COMBAT_LOG = /<combat_log>([\s\S]*?)<\/combat_log>/i;
const RE_ROLL_MARKER = /<roll\s*\/?\s*>/gi;
// The exact sentence output.txt tells the narrator to print when nothing was rolled. Surfacing it on
// every mundane reply would be noise, so a no-roll log yields no beat at all.
const RE_NO_ROLL = /no calculation needed|no d20 roll/i;
// Outcome vocabulary, LONGEST FIRST — "CritSuccess" contains "Success", so a shortest-first
// alternation would tier a crit as an ordinary pass and drop exactly the signal this feature exists for.
const RE_OUTCOME = /(CritSuccess|CritFail|Success|Failure)/g;

// ⚠ NO HTML IN A BEAT. The first cut rendered the roll as <p><span style="color:…">…</span></p>: it
// displayed correctly in the SillyTavern chat and galgame DROPPED THE BEAT ENTIRELY (live 2026-08-03 —
// clicking NEXT jumped straight from the prose to the following line of dialogue).
//
// Verified while diagnosing it: galgame parses the RAW message text, NOT the rendered DOM — mutating
// .mes_text alone changed nothing it displayed. Every beat it renders is plain text, and the only tag
// its format spec admits inside a <p> is a trailing emotion marker (<微笑>, <难过>, …). A paragraph
// whose whole content is a <span> matches neither its dialogue nor its narration shape, so it is
// discarded silently — nothing in a console anywhere says a beat was dropped.
//
// So severity rides in the TEXT, where nothing can filter it. This also survives any future GUI: a
// plain sentence renders in the ST chat, in galgame, and in anything else that ever reads these beats.
const ROLL_PREFIX = '🎲 ';
// The degraded path (no marker for this roll) carries an HTML COMMENT in front of the same visible text.
// It is what lets the strip pass tell an unmarked line — which must be DELETED — from a placed one, which
// must be turned back into a <roll/> marker: two prefixes, two exact rules, no positional guessing. It is a
// comment so the PLAYER never sees it — the browser renders no comment in the ST chat, and galgame's
// cleanIllegalTags strips every comment before it builds a beat. The console warn names the miss instead.
const UNPLACED_PREFIX = `<!--gc:unplaced-->${ROLL_PREFIX}`;
const OUTCOME_MARK = {
  CritSuccess: '✨',
  Success: '✅',
  Failure: '⚠️',
  CritFail: '💀',
};

// The log line is MODEL-WRITTEN (it carries a heroine's name) and we drop it into HTML — escape it
// rather than trust it. Kept local to beat-shaper: it is the only feature that needs one, and
// shared/ is earned by a SECOND consumer, not by anticipation (P3).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The lines of a <combat_log> block, trimmed, with blanks and # comments dropped. Shared by the parse
// and the stray-tag census so both read the block the same way.
function combatLogLines(text) {
  const block = RE_COMBAT_LOG.exec(String(text || ''));
  if (!block) return [];
  return block[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/**
 * Every real check line in a <combat_log> block, each tagged with the outcome word it ends on.
 * A line that is nothing but tags (a <roll/> the narrator put in the log instead of the prose) is not a
 * check and is IGNORED — rendering it would make a second, fake roll beat out of markup.
 * @param {string} text  the message TAIL (where <combat_log> lives); a full message works too
 * @returns {Array<{line: string, outcome: string|null}>}  [] for no block, an empty/comment-only
 *   block, or the engine's no-roll sentence. `outcome` is null when the line carries no known
 *   verdict word — the line is still shown (neutral), since hiding a roll we half-understand is worse.
 */
export function parseCombatLog(text) {
  return combatLogLines(text)
    .filter((l) => !RE_TAG_ONLY_PARAGRAPH.test(l) && !RE_NO_ROLL.test(l))
    .map((line) => {
      RE_OUTCOME.lastIndex = 0;
      let m;
      let outcome = null;
      // LAST match wins: the line reads "… RawDie 14 +3 CHA = 17 → Success", so the verdict is the
      // trailing word. A Type token that happened to contain one would otherwise win by position.
      while ((m = RE_OUTCOME.exec(line)) !== null) outcome = m[1];
      return { line, outcome };
    });
}

/**
 * How many tag-only lines the <combat_log> block carried — the ones parseCombatLog ignores. A CARD-PROMPT
 * defect (the narrator wrote markup into a data block), counted so the caller can name it.
 * @param {string} text  the message TAIL; a full message works too
 * @returns {number}
 */
export function countCombatLogStrayTags(text) {
  return combatLogLines(text).filter((l) => RE_TAG_ONLY_PARAGRAPH.test(l)).length;
}

/**
 * One roll as the exact plain-text line we inject. Deterministic in BOTH directions: the strip pass
 * re-renders the same string to find and undo it, which is what keeps re-shapes convergent without a
 * class or wrapper to search for.
 * @param {{line: string, outcome: string|null}} roll
 * @param {string} prefix  ROLL_PREFIX (placed) or UNPLACED_PREFIX (no marker was available)
 */
export function renderRollText(roll, prefix = ROLL_PREFIX) {
  const mark = OUTCOME_MARK[roll.outcome] || '•'; // unknown verdict → neutral dot, but STILL shown
  // Escaped even though it renders as text: the line is MODEL-WRITTEN and lands in a message that the
  // chat renders as HTML. A heroine named with a '<' is vanishingly rare; script injection is not a
  // risk worth carrying for it.
  return `${prefix}${mark} ${escapeHtml(roll.line)}`;
}

/**
 * Undo a previous shape's roll rendering: unmarked lines are DELETED, placed lines become <roll/>
 * again. Restoring the marker (rather than deleting the text) is what preserves the narrator's chosen
 * position across re-shapes — the round trip that makes shape(shape(x)) === shape(x).
 *
 * Both passes match the FULL rendered string, re-derived from the same <combat_log> that produced it,
 * so nothing here can match prose the narrator happened to write with a die emoji in it.
 *
 * Unmarked first: its prefix CONTAINS the placed prefix, so restoring placed lines first would leave
 * a mangled "(unmarked) …" fragment behind.
 */
export function stripRollText(inner, rolls) {
  let out = String(inner);
  for (const roll of rolls) {
    const text = renderRollText(roll, UNPLACED_PREFIX);
    // Take the <p> WITH it: a previous shape wrapped this line into a beat of its own, and removing
    // only the text would leave an empty <p></p> that survives to the next shape — the transform would
    // then never report changed:false. The bare-text form covers a not-yet-wrapped pass.
    out = out.split(`<p>${text}</p>`).join('').split(text).join('');
  }
  // A PLACED line may sit mid-paragraph, so only its own text is swapped — `<p><roll/></p>` re-renders
  // to exactly what it was, which is why this one restores instead of deleting.
  for (const roll of rolls) out = out.split(renderRollText(roll, ROLL_PREFIX)).join('<roll/>');
  return rolls.length ? out.replace(/\n{3,}/g, '\n\n') : out;
}

/**
 * Substitute each <roll/> marker with its matching <combat_log> line, in order.
 *
 * Pairing is POSITIONAL, not by content: marker #k takes roll #k. The narrator writes both lists in
 * the order the checks resolved, so index IS the correspondence — and matching on the target's name
 * instead would break the moment two checks in one reply hit the same heroine.
 *
 * @param {string} inner  the <maintext> body, markers intact
 * @param {Array<{line: string, outcome: string|null}>} rolls  from parseCombatLog
 * @returns {{ text: string, placed: number, unplaced: Array }}  `unplaced` = rolls with no marker
 *   left to take (the narrator emitted fewer markers than checks); the caller parks them at the top.
 *   A SURPLUS marker — more markers than rolls — is deleted, since it names a roll that never happened.
 */
export function placeRolls(inner, rolls) {
  const list = Array.isArray(rolls) ? rolls : [];
  let k = 0;
  const text = String(inner).replace(RE_ROLL_MARKER, () => {
    const roll = list[k++];
    if (!roll) return ''; // surplus marker → drop it rather than render an empty die
    return renderRollText(roll, ROLL_PREFIX);
  });
  return { text, placed: Math.min(k, list.length), unplaced: list.slice(k) };
}

/**
 * The leftover rolls for which no marker was available, as their own beats. '' when there are none.
 * Top-of-reply placement is deliberate (chosen 2026-08-02): a mis-positioned crit fail is still a
 * crit fail the player sees, whereas one parked at the END is read after its own consequence — the
 * exact confusion this feature exists to kill. Blank-line separated so each becomes its OWN beat when
 * wrapBareProse runs, exactly like the narrator's prose.
 */
export function renderUnplacedRolls(rolls) {
  if (!rolls || !rolls.length) return '';
  return rolls.map((r) => renderRollText(r, UNPLACED_PREFIX)).join('\n\n');
}

// ── the transform ─────────────────────────────────────────────────────────────
/**
 * Shape one AI message into galgame's beat contract.
 *
 * @param {string} raw        full raw message text
 * @param {() => string} mintUid  mints a FRESH scene uid (§2.1) — called at most once, and only when
 *   this message has images AND carries no uid from a previous shape. Required: the uid must be scoped
 *   to the live chat, which this pure module cannot see. Use sceneUid(chatKey, random) to build one.
 * @returns {{ text: string, changed: boolean, deferred: string|null,
 *            stats: { wrapped: number, scenes: number, strippedScenes: number,
 *                     renamed: boolean, strippedBgimg: number, hidden: number,
 *                     strippedThink: number, strippedThinkText: string, thinkMarkupKept: number,
 *                     uid: string|null, picsPending: boolean,
 *                     rolls: number, rollsPlaced: number, rollsUnplaced: number, logStrayTags: number } }}
 *   strippedThinkText carries the CoT §0b removed — '' when nothing was stripped. The caller is
 *   expected to preserve it somewhere readable; this module only refuses to be the thing that
 *   destroys it (see §0b). thinkMarkupKept counts the bare self-closing tags an unclosed <think>
 *   span ended with, which §0b left in the reply instead of stripping.
 *   deferred ≠ null → text is returned UNCHANGED and the caller should retry on a later event
 *   ('maintext-unclosed'/'gametxt-unclosed' while streaming). A pending <pic> is NOT a deferral:
 *   the text is shaped and returned, with stats.picsPending marking that scene binding was the one
 *   step held back (§3b) — the caller retries it on mvu-helper's MESSAGE_UPDATED.
 */
// ── §4b truncation repair ────────────────────────────────────────────────────
// A reply that hits the token ceiling stops mid-anything and NEVER emits its closing envelope tag.
// The shaper's "unclosed ⇒ still streaming, retry later" rule is right during a stream and WRONG
// forever after one: no further event ever arrives, so the message stays raw permanently.
//
// That is not cosmetic. galgame parses the RAW text and pulls speaker names out of `Name: "…"`
// shapes — in raw text that includes whatever the truncation left exposed. Live 2026-08-04 a
// half-emitted `<UpdateVariable>` handed it `{ "op"` as a character name; the embedded quote made
// galgame build `.gal-char-container[data-character="{ "op"]`, jQuery threw, and the main-interface
// render failed on EVERY attempt — the Galgame button stopped working entirely until a reload.
//
// The repair is deliberately NON-DESTRUCTIVE: insert the closing tag after the last COMPLETE `</p>`
// and leave the partial tail where it is. Everything after the tag falls outside the envelope, so
// galgame ignores it while the text a reader might want is still in the message. Deleting the tail
// would be the tidier-looking choice and the wrong one — it is the only evidence of what truncated.
//
// Returns null when the text cannot be safely repaired (no complete beat to close after) — the
// caller then keeps deferring, which is still better than closing an envelope around nothing.
export function repairTruncatedEnvelope(raw) {
  const text = String(raw == null ? '' : raw);
  const openMatch = text.match(RE_MAINTEXT_OPEN) || text.match(RE_GAMETXT_OPEN);
  if (!openMatch) return null;
  const isGametxt = !RE_MAINTEXT_OPEN.test(text);
  const closeTag = isGametxt ? '</gametxt>' : '</maintext>';
  const innerStart = openMatch.index + openMatch[0].length;

  // The last COMPLETE paragraph inside the envelope. Anything after it is the truncation.
  const RE_P_CLOSE = /<\/p>/gi;
  RE_P_CLOSE.lastIndex = innerStart;
  let lastEnd = -1;
  let m;
  while ((m = RE_P_CLOSE.exec(text)) !== null) lastEnd = m.index + m[0].length;
  if (lastEnd < 0) return null;                       // no finished beat — nothing safe to close after

  const droppedChars = text.length - lastEnd;
  return {
    text: `${text.slice(0, lastEnd)}\n${closeTag}${text.slice(lastEnd)}`,
    closeTag,
    droppedChars,                                     // how much fell OUTSIDE the envelope (not deleted)
  };
}

// ── §4c envelope synthesis ───────────────────────────────────────────────────
// §4b repairs a MISSING CLOSE by anchoring on the last complete </p>. Measured against galgame v2.2
// (2026-09-02), that is the case galgame already survives on its own — its extractor carries
// RE_MAINTEXT_UNCLOSED, which takes everything from <maintext> to end of string.
// What it does NOT survive is a missing OPEN tag: `content` is then left as the WHOLE message, JSON
// and all, and `{ "op"` is read as a speaker name. That is the 2026-08-04 GUI death.
//
// So the invariant is ONE tag, not two: the OPEN must exist. This derives whichever edge is missing
// from the first tail-machinery tag, which needs no </p> and no guess about where the model meant to
// stop — a low-end model drops tags at random, but it does not drop every block tag at once.
//
// Returns null when there is nothing to do or no anchor to do it with — including for an ordinary
// chat message, which carries no machinery and must stay untouched.
export function synthesizeEnvelope(raw) {
  const text = String(raw == null ? '' : raw);
  const openM = text.match(RE_MAINTEXT_OPEN);
  const closeM = text.match(RE_MAINTEXT_CLOSE);
  if (openM && closeM) return null;

  const machFrom = openM ? openM.index + openM[0].length : 0;
  const machRel = RE_TAIL_MACHINERY.exec(text.slice(machFrom));
  if (!machRel) return null;
  const machAt = machFrom + machRel.index;

  // WHERE THE SYNTHESIZED OPEN GOES, when a reasoning block leaked into the head. It must land AFTER
  // the think tag, so step 0b (which only reads the head) still sees the leak and strips it; opening
  // at 0 traps the tag INSIDE the envelope, where the <p>-wrap makes it a beat — `<p><think>plan…</p>`
  // is the shape that fed the thinking beautifier a <style> element and cost the whole stage
  // (2026-09-04). Detection is the shared scanner over the pre-machinery head, so both leak shapes
  // land here as data:
  //   • a close (matched or orphan) — the LAST one bounds the reasoning; prose starts after it.
  //   • an unclosed open — nothing in the text says where the reasoning ENDS, so no boundary is
  //     honest. Anchor on the open's end: §0b then removes the tag itself, which is what breaks
  //     galgame's parse, and the planning TEXT stays visible as prose. That is this function's
  //     standing trade — a beat of wrong prose instead of the interface — and it is loud in the log.
  let proseAt = 0;
  if (!openM) {
    const thinkEvents = scanTagBalance(text.slice(0, machAt)).events.filter((e) => RE_THINK_TAG.test(e.tag));
    const closes = thinkEvents.filter((e) => e.kind === 'close');
    const unclosedOpen = thinkEvents.find((e) => e.kind === 'open' && e.status === 'unclosed-open');
    if (closes.length) proseAt = closes[closes.length - 1].end;
    else if (unclosedOpen) proseAt = unclosedOpen.end;
    if (closeM) proseAt = Math.min(proseAt, closeM.index);
  }

  const inserted = [];
  let out = text;
  // Close first: it sits at a HIGHER index than the open, so inserting it cannot move proseAt.
  if (!closeM) { out = `${out.slice(0, machAt)}\n</maintext>\n${out.slice(machAt)}`; inserted.push('close'); }
  if (!openM) { out = `${out.slice(0, proseAt)}\n<maintext>\n${out.slice(proseAt)}`; inserted.push('open'); }
  return { text: out, inserted };
}

// ── §4d when the envelope repair runs ────────────────────────────────────────
// §4b and §4c run only once the turn is finished, because mid-turn a missing or unclosed envelope may
// still be on its way. These are the deferrals they exist for. A reply deferred for one of them WHILE
// the turn was busy is owed one re-shape when the turn finishes; no other reply is, so a healthy reply
// is never shaped again by this path.
export const ENVELOPE_REPAIR_DEFERRALS = Object.freeze(['no-envelope', 'gametxt-unclosed', 'maintext-unclosed']);
export function awaitsEnvelopeRepair(deferred) {
  return ENVELOPE_REPAIR_DEFERRALS.includes(deferred);
}

// Which owed repairs to run when the turn finishes. `pending` maps message id → the chat key it was
// deferred in. An id deferred in ANOTHER chat names a different message here, so it is dropped and
// never shaped.
export function envelopeRepairsToRun(pending, chatKey) {
  const run = [];
  const drop = [];
  for (const [id, deferredInChat] of pending) (deferredInChat === chatKey ? run : drop).push(id);
  return { run, drop };
}

export function shapeMessage(raw, mintUid) {
  const blankStats = () => ({
    wrapped: 0, scenes: 0, strippedScenes: 0, renamed: false,
    strippedBgimg: 0, hidden: 0, strippedThink: 0, strippedThinkText: '', thinkMarkupKept: 0, uid: null, uidMinted: false, picsPending: false,
    rolls: 0, rollsPlaced: 0, rollsUnplaced: 0, logStrayTags: 0, imagesRehomed: 0,
  });
  const stats = blankStats();
  const unchanged = (deferred = null) => ({
    text: raw, // ALWAYS the caller's original — a rename ahead of a defer is discarded with it
    changed: false,
    deferred,
    stats: blankStats(),
  });

  if (typeof raw !== 'string' || raw.length === 0) return unchanged();

  // 0) Engine→galgame envelope bridge: no <maintext> but a closed <gametxt> pair → rename BOTH tags,
  //    then shape normally. A reply that already has <maintext> keeps its <gametxt> (if any) as-is.
  let text0 = raw;
  if (!RE_MAINTEXT_OPEN.test(raw)) {
    // No envelope of either kind. A reply carrying tail machinery is this game's and has LOST its
    // envelope (§4c repairs it once the turn is over); anything else is an ordinary message.
    if (!RE_GAMETXT_OPEN.test(raw)) return unchanged(RE_TAIL_MACHINERY.test(raw) ? 'no-envelope' : null);
    if (!RE_GAMETXT_CLOSE.test(raw)) return unchanged('gametxt-unclosed'); // still streaming — retry later
    text0 = raw.replace(RE_GAMETXT_OPEN, '<maintext>').replace(RE_GAMETXT_CLOSE, '</maintext>');
    stats.renamed = true;
  }

  const openMatch = text0.match(RE_MAINTEXT_OPEN);
  const closeMatch = text0.match(RE_MAINTEXT_CLOSE);
  if (!closeMatch) return unchanged('maintext-unclosed'); // still streaming — retry later

  const innerStart = openMatch.index + openMatch[0].length;
  const innerEnd = closeMatch.index;
  if (innerEnd < innerStart) return unchanged(); // malformed (close before open) — leave alone
  let head = text0.slice(0, innerStart);
  let tail = text0.slice(innerEnd);
  let inner = text0.slice(innerStart, innerEnd);

  // 0a) TAIL RESCUE — image machinery the narrator left OUTSIDE the envelope.
  //
  // This is §4's bug, image half (live 2026-08-11). Everything below operates on `inner`; the tail is
  // untouched by design. So a <pic> emitted after </maintext> — past <combat_log>, <UpdateVariable>,
  // the RES blocks — is invisible to the census at §3: zero images found, zero scenes minted, and
  // image-seam then has no scene whose hash matches the rendered <img>. Nothing is written to the
  // background store and the stage renders BLANK, for a generated image that exists and loads fine.
  // The imagegen contract already forbids the placement ("none bunched/trailing"), and the narrator
  // does it anyway — the same way it stopped emitting <roll/> markers, which is why §4 exists.
  //
  // Moving them in COSTS the anchor: an image is meant to sit beside the beat it depicts, and one
  // rescued from the tail can only be appended after the last beat. §3's starved-tail rule then hands
  // it the final beats. A backdrop on the wrong beat beats no backdrop at all, and the alternative —
  // leaving it where the narrator put it — is the silent blank we are here to end.
  //
  // BOTH FORMS MOVE. A rendered wrap is bound directly by §3. A raw <pic> is moved so mvu-helper's
  // next pass renders it INSIDE the envelope, where the following shape binds it normally — rescuing
  // only the rendered form would leave the pending case to fail exactly as before.
  // Idempotent by construction: after one move the tail holds no image machinery, so re-shapes no-op.
  {
    const rescued = [];
    const lift = (re) => {
      tail = tail.replace(re, (block) => { rescued.push(block.trim()); return ''; });
    };
    lift(RE_IMG_WRAP);
    lift(RE_PIC_TAG_FULL);
    if (rescued.length) {
      inner = `${inner.replace(/\s+$/, '')}\n\n${rescued.join('\n\n')}\n`;
      stats.imagesRehomed = rescued.length;
    }
  }

  // 0b) Strip a leaked reasoning block from the head — POLICY over the shared tag-balance scanner's
  //     findings. Every shape a model has leaked live is one policy branch here: a close (matched or
  //     orphan — galgame's own matched-tag strip misses the orphan) bounds the leak from above; an
  //     unclosed open bounds it from below, ending at the envelope. SAFE: the real /Intent/ emissions
  //     live in the post-maintext <UpdateVariable> block (the untouched TAIL), never the head.
  // Detection: ONE scan of the head names every think-tag event with positions — matched pair,
  // orphan close (2026-08 live) and unclosed open (2026-09-04 live) all arrive as data instead of
  // each owning a regex fork here. (`head` ends with the <maintext> open by construction, which the
  // scanner reports as one more unclosed-open — filtered out with everything non-think.)
  const thinkEvents = scanTagBalance(head).events.filter((e) => RE_THINK_TAG.test(e.tag));
  const thinkCloses = thinkEvents.filter((e) => e.kind === 'close');
  const thinkOpen = thinkEvents.find((e) => e.kind === 'open' && e.status === 'unclosed-open');
  if (thinkCloses.length) {
    // Any close — matched or orphan — bounds the leak: everything up THROUGH THE LAST one is
    // chain-of-thought. HAND THE TEXT BACK rather than dropping it on the floor: it is the model's
    // actual reasoning and the ONE copy in existence (ST's parser needs both tags), so deleting here
    // deleted it everywhere. The caller stashes it where a human can read it.
    const cutEnd = thinkCloses[thinkCloses.length - 1].end;
    stats.strippedThinkText = head.slice(0, cutEnd).replace(/<\/?think(?:ing)?>/gi, '').trim();
    head = head.slice(cutEnd).replace(/^\s+/, '');
    stats.strippedThink = 1;
  } else if (thinkOpen) {
    // The MIRROR leak: <think> opened and NEVER closed, running its planning block straight into
    // <maintext>. A preset whose "Start Reply With" is <think> produces it on every reply from a
    // model that reasons natively: ST sees reasoning already present, skips its own parse, and the
    // lone open stays in the text. The close that would bound the span does not exist, so the
    // envelope is the boundary — with ONE exception: a run of bare self-closing tags ending the
    // span is the reply's own markup, not thought, and stays in the head (RE_TRAILING_SELF_CLOSING_RUN).
    // Text written as prose before the envelope still leaves with the span; this module cannot tell a
    // rendered caption line from a line of thinking. Left in place, the leak cost the whole stage: a
    // thinking beautifier rendered the block as a <style> element, galgame's parser fell through to
    // the raw floor, and no <background scene> was ever requested. Text before the open (usually
    // nothing) is kept — and so is the <maintext> open tag, by construction the LAST thing in `head`.
    const envM = head.match(RE_MAINTEXT_OPEN);
    const end = envM ? envM.index : head.length;
    if (end > thinkOpen.at) {
      const span = head.slice(thinkOpen.end, end);
      const markup = span.match(RE_TRAILING_SELF_CLOSING_RUN);
      const kept = markup ? markup[0].trim() : '';
      stats.strippedThinkText = span.slice(0, markup ? markup.index : span.length).trim();
      stats.thinkMarkupKept = kept ? kept.match(RE_SELF_CLOSING_TAG).length : 0;
      head = head.slice(0, thinkOpen.at) + (kept ? `${kept}\n\n` : '') + head.slice(end);
      stats.strippedThink = 1;
    }
  }

  // mvu-helper still owes this message rendered images. Shape everything else NOW and skip only the
  // scene binding (§3b); mvu-helper's MESSAGE_UPDATED brings us back once every tag is replaced.
  const picsPending = RE_PIC_TAG.test(inner);
  stats.picsPending = picsPending;

  // 0c) Recover this message's uid from the scene tags a previous shape wrote, BEFORE step 1 strips
  //     them away (§2.1). Found → the identity is reused, so the names stay stable across re-shapes,
  //     image regens and — crucially — message deletions that renumber the chat. Not found → this is a
  //     first shape and step 3 mints one.
  const priorUid = RE_EXISTING_UID.exec(inner);

  // 1) Strip EVERY scene tag (foreign AND ours) — ours are re-derived below, which is what makes
  //    the whole transform idempotent instead of accumulating tags run over run. Same pass drops
  //    <bgimg> (raw prompt would display — ST's renderer p-wraps bare lines) and comment-hides
  //    <classmate_trait_check> (unwrap-then-rehide keeps it idempotent; POST still reads raw text).
  // Undo our own roll rendering FIRST (§4), which needs the tail's <combat_log> to re-derive exactly
  // what a previous shape injected. Restores the narrator's <roll/> markers so the substitution below
  // re-runs identically — the round trip that keeps the transform idempotent. Must precede the
  // <p>-wrap and the beat census so a roll line is never mistaken for prose or double-injected.
  const rolls = parseCombatLog(tail);
  inner = stripRollText(inner, rolls);
  inner = inner.replace(RE_BACKGROUND_TAG, () => {
    stats.strippedScenes++;
    return '';
  });
  inner = inner.replace(RE_BGIMG_TAG, () => {
    stats.strippedBgimg++;
    return '';
  });
  inner = inner.replace(RE_GC_HIDDEN, (_, body) => body); // unwrap ours from a prior run
  inner = inner.replace(RE_TRAIT_CHECK, (m) => {
    if (m.includes('--')) return m; // '--' would corrupt an HTML comment — leave visible over corrupting
    stats.hidden++;
    return `<!--gc:hidden\n${m}\n-->`;
  });

  // 1b) Substitute the roll markers BEFORE the wrap (§4). Order is load-bearing: a line holding only
  //     `<roll/>` is tag-only, and wrapBareProse deliberately leaves tag-only lines bare (they are
  //     commands, not beats) — so substituting first is what lets the narrator give a roll its OWN
  //     beat by putting the marker on its own line. An inline marker just becomes inline text.
  //     Rolls the narrator gave no marker are prepended here, ALSO before the wrap, so they become
  //     real beats too — bare text injected after the wrap would never be a beat at all, which is the
  //     same silent-drop this whole section exists to fix.
  const placement = placeRolls(inner, rolls);
  inner = placement.text;
  const unplacedText = renderUnplacedRolls(placement.unplaced);
  if (unplacedText) inner = `${unplacedText}\n\n${inner.replace(/^\n+/, '')}`;
  stats.rolls = rolls.length;
  stats.logStrayTags = countCombatLogStrayTags(tail);
  stats.rollsPlaced = placement.placed;
  stats.rollsUnplaced = placement.unplaced.length;

  // 2) <p>-wrap bare prose between protected blocks, per natural paragraph (blank-line split).
  inner = wrapBareProse(inner, stats);

  // 3) Inject our scenes, bound to BEATS not raw image offsets. galgame resolves a beat's backdrop to the
  //    nearest <background> AT-OR-BEFORE it (parser.js getBackgroundAtPosition), so a scene governs the
  //    prose FOLLOWING it. Assign each <p> beat to the image that depicts it — the nearest image AFTER the
  //    beat (the narrator is taught to place a <pic> right after the beat it depicts; a beat past the last
  //    image keeps the last image) — then OPEN each image's beat-run with its scene tag. This reproduces
  //    the interspersed mapping (beats before img1 → img1, prose between img1/img2 → img2) AND survives
  //    TAIL-CLUSTERING: when a reasoning model dumps every image at the end (all prose, then img1 img2),
  //    the natural map starves every image but the first, so image #2's scene would govern no beat and
  //    never show. We guarantee each image owns >=1 beat by giving the starved (trailing) images the last
  //    beats, in order. Insert back-to-front so earlier offsets stay valid; scene #1 hoists to the very top.
  const imgs = [];
  RE_IMG_WRAP.lastIndex = 0;
  let m;
  while ((m = RE_IMG_WRAP.exec(inner)) !== null) {
    // Placeholder wrap (an unrendered <pic>) — protected from the <p>-wrap above, but there is no image
    // to back a backdrop, so it must never take a scene number. See RE_IMG_WRAP.
    if (!RE_HAS_IMG.test(m[0])) continue;
    imgs.push({ index: m.index, src: imgSrcOf(m[0]) });
  }
  const beatStarts = [];
  RE_P_OPEN.lastIndex = 0;
  let pm;
  while ((pm = RE_P_OPEN.exec(inner)) !== null) beatStarts.push(pm.index);

  // Mint only once we know there is an image to name (a uid nobody writes into the text is a uid that
  // can never be recovered). Reuse the recovered one whenever this message already has an identity.
  // NOT while pics are pending: a uid is only recoverable from a scene tag we actually wrote, so
  // minting one we then decline to use would burn a fresh identity on every retry.
  const uid = !picsPending && imgs.length >= 1 ? (priorUid ? priorUid[1] : mintUid()) : null;
  stats.uid = uid;
  stats.uidMinted = Boolean(uid) && !priorUid; // logged: a message that CHANGES identity orphans its old backdrops

  if (picsPending) {
    // §3b — the image set is INCOMPLETE, so every binding below would be derived from a partial one:
    // owner[] maps beats to the images that exist RIGHT NOW, and the starved-tail rule reshuffles by
    // imgs.length. Both WOULD be re-derived correctly on the next pass (this step rebuilds every scene
    // tag from scratch), but the names written meanwhile are not inert — the image-seam prunes siblings
    // by uid+n, so a provisional scene #2 can delete the record a later, real scene #2 needs.
    // Withholding the binding is cheap; withholding the rename is what cost us the whole GUI.
  } else if (imgs.length >= 1 && beatStarts.length >= 1) {
    // owner[j] = image that depicts beat j = the nearest image AFTER the beat (else the last image).
    const owner = beatStarts.map((b) => {
      const after = imgs.findIndex((im) => im.index > b);
      return after === -1 ? imgs.length - 1 : after;
    });
    // Guarantee every image owns >=1 beat. Tail-clustering starves all but the first image; hand the
    // starved (trailing) images the last beats, in order, so each one still opens a run and displays.
    if (new Set(owner).size < imgs.length && beatStarts.length >= imgs.length) {
      for (let n = 0; n < imgs.length; n++) owner[beatStarts.length - imgs.length + n] = n;
    }
    // Open each image's run with its scene tag (back-to-front keeps earlier offsets valid).
    for (let n = imgs.length - 1; n >= 1; n--) {
      const firstBeat = owner.indexOf(n);
      if (firstBeat === -1) continue; // too few beats to bind this image (rare: more images than beats)
      const nm = sceneName(uid, n + 1, shortHash(imgs[n].src));
      const at = beatStarts[firstBeat];
      inner = inner.slice(0, at) + `<background scene="${nm}" />\n` + inner.slice(at);
      stats.scenes++;
    }
    const nm1 = sceneName(uid, 1, shortHash(imgs[0].src));
    inner = `\n<background scene="${nm1}" />\n` + inner.replace(/^\n+/, ''); // scene #1 backdrops from the top
    stats.scenes++;
  } else if (imgs.length >= 1) {
    // No prose beats to bind (all-image / tag-only reply) — keep a single top scene as before.
    const nm1 = sceneName(uid, 1, shortHash(imgs[0].src));
    inner = `\n<background scene="${nm1}" />\n` + inner.replace(/^\n+/, '');
    stats.scenes++;
  }

  const text = head + inner + tail;
  return { text, changed: text !== raw, deferred: null, stats };
}

// Wrap every bare-prose paragraph in <p>…</p>, leaving protected blocks and tag-only command
// lines untouched. Splits free text on blank lines (one natural paragraph = one beat; galgame's
// own pagination handles long beats).
function wrapBareProse(inner, stats) {
  const out = [];
  let cursor = 0;
  PROTECTED_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = PROTECTED_BLOCK_RE.exec(inner)) !== null) {
    out.push(wrapFreeRun(inner.slice(cursor, m.index), stats));
    out.push(m[0]);
    cursor = m.index + m[0].length;
  }
  out.push(wrapFreeRun(inner.slice(cursor), stats));
  return out.join('');
}

function wrapFreeRun(run, stats) {
  if (!run || !run.trim()) return run; // pure whitespace — preserve verbatim (keeps spacing stable)
  const parts = run.split(/(\n[ \t]*\n+)/); // keep the blank-line separators
  for (let i = 0; i < parts.length; i += 2) {
    const para = parts[i];
    if (!para.trim()) continue;
    if (RE_TAG_ONLY_PARAGRAPH.test(para)) continue; // command/tag-only line — not a text beat
    // Preserve the paragraph's leading/trailing whitespace OUTSIDE the <p> so reassembly is stable.
    const lead = para.match(/^\s*/)[0];
    const trail = para.match(/\s*$/)[0];
    const body = para.slice(lead.length, para.length - trail.length);
    parts[i] = `${lead}<p>${body}</p>${trail}`;
    stats.wrapped++;
  }
  return parts.join('');
}

// ── write-back: prerequisites first, then read → shape → write in ONE synchronous step ─────────
// Every writer of a finished reply follows one rule: never hold a copy of the text across an await.
// setChatMessages replaces the whole text, so a write of text read BEFORE an await reverts every edit
// other writers made during it — mvu-helper's resolver replaces the card's caption tags and places its
// stat box a few hundred ms after the reply lands, and a stale write-back takes both out with nothing
// logged.
//
// The shaper has one async prerequisite: galgame's backdrop row for every scene name it writes must
// exist BEFORE the floor shows that name (image-seam header — galgame marks a scene current before it
// looks the row up). So the async work comes first and holds no copy: shape, ask which prerequisites
// this shaped text still owes, settle them, and DISCARD that shape. Then read again, shape again, and
// write only when nothing is owed — the read, the shape and the write call run in one synchronous
// step, so no other writer can land between them. That is correct in any order the writers finish.
//
// It ends without a retry cap: every round either writes or settles at least one owed key it has not
// tried before, and a reply names a finite set (one scene per image). A key whose settle did not take
// is not retried; the floor is written anyway and the key comes back in `unsettled`.
//
// io.read()              → the reply's current text, or null when it is gone
// io.shape(raw, mintUid) → shapeMessage's result shape ({ text, changed, deferred, stats })
// io.mintUid()           → a fresh scene uid; called at most once, so every round names the same scenes
// io.owed(result)        → SYNCHRONOUS: keys this shaped text still needs settled before it is written
// io.settle(result, keys)→ settles those keys (awaited)
// io.write(result)       → performs the write; called in the same synchronous step as the read
// Resolves to { outcome, result, settledRounds, unsettled }: outcome is 'written' | 'unchanged' |
// 'deferred' | 'gone'; unsettled lists owed keys that were settled once and are still owed.
export const SETTLE_ROUNDS_BEFORE_BUG = 50;
export async function shapeAndWriteWhenSettled(io) {
  let pinnedUid = null;
  const mintOnce = () => (pinnedUid || (pinnedUid = io.mintUid()));
  const attempted = new Set();
  let settledRounds = 0;
  for (;;) {
    const raw = io.read();
    if (raw === null) return { outcome: 'gone', result: null, settledRounds, unsettled: [] };
    const result = io.shape(raw, mintOnce);
    if (result.deferred) return { outcome: 'deferred', result, settledRounds, unsettled: [] };
    if (!result.changed) return { outcome: 'unchanged', result, settledRounds, unsettled: [] };
    const owed = io.owed(result);
    const fresh = owed.filter((key) => !attempted.has(key));
    if (!fresh.length) {
      const written = io.write(result);
      await written;
      return { outcome: 'written', result, settledRounds, unsettled: owed };
    }
    // Not reachable while owed() names only keys the text itself carries; a loud stop, never a silent spin.
    if (settledRounds >= SETTLE_ROUNDS_BEFORE_BUG) {
      throw new Error(`write prerequisites never converged: ${settledRounds} rounds, still owed ${fresh.join(', ')}`);
    }
    for (const key of fresh) attempted.add(key);
    await io.settle(result, fresh);
    settledRounds++;
  }
}
