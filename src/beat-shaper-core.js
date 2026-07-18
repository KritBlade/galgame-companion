// galgame-companion · beat-shaper-core — PURE message-shaping transform (no TH globals, unit-testable). v0.2
//
// Deterministically reshapes an AI reply into galgame's beat contract (plan: mvu-helper
// plans/GALGAME_DUMB_TERMINAL_PLAN.md §4 C1). galgame's standard parser builds display beats ONLY
// from closed <p>…</p> tags, and resolves each beat's backdrop to the nearest PRECEDING
// <background scene="X"/> tag — so we (1) wrap bare prose in <p>, (2) strip every scene tag the
// narrator/galgame-COT emitted, and (3) inject our own message-scoped scene per rendered image:
// scene #1 hoisted to the very top of <maintext> (image #1 backdrops the reply from beat 1),
// scene #n directly above image #n (backdrop switches when the reader advances past that beat).
//
// The transform must be IDEMPOTENT: shape(shape(x)) === shape(x). It re-derives all scene tags
// from scratch each run (strip-then-inject), so re-runs converge with changed=false.

// ── §2.1 scene naming contract (shared with the image-seam prune — keep in ONE place) ─────────
// Name = msg{id}_scene_{n}_{hash}. The trailing hash is a digest of the bound image's src, and it is
// LOAD-BEARING, not decoration: galgame memoizes scene→url by NAME in an in-session Map
// (backgrounds.js getBackground → sceneBackgrounds.has(name) short-circuits the DB). We write the DB
// DIRECTLY (bypassing galgame's saveBackground, the only thing that updates that Map), so re-using a
// name after a swipe/regen leaves galgame serving the STALE url until a full reload. A fresh image →
// fresh src → fresh hash → a name galgame has never cached → guaranteed Map miss → fresh DB read. The
// hash is content-derived (not time/random) so a re-shape of the SAME reply yields the SAME name and
// the transform stays idempotent. The image-seam prunes superseded siblings (same msg+n, old hash).
// The hash group is OPTIONAL in the regex so legacy hashless names still parse (prune can delete them).
export const SCENE_NAME_RE = /^msg(\d+)_scene_(\d+)(?:_([0-9a-z]+))?$/;

export function sceneName(messageId, n, hash) {
  const base = `msg${messageId}_scene_${n}`;
  return hash ? `${base}_${hash}` : base;
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
// Any <background …> tag, self-closing or not (we strip ALL and re-inject our own).
const RE_BACKGROUND_TAG = /[ \t]*<background\b[^>]*\/?>(?:\s*<\/background>)?[ \t]*\r?\n?/gi;
// Un-rendered image tag — its presence means mvu-helper's generation is still in flight (or
// failed); mvu-helper replaces <pic> by STRING INDEX captured at detection time, so rewriting the
// message now would corrupt that splice. We defer until no raw <pic> remains.
const RE_PIC_TAG = /<pic\b/i;
// Rendered image block, fixed structure from mvu-helper imagegen (image-gen.js newImageTag):
// <span class="auto-img-wrap" data-rawtag="…"><img …><span class="auto-img-regen" …></span></span>
// The outer span contains exactly ONE nested span → match through the second </span>.
const RE_IMG_WRAP = /<span class="(?:custom-)?auto-img-wrap"[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi;

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
  ].join('|'),
  'gi',
);

// A paragraph that is nothing but tags/whitespace (e.g. a lone <sprite …/> or <pixiPerform …/>
// command line) — leave it bare; wrapping it in <p> would turn a command into a fake text beat.
const RE_TAG_ONLY_PARAGRAPH = /^(?:\s|<[^>]+>)*$/;

// ── the transform ─────────────────────────────────────────────────────────────
/**
 * Shape one AI message into galgame's beat contract.
 *
 * @param {string} raw        full raw message text
 * @param {number|string} messageId  floor id — becomes part of the scene names
 * @returns {{ text: string, changed: boolean, deferred: string|null,
 *            stats: { wrapped: number, scenes: number, strippedScenes: number } }}
 *   deferred ≠ null → text is returned UNCHANGED and the caller should retry on a later event
 *   ('maintext-unclosed' while streaming, 'pics-pending' while image generation is in flight).
 */
export function shapeMessage(raw, messageId) {
  const unchanged = (deferred = null) => ({
    text: raw,
    changed: false,
    deferred,
    stats: { wrapped: 0, scenes: 0, strippedScenes: 0 },
  });

  if (typeof raw !== 'string' || raw.length === 0) return unchanged();

  const openMatch = raw.match(RE_MAINTEXT_OPEN);
  if (!openMatch) return unchanged(); // not a galgame-format reply — leave alone
  const closeMatch = raw.match(RE_MAINTEXT_CLOSE);
  if (!closeMatch) return unchanged('maintext-unclosed'); // still streaming — retry later

  const innerStart = openMatch.index + openMatch[0].length;
  const innerEnd = closeMatch.index;
  if (innerEnd < innerStart) return unchanged(); // malformed (close before open) — leave alone
  const head = raw.slice(0, innerStart);
  const tail = raw.slice(innerEnd);
  let inner = raw.slice(innerStart, innerEnd);

  // mvu-helper still owes this message rendered images — shaping now would invalidate the
  // string indices its REPLACE pass captured at detection time. Retry on its MESSAGE_UPDATED.
  if (RE_PIC_TAG.test(inner)) return unchanged('pics-pending');

  const stats = { wrapped: 0, scenes: 0, strippedScenes: 0 };

  // 1) Strip EVERY scene tag (foreign AND ours) — ours are re-derived below, which is what makes
  //    the whole transform idempotent instead of accumulating tags run over run.
  inner = inner.replace(RE_BACKGROUND_TAG, () => {
    stats.strippedScenes++;
    return '';
  });

  // 2) <p>-wrap bare prose between protected blocks, per natural paragraph (blank-line split).
  inner = wrapBareProse(inner, stats);

  // 3) Inject our scenes: enumerate rendered images in document order (capturing each image's src so
  //    the scene name carries its content hash, §2.1), insert back-to-front so earlier offsets stay
  //    valid; then hoist scene #1 to the very top of <maintext>.
  const imgs = [];
  RE_IMG_WRAP.lastIndex = 0;
  let m;
  while ((m = RE_IMG_WRAP.exec(inner)) !== null) imgs.push({ index: m.index, src: imgSrcOf(m[0]) });
  for (let n = imgs.length; n >= 2; n--) {
    const nm = sceneName(messageId, n, shortHash(imgs[n - 1].src));
    const tag = `<background scene="${nm}" />\n`;
    inner = inner.slice(0, imgs[n - 1].index) + tag + inner.slice(imgs[n - 1].index);
    stats.scenes++;
  }
  if (imgs.length >= 1) {
    const nm = sceneName(messageId, 1, shortHash(imgs[0].src));
    inner = `\n<background scene="${nm}" />\n` + inner.replace(/^\n+/, '');
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
