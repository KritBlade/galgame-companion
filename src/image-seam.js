// galgame-companion · image-seam (G4b) — feed mvu-helper's generated images into galgame's own
// backdrop library, and flip the ForceImageType latch on immersive enter/exit. GCP §10.3 / VPP §3.
//
// PIPELINE: the narrator writes `<background scene="X">` beats; mvu-helper draws each `<pic>` and
// stamps `<span class="auto-img-wrap"><img src="…"></span>` into the message (then emits
// MESSAGE_UPDATED). We scan the RAW message, bind each <img> to the nearest PRECEDING
// `<background scene>` (galgame's getBackgroundAtPosition semantics), and PUT that scene→url pair
// straight into galgame's IndexedDB `backgrounds` store. galgame's getBackground() falls through to
// the DB on a cache miss, so the backdrop appears when the player reaches that beat — no galgame edit.
//
// SOURCE-READ from galgame v2.1 (H:\Github\Dev\misc\galgame): DB `GalgameUIPluginDB` store
// `backgrounds` (keyPath `id`), record shape from db/backgrounds.js saveBackground(); packId from
// localStorage `galgame-ui-plugin_current_pack` (default `pack_default`), db/image-packs.js.

import { DOC, topWindow, log } from './env.js';

// ── galgame constants (do NOT drift — re-verify on an upstream bump, GCP §10.4 §5) ──
const DB_NAME = 'GalgameUIPluginDB';
const STORE = 'backgrounds';
const CURRENT_PACK_LS = 'galgame-ui-plugin_current_pack';
const DEFAULT_PACK_ID = 'pack_default';
const OVERLAY_ID = 'gal-global-overlay';

const FORCE_PATH = 'World_Calc.ForceImageType'; // dot-path WITHOUT the stat_data. prefix (Mvu API)
const FLOOR_LOOKBACK = 30;

// ── galgame IndexedDB write ───────────────────────────────────────────────────
function currentPackId() {
  try { return topWindow.localStorage.getItem(CURRENT_PACK_LS) || DEFAULT_PACK_ID; }
  catch (e) { log.warn('image-seam: could not read current pack id (default):', e); return DEFAULT_PACK_ID; }
}

// Open galgame's DB WITHOUT a version arg — NEVER trigger an upgrade (upstream owns the schema;
// opening with our own version would corrupt/downgrade theirs). GCP §10.3 fragility guard.
function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = topWindow.indexedDB.open(DB_NAME); } catch (e) { reject(e); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => log.warn('image-seam: IndexedDB open blocked (another tab upgrading?)');
  });
}

// HTML-attribute-unescape the src (mvu-helper writes it via escapeHtmlAttribute; a URL with query
// params would carry &amp; etc. — galgame needs the real URL).
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");
}

// Upsert one scene→url background, mirroring galgame's saveBackground() record shape exactly.
async function writeBackground(sceneName, imageUrl) {
  let db;
  try { db = await openDb(); }
  catch (e) { log.error('image-seam: could not open galgame DB — write skipped:', e); return false; }
  try {
    if (!db.objectStoreNames.contains(STORE)) {
      log.error(`image-seam: '${STORE}' store missing in ${DB_NAME} — galgame schema drift; aborting write`);
      return false;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite');
      const rec = {
        id: sceneName,
        sceneName,
        imageBlob: null,
        imageUrl,
        packId: currentPackId(),
        lastModified: new Date().toISOString(),
      };
      const r = tx.objectStore(STORE).put(rec); // put = idempotent upsert by id
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    return true;
  } catch (e) {
    log.warn(`image-seam: writeBackground("${sceneName}") failed:`, e);
    return false;
  } finally {
    try { db.close(); } catch (e) { /* EXPECTED: closing an already-closing db is harmless */ }
  }
}

// ── scan: bind each <img> to the nearest preceding <background scene> ──────────
// Scan in document order; carry the latest scene forward; a scene with no preceding tag is skipped
// (narrator-discipline miss — do NOT invent a scene name). Returns [{scene, url}].
function pairImagesToScenes(rawMes) {
  const re = /<background\s+scene="([^"]+)"|<img\b[^>]*\bsrc="([^"]+)"/gi;
  const pairs = [];
  let currentScene = null;
  let m;
  while ((m = re.exec(rawMes)) !== null) {
    if (m[1] != null) {
      currentScene = m[1].trim();
    } else if (m[2] != null) {
      const url = decodeEntities(m[2].trim());
      if (!currentScene) {
        log.warn(`image-seam: <img> with no preceding <background scene> — skipped (${url.slice(0, 60)})`);
        continue;
      }
      pairs.push({ scene: currentScene, url });
    }
  }
  return pairs;
}

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

async function processMessage(id) {
  const raw = rawMessage(id);
  if (!raw) return;
  const pairs = pairImagesToScenes(raw);
  if (!pairs.length) return;
  let ok = 0;
  for (const { scene, url } of pairs) {
    // eslint-disable-next-line no-await-in-loop -- serialize DB writes; a message has at most a few
    if (await writeBackground(scene, url)) ok++;
  }
  if (ok) log.info(`image-seam: wrote ${ok}/${pairs.length} background(s) from message ${id}`);
}

// ── ForceImageType latch flip (paired with mvu-helper G4a) ────────────────────
function topMvu() {
  try { return topWindow.Mvu || null; } catch (e) { log.warn('image-seam: reaching top Mvu threw:', e); return null; }
}

// Newest message floor whose variables actually hold stat_data (mirrors status-menu's resolution;
// mvu-helper reads ForceImageType at chat.length-1, and MVU carries stat_data forward, so writing
// the newest data floor propagates the latch to every following reply).
function latestDataFloor() {
  let last = -1;
  try { const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN); if (Number.isFinite(n) && n >= 0) last = n; } catch (e) { /* fall through */ }
  if (last < 0) {
    try { const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat; if (Array.isArray(chat)) last = chat.length - 1; } catch (e) { /* fall through */ }
  }
  if (last < 0) return -1;
  const gv = typeof window.getVariables === 'function' ? window.getVariables : null;
  if (gv) {
    for (let id = last; id >= 0 && id > last - FLOOR_LOOKBACK; id--) {
      try { const v = gv({ type: 'message', message_id: id }); if (v && v.stat_data) return id; } catch (e) { /* keep scanning */ }
    }
  }
  return last;
}

async function setForceImageType(on) {
  const Mvu = topMvu();
  if (!Mvu || typeof Mvu.setMvuVariable !== 'function') {
    log.warn('image-seam: Mvu unavailable on top window — cannot flip ForceImageType');
    return;
  }
  const id = latestDataFloor();
  if (id < 0) { log.warn('image-seam: no data floor — cannot flip ForceImageType'); return; }
  try {
    const data = Mvu.getMvuData({ type: 'message', message_id: id });
    if (!data || !data.stat_data) { log.warn('image-seam: floor has no stat_data — skip ForceImageType flip'); return; }
    // setMvuVariable returns false on an unknown path — i.e. a card WITHOUT the G4a init. Tri-state
    // on the mvu-helper side means that's fine (absent latch = honor the tag); we just skip.
    const okSet = Mvu.setMvuVariable(data, FORCE_PATH, on, { reason: `galgame ${on ? 'enter' : 'exit'}` });
    if (okSet === false) {
      log.warn(`image-seam: ${FORCE_PATH} not on this card (card-side init missing) — skip flip`);
      return;
    }
    await Mvu.replaceMvuData(data, { type: 'message', message_id: id });
    log.info(`image-seam: ForceImageType → ${on} (floor ${id})`);
  } catch (e) {
    log.warn('image-seam: setForceImageType failed:', e);
  }
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
  for (const ev of [te.MESSAGE_UPDATED, te.CHARACTER_MESSAGE_RENDERED, te.MESSAGE_SWIPED, te.MESSAGE_EDITED]) {
    if (ev) { try { window.eventOn(ev, onMsg); } catch (e) { log.warn(`image-seam: eventOn(${ev}) failed:`, e); } }
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
  syncGalState(); // initial: if galgame is already open on load, set the latch to match

  log.info('image-seam active');
}
