// galgame-companion · image-seam (G4b) — feed mvu-helper's generated images into galgame's own
// backdrop library, and flip the ForceImageType latch on immersive enter/exit. GCP §10.3 / VPP §3. v0.12
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

import { DOC, topWindow, log } from '../../env.js';
import { uidOfSceneName, currentChatKey, registerWritePrerequisite } from '../beat-shaper/index.js';
import {
  staleSiblingKeys, deadBackgroundKeys, pairImagesToScenes, unboundImageReport, decideForceReconcile, latchFloors,
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
const OVERLAY_ID = 'gal-global-overlay';

// EXPORTED for tests/schoolv4-contract-core.mjs — see the note on next-block.js's BIND_PATH.
export const FORCE_PATH = 'Preferences.ForceImageType'; // dot-path WITHOUT the stat_data. prefix (Mvu API)
const FLOOR_LOOKBACK = 30;

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

// ── ForceImageType latch flip (paired with mvu-helper G4a) ────────────────────
function topMvu() {
  try { return topWindow.Mvu || null; } catch (e) { log.warn('image-seam: reaching top Mvu threw:', e); return null; }
}

// The floors the latch is written to — newest-first, the newest floor holding stat_data and the one
// beneath it (image-seam-core latchFloors says why two: a regenerate or swipe of the newest reply
// derives its state from the floor beneath, and mvu-helper's draw pass reads the latch there). The
// newest is also the floor the reconcile reads. [] when no floor holds stat_data yet.
function latchTargetFloors() {
  let last = -1;
  try { const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN); if (Number.isFinite(n) && n >= 0) last = n; }
  catch (e) { log.warn('image-seam: getLastMessageId threw — falling back to the chat length:', e); }
  if (last < 0) {
    try { const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat; if (Array.isArray(chat)) last = chat.length - 1; }
    catch (e) { log.warn('image-seam: reading the chat length threw — no data floor this attempt:', e); }
  }
  if (typeof window.getVariables !== 'function') return [];
  const hasStatData = (id) => {
    try { const v = window.getVariables({ type: 'message', message_id: id }); return !!(v && v.stat_data); }
    catch (e) { log.warn(`image-seam: getVariables(message ${id}) threw — treating that floor as holding no stat_data:`, e); return false; }
  };
  return latchFloors(last, hasStatData, FLOOR_LOOKBACK);
}

// Single flip attempt. Returns 'ok' (written) | 'retry' (transient — Mvu/floor not ready yet, worth
// trying again) | 'skip' (PERMANENT — setMvuVariable returned false, meaning this card has no
// ForceImageType path at all; retrying can never create it).
//
// LOG LEVELS HERE ARE DELIBERATE (fixed 2026-08-02). Every 'retry' reason below is EXPECTED on a
// cold page load: JS-Slash-Runner attaches top-window Mvu asynchronously, and galgame-mode entry
// routinely wins that race — so a first-attempt miss is the retry loop working, not a fault. These
// used to be log.warn (always printed) while the SUCCESS was gated behind the imagegen debug
// domain: the console shouted about a self-healing race and stayed silent about the recovery, so a
// reader with the domain off saw only the alarm. That is backwards, and it cost a real
// "what is this?" investigation. Now:
//   transient miss  → log.image  (diagnostic detail, gated)
//   recovery/result → log.image  (same channel as the misses, so the pair reads together)
//   gave up / skip  → log.warn   (ungated — the only outcomes a user can act on)
async function attemptForceImageType(on) {
  const Mvu = topMvu();
  if (!Mvu || typeof Mvu.setMvuVariable !== 'function') {
    log.image('image-seam: top-window Mvu not attached yet — ForceImageType flip deferred to the retry loop');
    return 'retry';
  }
  const floors = latchTargetFloors();
  if (!floors.length) { log.image('image-seam: no data floor yet — ForceImageType flip deferred to the retry loop'); return 'retry'; }
  try {
    const written = [];
    for (const id of floors) {
      // eslint-disable-next-line no-await-in-loop -- serial on purpose: two floors, and the second write must not race the first
      const data = Mvu.getMvuData({ type: 'message', message_id: id });
      if (!data || !data.stat_data) { log.image(`image-seam: floor ${id} has no stat_data yet — ForceImageType flip deferred to the retry loop`); return 'retry'; }
      // setMvuVariable returns false on an unknown path — i.e. a card WITHOUT the G4a init. Tri-state
      // on the mvu-helper side means that's fine (absent latch = honor the tag); we just skip for good.
      const okSet = Mvu.setMvuVariable(data, FORCE_PATH, on, { reason: `galgame ${on ? 'enter' : 'exit'}` });
      if (okSet === false) {
        log.warn(`image-seam: ${FORCE_PATH} not on this card (card-side init missing) — skip flip`);
        return 'skip';
      }
      // eslint-disable-next-line no-await-in-loop -- see above
      await Mvu.replaceMvuData(data, { type: 'message', message_id: id });
      written.push(id);
    }
    log.image(`image-seam: ForceImageType → ${on} (floors ${written.join(', ')}: the newest and the one beneath, so a regenerate or swipe of the newest reply reads it too)`);
    return 'ok';
  } catch (e) {
    // NOT the async-attach race — a real throw from the MVU API. Kept ungated with its error object:
    // it can repeat 10 times, but a silent exception is worse than a repeated one.
    log.warn('image-seam: ForceImageType flip threw (will retry):', e);
    return 'retry';
  }
}

// RETRY WRAPPER (live-verified bug, 2026-07-22): topMvu() reads window.top.Mvu, which JS-Slash-Runner
// attaches ASYNCHRONOUSLY — a syncGalState() firing right on galgame-mode ENTRY (e.g. page just loaded,
// or the overlay opens before the iframe script finishes) can hit "Mvu unavailable" and the OLD
// single-shot setForceImageType just gave up silently. Since the caller only re-invokes on the NEXT
// active-class edge (an exit→enter cycle), one bad-timing miss meant EVERY image for that whole galgame
// session generated at the narrator's own (unforced) <pic type=> — e.g. a "portrait" tag rendered
// full-bleed as the stage backdrop. Mirrors mvu-helper's OWN index.js initial-load-race retry shape
// (bounded loop, 1.5s spacing) — this is the SAME race, just on the other side of the seam.
const FORCE_RETRY_MS = 1500;
const FORCE_RETRY_MAX = 10;
let desiredForceState = null;   // the MOST RECENT requested on-value — a rapid exit-before-retry-lands must chase this, not a stale target
let forceRetryRunning = false;
function setForceImageType(on) {
  desiredForceState = on;
  if (forceRetryRunning) return;   // a loop is already chasing — it re-reads desiredForceState every attempt
  forceRetryRunning = true;
  (async () => {
    for (let i = 0; i < FORCE_RETRY_MAX; i++) {
      const target = desiredForceState;
      // eslint-disable-next-line no-await-in-loop -- intentionally serial: each attempt must see the latest desired state
      const result = await attemptForceImageType(target);
      if ((result === 'ok' || result === 'skip') && desiredForceState === target) { forceRetryRunning = false; return; }
      if (result === 'ok' || result === 'skip') continue;   // desired changed mid-write — loop again for the new target now
      // eslint-disable-next-line no-await-in-loop -- bounded retry delay, not a busy loop
      await new Promise((res) => setTimeout(res, FORCE_RETRY_MS));
    }
    // THE line that matters: every transient miss above is silent by design, so this is the only
    // signal that the race did NOT self-heal. Says how long it tried, so "10 attempts" cannot be
    // misread as instant.
    log.warn(`image-seam: ForceImageType flip GAVE UP after ${FORCE_RETRY_MAX} attempts over ~${Math.round((FORCE_RETRY_MAX * FORCE_RETRY_MS) / 1000)}s (target=${desiredForceState}) — ` +
      'top-window Mvu never became available. The galgame stage may receive non-uniform image types this session.');
    forceRetryRunning = false;
  })();
}

// ── immersive enter/exit detection (overlay .active) ──────────────────────────
function overlayActive() {
  const ov = DOC.getElementById(OVERLAY_ID);
  if (!ov) return false;
  try { if (DOC.defaultView && DOC.defaultView.getComputedStyle(ov).display === 'none') return false; } catch (e) { /* ignore */ }
  return ov.classList.contains('active');
}

let galActive = false;
function syncGalState() {
  const now = overlayActive();
  if (now === galActive) return;
  galActive = now;
  setForceImageType(now); // enter → true, exit → false
}

// ── the reconcile (see image-seam-core.js decideForceReconcile for WHY) ───────
// The edge tracker above is fast but only as correct as the last edge it saw, and it can both misread
// the first one and miss a later one entirely. This is the backstop: read what is STORED, look at what
// is really on screen, write only on disagreement.
//
// WHY IT WAITS. Reconciling the instant the seam starts would just re-read the same lie the edge
// tracker read — galgame is still initialising, so the honest answer to "is the player immersive?" is
// not available yet. The delay is the whole mechanism, not a hedge against slowness.
const RECONCILE_SETTLE_MS = 5000;
let reconcileTimer = null;

// The stored latch, resolved through FORCE_PATH. `{ok: false}` for "not readable yet" (Mvu not attached,
// no data floor) — distinct from a resolved `undefined`, which means the card genuinely has no latch.
function readStoredForceImageType() {
  const Mvu = topMvu();
  if (!Mvu || typeof Mvu.getMvuData !== 'function') return { ok: false };
  const id = latchTargetFloors()[0];
  if (id === undefined) return { ok: false };
  try {
    const data = Mvu.getMvuData({ type: 'message', message_id: id });
    if (!data || !data.stat_data) return { ok: false };
    let cursor = data.stat_data;
    for (const segment of FORCE_PATH.split('.')) {
      if (cursor == null || typeof cursor !== 'object') return { ok: true, value: undefined, floor: id };
      cursor = cursor[segment];
    }
    return { ok: true, value: cursor, floor: id };
  } catch (e) {
    // Not the async-attach race (that is the !Mvu branch above) — a real throw from the MVU API.
    log.warn('image-seam: could not read the stored ForceImageType latch — reconcile skipped:', e);
    return { ok: false };
  }
}

function reconcileForceImageType(why) {
  const read = readStoredForceImageType();
  if (!read.ok) {
    // Expected on a cold load; the next trigger (chat load) runs it again.
    log.image(`image-seam: ForceImageType reconcile (${why}) — state not readable yet, skipped`);
    return;
  }
  const live = overlayActive();
  const decision = decideForceReconcile({ stored: read.value, live });
  // Resync the edge tracker either way: leaving it stale would make the NEXT edge compute from a base
  // we have just proven wrong, which is how a missed edge turns into a permanently wrong latch.
  galActive = live;
  if (!decision.write) {
    log.image(`image-seam: ForceImageType reconcile (${why}) — ${decision.reason}`);
    return;
  }
  // Ungated: a drift means every image generated since the latch went wrong used the wrong aspect, and
  // nothing else in the log says so. Names both sides so it cannot be misread as a routine flip.
  log.warn(`image-seam: ForceImageType DRIFTED — ${decision.reason} (${why}, floor ${read.floor}). `
    + `Correcting to ${decision.to}. Images generated since it drifted used the wrong aspect.`);
  setForceImageType(decision.to);
}

function scheduleReconcile(why) {
  if (reconcileTimer) topWindow.clearTimeout(reconcileTimer);
  reconcileTimer = topWindow.setTimeout(() => { reconcileTimer = null; reconcileForceImageType(why); }, RECONCILE_SETTLE_MS);
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

  // The latch lives in a SAVE, so a chat load is when a previous session's stale value first becomes
  // ours to correct. Bound separately from the sweep above: they share a trigger, not a purpose.
  if (te.CHAT_CHANGED) {
    try { window.eventOn(te.CHAT_CHANGED, () => scheduleReconcile('chat loaded')); }
    catch (e) { log.warn('image-seam: eventOn(CHAT_CHANGED) failed — ForceImageType reconcile not bound to a chat load:', e); }
  }

  // Immersive enter/exit → flip the latch. Observe the parent doc for the overlay's presence + its
  // `active` class; a cheap rAF-coalesced overlayActive() check per burst (mirrors i18n's observer).
  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    (topWindow.requestAnimationFrame || setTimeout)(() => { scheduled = false; syncGalState(); }, 0);
  });
  try {
    obs.observe(DOC.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  } catch (e) {
    log.warn('image-seam: could not observe for immersive enter/exit:', e);
  }
  // Seed the edge tracker WITHOUT writing. This used to be a syncGalState() call, and that is precisely
  // where the stuck latch came from: galgame is mid-init here, so its overlay can still read as active,
  // and the seam wrote `true` over a save whose player was never immersive. Seeding costs nothing if the
  // read is wrong — the observer corrects it on the next real edge, and the reconcile below corrects it
  // even when no edge ever arrives. The WRITE decision belongs to the reconcile, which waits for the
  // truth instead of racing it.
  galActive = overlayActive();
  scheduleReconcile('seam start');

  log.image('image-seam active');
}
