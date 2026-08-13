// galgame-companion · background-store — the ONE handle on galgame's background library. v0.1
//
// galgame OWNS this database. We open it without a version argument so an upgrade can never be
// triggered against a schema upstream controls (GCP §10.3), and we touch only the `backgrounds`
// store it already defines.
//
// WHY IT IS ITS OWN FILE. Two companion features now reach the same store — the image seam (write ·
// prune · orphan sweep) and the Background Manager patch (recency sort · bulk delete) — and the two
// constants that NAME it are exactly what the README's "re-verify on an upstream bump" step has to
// find. One definition, one place to re-verify; two copies would drift apart on the first bump that
// touched only one of them.
//
// SOURCE-READ from galgame v2.1 (H:\Github\Dev\misc\galgame): db/backgrounds.js — store
// `backgrounds`, keyPath `id`, record `{id, sceneName, imageBlob, imageUrl, packId, lastModified}`.
//
// THE ONE THING A DIRECT DELETE DOES NOT DO. galgame keeps an in-memory `sceneName → blobUrl` cache
// (GalgameStore.cache.backgrounds) that its own deleteBackground() evicts alongside the row. That
// Map is module-private — nothing is exposed on the window — so a row deleted from here stays in
// galgame's cache until the page reloads, and a stage that happens to re-request that exact scene
// name would still paint it. Harmless in practice (scene names are minted unique per generation, so
// the only message that can ask for a deleted one is the one it came from) and it is already how the
// seam's prune and orphan sweep have always behaved. Named here so nobody rediscovers it as a bug.

import { topWindow, log } from '../../env.js';

// ── galgame constants (do NOT drift — re-verify on an upstream bump, GCP §10.4 §5) ──
export const DB_NAME = 'GalgameUIPluginDB';
export const STORE = 'backgrounds';

// Open galgame's DB WITHOUT a version arg — NEVER trigger an upgrade (upstream owns the schema;
// opening with our own version would corrupt/downgrade theirs).
export function openBackgroundDb() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = topWindow.indexedDB.open(DB_NAME); } catch (e) { reject(e); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => log.warn('background-store: IndexedDB open blocked (another tab upgrading?)');
  });
}

/**
 * Run `body(db)` against an open library and close it afterwards.
 *
 * Returns null — never an empty result — when the database or the store could not be reached. The
 * distinction is the whole point: every caller here decides what to DELETE from what it read, and an
 * unreadable library rendered as "the library is empty" is how a read failure turns into a wipe.
 *
 * @param {string} why  what the caller was doing, for the log line
 */
async function withLibrary(why, body) {
  let db;
  try { db = await openBackgroundDb(); }
  catch (e) { log.warn(`background-store: ${why} — could not open ${DB_NAME}:`, e); return null; }
  try {
    if (!db.objectStoreNames.contains(STORE)) {
      log.error(`background-store: '${STORE}' store missing in ${DB_NAME} — galgame schema drift; ${why} aborted`);
      return null;
    }
    return await body(db);
  } catch (e) {
    log.warn(`background-store: ${why} failed:`, e);
    return null;
  } finally {
    try { db.close(); } catch (e) { /* EXPECTED: closing an already-closing db is harmless */ }
  }
}

// EVERY entry point below takes the caller's own `why`, and it is not decoration: three features now
// read and delete through this one file, so a bare "key read failed" would leave the reader unable to
// tell a prune from a sweep from a panel click — the log-sanity rule's label-accuracy half.

/**
 * Every key in the library, or null if it could not be read.
 * @param {string} why  the calling operation, named in any failure line
 */
export function readAllBackgroundKeys(why = 'key read') {
  return withLibrary(`${why} · key read`, (db) => new Promise((resolve, reject) => {
    const r = db.transaction([STORE], 'readonly').objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  }));
}

/**
 * `sceneName → lastModified` (epoch ms) for the whole library, or null if it could not be read.
 * Records with an absent or unparseable stamp are simply absent from the map — the caller orders
 * those by what it already has rather than inventing a time for them.
 *
 * Reads FULL records because IndexedDB has no projection: there is no way to ask for two fields.
 * That is the same getAll() galgame itself runs to render the panel, so the cost is one the page has
 * already paid by the time this runs.
 */
export function readBackgroundStamps(why = 'timestamp read') {
  return withLibrary(`${why} · timestamp read`, (db) => new Promise((resolve, reject) => {
    const r = db.transaction([STORE], 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => {
      const stamps = new Map();
      for (const rec of r.result || []) {
        if (!rec || typeof rec.id !== 'string') continue;
        const at = Date.parse(rec.lastModified);
        if (Number.isFinite(at)) stamps.set(rec.id, at);
      }
      resolve(stamps);
    };
    r.onerror = () => reject(r.error);
  }));
}

/**
 * Delete the given keys in ONE transaction — all of them or none.
 *
 * All-or-nothing is what lets the caller trust the return value: the UI removes exactly the cards
 * this resolves with, so it can never show a background as gone that is still in the library.
 *
 * @param {string} why  the calling operation, named in any failure line
 * @returns {Promise<string[]|null>} the keys deleted, or null if the delete did not happen.
 */
export function deleteBackgroundKeys(keys, why = 'delete') {
  const list = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && k);
  if (!list.length) return Promise.resolve([]);
  return withLibrary(`${why} · delete of ${list.length} background(s)`, (db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE], 'readwrite');
    const store = tx.objectStore(STORE);
    tx.oncomplete = () => resolve(list);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    for (const k of list) store.delete(k);
  }));
}
