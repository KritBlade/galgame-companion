// galgame-companion · image-seam (G4b) — feed mvu-helper's generated images into galgame's own
// backdrop library. GCP §10.3 / VPP §3. v0.13
//
// PIPELINE: the narrator writes `<background scene="X">` beats; mvu-helper draws each `<pic>` and
// stamps `<span class="auto-img-wrap"><img src="…"></span>` into the message (then emits
// MESSAGE_UPDATED). We scan the RAW message, bind each <img> to its scene (image-seam-core
// pairImagesToScenes), and PUT that scene→url pair straight into galgame's IndexedDB `backgrounds`
// store. galgame's getBackground() falls through to the DB on a cache miss, so the backdrop appears
// when the player reaches that beat — no galgame edit.
//
// THE ROW MUST EXIST BEFORE THE DOM SHOWS THE NAME. The beat-shaper mints the scene name and re-renders
// the floor; galgame re-parses ~200 ms after the DOM changes and looks the name up once per scene
// change — its SpriteManager.applySceneTint marks the scene current BEFORE it reads, so a lookup that
// finds nothing leaves the stage blank until the scene changes or the page reloads (a reload starts
// with no current scene, and the chat-load backfill below files every missing row first). So the seam
// is a WRITE PREREQUISITE of the beat-shaper: it says synchronously which scenes a shaped text still
// owes the library, and files them; the beat-shaper writes only once nothing is owed, from a fresh
// read taken in the same step as the write. The message-event scan below stays for every other way a
// floor's text can change, and skips pairs it has already filed.
//
// THE LIBRARY IS PER BROWSER, THE CHAT IS NOT. galgame's store lives in this browser's IndexedDB, and
// the scan above runs only on a message event. So on every chat load the seam BACKFILLS: each scene the
// chat binds that the library lacks is written, before galgame's own chat-load render looks it up
// (eventMakeFirst — SillyTavern awaits listeners in order). A second browser, or cleared site data,
// used to show no backdrop for any message drawn elsewhere (staging, 2026-09-23). galgame's own
// in-message source, its st-chatu8 mode, re-reads the message on every render for the same reason.
//
// SOURCE-READ from galgame v2.2 (H:\Github\Dev\misc\galgame, re-read 2026-09-23): DB
// `GalgameUIPluginDB` store `backgrounds` (keyPath `id`), record shape from db/backgrounds.js
// saveBackground(); packId from localStorage `galgame-ui-plugin_current_pack` (default
// `pack_default`), db/image-packs.js.

import { topWindow, log } from '../../env.js';
import { uidOfSceneName, currentChatKey, registerWritePrerequisite } from '../beat-shaper/index.js';
import {
  staleSiblingKeys, deadBackgroundKeys, pairImagesToScenes, unboundImageReport,
  missingBackdropPairs, pairSignature, backdropScenesOwed,
} from './image-seam-core.js';
import {
  STORE, openBackgroundDb, readAllBackgroundKeys, deleteBackgroundKeys,
} from './background-store.js';

// ── galgame constants (do NOT drift — re-verify on an upstream bump, GCP §10.4 §5) ──
// WHICH database, and how it is opened/read/deleted from, now lives in background-store.js — the
// Background Manager patch needs the same library, and one name for one store is the point.
const CURRENT_PACK_LS = 'galgame-ui-plugin_current_pack';
const DEFAULT_PACK_ID = 'pack_default';

// ── galgame IndexedDB write ───────────────────────────────────────────────────
function currentPackId() {
  try { return topWindow.localStorage.getItem(CURRENT_PACK_LS) || DEFAULT_PACK_ID; }
  catch (e) { log.warn('image-seam: could not read current pack id (default):', e); return DEFAULT_PACK_ID; }
}

// Upsert scene→url backgrounds in ONE transaction, mirroring galgame's saveBackground() record shape
// exactly. Returns how many were written (0 when the DB could not be opened or the write failed).
async function writeBackgrounds(pairs) {
  if (!pairs.length) return 0;
  let db;
  try { db = await openBackgroundDb(); }
  catch (e) { log.error('image-seam: could not open galgame DB — write skipped:', e); return 0; }
  try {
    if (!db.objectStoreNames.contains(STORE)) {
      log.error(`image-seam: '${STORE}' store missing — galgame schema drift; aborting write`);
      return 0;
    }
    const packId = currentPackId();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite');
      const store = tx.objectStore(STORE);
      for (const { scene, url } of pairs) {
        store.put({ id: scene, sceneName: scene, imageBlob: null, imageUrl: url, packId, lastModified: new Date().toISOString() });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
    return pairs.length;
  } catch (e) {
    log.warn(`image-seam: writing ${pairs.length} background(s) failed (${pairs.map((p) => p.scene).join(', ')}):`, e);
    return 0;
  } finally {
    try { db.close(); } catch (e) { /* EXPECTED: closing an already-closing db is harmless */ }
  }
}

// (The scan itself — bind each <img> to its scene BY IMAGE HASH — is image-seam-core's
// pairImagesToScenes: pure and unit-tested, since getting it wrong is what silently loses a
// backdrop. This file only reports what it found.)

// Read a message's raw text (getChatMessages returns TH shape: raw text is in `.message`).
function rawMessage(id) {
  try {
    const arr = window.getChatMessages(id);
    const msg = Array.isArray(arr) ? arr[0] : arr;
    if (!msg) return null;
    if (msg.role && msg.role !== 'assistant') return null; // only AI messages carry pics/scenes
    return typeof msg.message === 'string' ? msg.message : (typeof msg.mes === 'string' ? msg.mes : null);
  } catch (e) {
    log.warn(`image-seam: getChatMessages(${id}) failed:`, e);
    return null;
  }
}

// Delete this message's SUPERSEDED backdrop entries: same `{uid}_scene_*` names that are NOT in the
// current keep-set (older image-src hashes from a prior swipe/regen). The beat-shaper mints a fresh
// hash per image generation (§2.1), so without this the store would grow one entry per swipe forever.
// SAFETY: only ever deletes OUR SCENE_NAME_RE names carrying THIS message's uid. The uid is what makes
// that safe — the old msg{index} prefix was NOT per-message (deleting a message renumbered the chat, so
// two messages could share a prefix and this prune reached across and deleted the other one's records —
// live 2026-07-28). The caller guarantees keep is non-empty (we skip the prune entirely on a transient
// empty pass, so we can't wipe good backdrops mid-stream).
async function pruneSceneSiblings(uid, keep) {
  const why = `image-seam sibling prune (uid ${uid})`;
  const keys = await readAllBackgroundKeys(why);
  // null = the library could not be read (background-store logged why). NOT the same as "it holds
  // nothing": staleSiblingKeys over an empty list deletes nothing either way, but the distinction is
  // the reason this returns early instead of pretending it swept a library it never saw.
  if (!keys) return 0;
  const stale = staleSiblingKeys(keys, uid, keep);
  if (!stale.length) return 0;
  const deleted = await deleteBackgroundKeys(stale, why);
  return deleted ? deleted.length : 0;
}

// scene=url pairs last filed per message, so a scan of pairs already filed is a no-op instead of a
// second put + a second log line for the same rows — and so the beat-shaper's prerequisite question
// ("does this shaped text still owe rows?") is answered synchronously.
const filed = new Map();

// One scan at a time per message: the hook and the message events can fire within milliseconds of each
// other, and two concurrent scans each read the library before either prunes it.
const scanChains = new Map();
function scanSerialized(id, body) {
  const previous = scanChains.get(id) || Promise.resolve();
  const next = previous.then(body, body);
  const settled = next.finally(() => { if (scanChains.get(id) === settled) scanChains.delete(id); });
  scanChains.set(id, settled);
  return next;
}

function processMessage(id) {
  return scanSerialized(id, () => {
    const raw = rawMessage(id);
    if (!raw) return undefined;
    return processText(id, raw, 'message event');
  });
}

async function processText(id, raw, why) {
  const scan = pairImagesToScenes(raw);
  const { pairs } = scan;
  // Unmatched counts are EXPECTED mid-flight (a message the beat-shaper has not shaped yet has foreign
  // or no scene names, and its images match nothing) — the shaper's re-render fires
  // CHARACTER_MESSAGE_RENDERED and this scan repeats. unboundImageReport() owns which of those is worth
  // saying out loud; it withholds only while a producer is demonstrably still working, so the TOTAL
  // orphan case (every image unbound, stage blank) now reports instead of falling through the old
  // `pairs.length &&` gate in silence.
  const report = unboundImageReport(raw, scan);
  if (report) log.image(`image-seam: message ${id} — ${report}`);
  if (!pairs.length) return; // transient (pre-shape / no images) — write nothing AND prune nothing
  const signature = pairSignature(pairs);
  if (filed.get(id) === signature) {
    log.image(`image-seam: message ${id} — its ${pairs.length} backdrop(s) are already filed (${why}); nothing to write`);
    return;
  }
  const ok = await writeBackgrounds(pairs);
  if (ok === pairs.length) filed.set(id, signature);
  // Drop superseded gens of THIS message's beats so swipe/regen doesn't accumulate (keep = current
  // names). Grouped by uid: the shaper mints exactly one per message, but grouping keeps every prune
  // scoped to a uid we actually saw here, so a hand-edited message carrying two can't widen the delete.
  const keepByUid = new Map();
  for (const p of pairs) {
    const uid = uidOfSceneName(p.scene);
    if (!uid) continue; // pairImagesToScenes already filtered to SCENE_NAME_RE — belt and braces
    if (!keepByUid.has(uid)) keepByUid.set(uid, new Set());
    keepByUid.get(uid).add(p.scene);
  }
  let removed = 0;
  for (const [uid, keep] of keepByUid) {
    // eslint-disable-next-line no-await-in-loop -- serialize DB work; a message has exactly one uid
    removed += await pruneSceneSiblings(uid, keep);
  }
  if (ok || removed) {
    log.image(
      `image-seam: wrote ${ok}/${pairs.length} background(s) from message ${id} (${why})` +
        (removed ? `, pruned ${removed} superseded` : ''),
    );
  }
}

// ── chat-load backfill: the library holds every backdrop the chat binds (file header) ──

// Raw text of the loaded chat's AI messages that name a scene; null when the chat cannot be read.
function chatSceneTexts() {
  let chat = null;
  try {
    const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === 'function'
      ? topWindow.SillyTavern.getContext() : null;
    chat = ctx ? ctx.chat : null;
  } catch (e) {
    log.warn('image-seam: backfill could not read the chat array — skipped:', e);
    return null;
  }
  if (!Array.isArray(chat)) return null;
  return chat.filter((m) => m && !m.is_user && typeof m.mes === 'string' && m.mes.includes('<background')).map((m) => m.mes);
}

async function backfillChat(why) {
  const texts = chatSceneTexts();
  if (!texts || !texts.length) return;
  const keys = await readAllBackgroundKeys(`image-seam backfill (${why})`);
  if (!keys) return; // library unreadable — background-store logged why
  const missing = missingBackdropPairs(texts, keys);
  if (!missing.length) {
    log.image(`image-seam: backfill (${why}) — the library already holds every backdrop this chat binds`);
    return;
  }
  const wrote = await writeBackgrounds(missing);
  log.image(`image-seam: backfill (${why}) — wrote ${wrote}/${missing.length} backdrop(s) this browser's library was missing`);
}

// ── orphan sweep: drop backdrops whose message no longer exists ───────────────
// The per-uid prune above only ever reaches records the CURRENT message still references. Deleting the
// MESSAGE leaves its records behind with nothing left to prune them — live evidence 2026-07-28: the
// store still held msg8_scene_2_jhd8qg long after message 8 was gone.
//
// SCOPING IS THE WHOLE DIFFICULTY — galgame's store is GLOBAL, one DB shared by every chat, so "not
// referenced by this chat" does NOT mean "dead". That decision is image-seam-core's deadBackgroundKeys
// (pure + unit-tested, since it is the one thing here that deletes someone else's data); this half only
// supplies it with two honest inputs and refuses to run without both.

// Every <background scene="…"> name currently referenced anywhere in the loaded chat, INCLUDING
// non-active swipes — a swipe that merely isn't on screen is still live, and swiping back re-displays
// it. Returns null (never an empty set) when the chat can't be read or holds no scene names at all, so
// a transient/mid-switch read can never be mistaken for "nothing is alive".
const RE_ANY_SCENE_NAME = /<background\s+scene="([^"]+)"/gi;
function liveSceneNames() {
  let chat = null;
  try {
    const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === 'function'
      ? topWindow.SillyTavern.getContext() : null;
    chat = ctx ? ctx.chat : null;
  } catch (e) {
    log.warn('image-seam: sweep could not read the chat array — skipped:', e);
    return null;
  }
  if (!Array.isArray(chat) || chat.length === 0) return null;
  const names = new Set();
  for (const msg of chat) {
    if (!msg) continue;
    const texts = [typeof msg.mes === 'string' ? msg.mes : ''];
    if (Array.isArray(msg.swipes)) for (const s of msg.swipes) if (typeof s === 'string') texts.push(s);
    for (const t of texts) {
      RE_ANY_SCENE_NAME.lastIndex = 0;
      let m;
      while ((m = RE_ANY_SCENE_NAME.exec(t)) !== null) names.add(m[1].trim());
    }
  }
  return names.size ? names : null;
}

// Is a chat actually open? Only used to GRADE a missing chat key, never to decide whether to sweep.
// "No chat yet" and "chat open but its id will not resolve" are the same value (null) at the call site
// and mean opposite things: the first is ST still starting up, the second is a real defect.
function chatIsOpen() {
  try {
    const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === 'function'
      ? topWindow.SillyTavern.getContext() : null;
    if (!ctx) return false;
    return Array.isArray(ctx.chat) && ctx.chat.length > 0 && (ctx.characterId != null || ctx.groupId != null);
  } catch (e) {
    // Unknown beats wrong: an unreadable context must not become a way to silence a real fault.
    log.warn('image-seam: context unreadable while grading a missing chat key:', e);
    return true;
  }
}

async function sweepOrphanBackgrounds() {
  const chatKey = currentChatKey();
  if (!chatKey) {
    // The 'seam start' sweep deliberately fires before any chat may exist ("the chat already loaded
    // before we wired up"), and CHAT_CHANGED is bound to sweep as well — so losing this one costs
    // nothing, and warning about it every single load buried the case that matters.
    if (!chatIsOpen()) {
      log.image('image-seam: orphan sweep skipped — no chat open yet (startup); the CHAT_CHANGED sweep will run it.');
      return 0;
    }
    log.warn('image-seam: orphan sweep skipped — a chat IS open but SillyTavern\'s chat id will not resolve, ' +
      'so the delete cannot be scoped to this chat and might hit another chat\'s backdrops. Orphaned ' +
      'backdrops will accumulate until this resolves.');
    return 0;
  }
  const live = liveSceneNames();
  if (!live) return 0; // transient/empty read — see liveSceneNames()
  const keys = await readAllBackgroundKeys('image-seam orphan sweep');
  if (!keys) return 0; // library unreadable — background-store logged why; sweeping blind is not an option
  const dead = deadBackgroundKeys(keys, live, chatKey);
  if (!dead.length) return 0;
  const deleted = await deleteBackgroundKeys(dead, 'image-seam orphan sweep');
  return deleted ? deleted.length : 0;
}

// Debounced so a multi-message delete (or a chat switch that fires several events) sweeps once, and so
// the sweep reads a settled chat array rather than one mid-swap.
const SWEEP_DEBOUNCE_MS = 2000;
let sweepTimer = null;
function scheduleSweep(why) {
  if (sweepTimer) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    sweepOrphanBackgrounds()
      .then((n) => { if (n) log.image(`image-seam: swept ${n} orphaned backdrop(s) (${why})`); })
      .catch((e) => log.warn('image-seam: orphan sweep rejected:', e));
  }, SWEEP_DEBOUNCE_MS);
}

// ── wiring ────────────────────────────────────────────────────────────────────
export function startImageSeam() {
  if (typeof window.getChatMessages !== 'function' || typeof window.eventOn !== 'function') {
    log.warn('image-seam: TH globals (getChatMessages/eventOn) absent — seam disabled');
    return;
  }
  const te = window.tavern_events || {};
  // Scan on both the initial render and mvu-helper's post-gen MESSAGE_UPDATED (it stamps the <img>
  // AFTER the message arrives). Writes are idempotent (put by id) so double-firing is harmless.
  const onMsg = (id) => { processMessage(Number(id)); };
  // The rows a shaped text owes, filed before the beat-shaper writes it (file header: the row must exist
  // before galgame reads the name).
  registerWritePrerequisite({
    owed: (id, text) => backdropScenesOwed(text, filed.get(Number(id))),
    settle: (id, text) => scanSerialized(Number(id), () => processText(Number(id), text, "before the beat-shaper's write")),
  });
  for (const ev of [te.MESSAGE_UPDATED, te.CHARACTER_MESSAGE_RENDERED, te.MESSAGE_SWIPED, te.MESSAGE_EDITED]) {
    if (ev) { try { window.eventOn(ev, onMsg); } catch (e) { log.warn(`image-seam: eventOn(${ev}) failed:`, e); } }
  }

  // Orphan sweep triggers: a delete is the event that STRANDS records, and a chat load is when a
  // previous session's strandings are first visible to us. Both debounced into one pass.
  for (const [ev, why] of [[te.MESSAGE_DELETED, 'message deleted'], [te.CHAT_CHANGED, 'chat loaded']]) {
    if (!ev) continue;
    try { window.eventOn(ev, () => scheduleSweep(why)); }
    catch (e) { log.warn(`image-seam: eventOn(${ev}) failed — orphan sweep not bound to "${why}":`, e); }
  }
  scheduleSweep('seam start'); // the chat already loaded before we wired up

  // The backfill runs FIRST on a chat load: SillyTavern awaits each listener in turn, so the library
  // holds the chat's backdrops before galgame's own CHAT_CHANGED handler renders the stage. A plain
  // eventOn registers after galgame's and would run after that render. The listener returns the
  // backfill's promise so the chain waits for it; a failure is logged, never thrown into the chain.
  if (te.CHAT_CHANGED) {
    if (typeof window.eventMakeFirst === 'function') {
      try { window.eventMakeFirst(te.CHAT_CHANGED, () => backfillChat('chat loaded').catch((e) => log.warn('image-seam: chat-load backfill rejected:', e))); }
      catch (e) { log.warn('image-seam: eventMakeFirst(CHAT_CHANGED) failed — the chat-load backfill is not bound:', e); }
    } else {
      log.warn('image-seam: TavernHelper eventMakeFirst is absent — the chat-load backfill is not bound, so a browser that never saw this chat drawn shows no backdrop for it');
    }
  }
  backfillChat('seam start').catch((e) => log.warn('image-seam: start-up backfill rejected:', e)); // the chat already loaded before we wired up

  log.image('image-seam active');
}
