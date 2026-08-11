// image-seam-core unit tests — the seam's pure decisions: the two DELETE predicates for galgame's
// shared background store, and the ForceImageType reconcile. v0.2
//
// These are the only functions in the companion that remove someone else's data, so the tests lean hard
// on what must NEVER be deleted: another chat's records, a foreign scene name, or anything at all when
// the caller's view of "what is alive" is empty/unreadable.
import { describe, it, expect } from 'vitest';
import {
  staleSiblingKeys, deadBackgroundKeys, pairImagesToScenes, unboundImageReport, decideForceReconcile,
} from '../src/features/image/image-seam-core.js';
import { sceneName, sceneUid, shortHash } from '../src/features/beat-shaper/beat-shaper-core.js';

const CHAT = 'k9f3x2';       // this chat
const OTHER_CHAT = 'p2m8q1';  // a different chat sharing the same global DB
const uidA = sceneUid(CHAT, 'aaaaaa');
const uidB = sceneUid(CHAT, 'bbbbbb');
const uidElsewhere = sceneUid(OTHER_CHAT, 'cccccc');

describe('staleSiblingKeys (per-message prune)', () => {
  it('drops superseded hashes of the SAME beat and keeps the current ones', () => {
    const keys = [
      sceneName(uidA, 1, 'oldhash'),
      sceneName(uidA, 1, 'newhash'),
      sceneName(uidA, 2, 'keepme'),
    ];
    const keep = new Set([sceneName(uidA, 1, 'newhash'), sceneName(uidA, 2, 'keepme')]);
    expect(staleSiblingKeys(keys, uidA, keep)).toEqual([sceneName(uidA, 1, 'oldhash')]);
  });

  it('NEVER reaches another message — not even one in the same chat', () => {
    // The live 2026-07-28 failure in one assertion: under the old msg{index} prefix, pruning one message
    // deleted a DIFFERENT message's record. A uid prefix makes that structurally impossible.
    const keys = [sceneName(uidA, 1, 'h1'), sceneName(uidB, 1, 'h2'), sceneName(uidElsewhere, 1, 'h3')];
    expect(staleSiblingKeys(keys, uidA, new Set([sceneName(uidA, 1, 'h1')]))).toEqual([]);
  });

  it('never touches foreign or legacy names', () => {
    const keys = ['櫻花飛舞的人光學園校門口', 'msg2_scene_1_159y58o', 'pack_default_bg', `${uidA}_scene_x_h`];
    expect(staleSiblingKeys(keys, uidA, new Set([sceneName(uidA, 1, 'h1')]))).toEqual([]);
  });

  it('deletes nothing on an empty keep-set (transient mid-stream scan)', () => {
    const keys = [sceneName(uidA, 1, 'h1'), sceneName(uidA, 2, 'h2')];
    expect(staleSiblingKeys(keys, uidA, new Set())).toEqual([]);
    expect(staleSiblingKeys(keys, uidA, null)).toEqual([]);
    expect(staleSiblingKeys(keys, '', new Set([sceneName(uidA, 1, 'h1')]))).toEqual([]);
  });
});

describe('deadBackgroundKeys (orphan sweep)', () => {
  const live = new Set([sceneName(uidA, 1, 'h1'), sceneName(uidA, 2, 'h2')]);

  it('deletes this chat\'s records that no live message references', () => {
    const gone = sceneName(uidB, 1, 'h9'); // uidB's message was deleted
    expect(deadBackgroundKeys([...live, gone], live, CHAT)).toEqual([gone]);
  });

  it('NEVER deletes another chat\'s records, referenced or not', () => {
    // The store is global; "not in THIS chat" is not evidence of death.
    const foreignChat = sceneName(uidElsewhere, 1, 'h9');
    expect(deadBackgroundKeys([...live, foreignChat], live, CHAT)).toEqual([]);
  });

  it('deletes unreferenced PRE-UID leftovers (dead by construction — nothing mints them)', () => {
    const legacy = ['msg8_scene_2_jhd8qg', 'msg2_scene_1', 'msg2_scene_2_159y58o'];
    expect(deadBackgroundKeys([...live, ...legacy], live, CHAT)).toEqual(legacy);
  });

  it('keeps a legacy name a message still references (re-shape has not run yet)', () => {
    const stillUsed = 'msg4_scene_1_glhvnc';
    const liveWithLegacy = new Set([...live, stillUsed]);
    expect(deadBackgroundKeys([...liveWithLegacy], liveWithLegacy, CHAT)).toEqual([]);
  });

  it('never deletes a foreign scene name', () => {
    const foreign = ['櫻花飛舞的人光學園校門口', 'pack_default_bg', 'classroom_morning', ''];
    expect(deadBackgroundKeys([...live, ...foreign], live, CHAT)).toEqual([]);
  });

  it('deletes NOTHING without a chat key or a live set (refuse rather than guess)', () => {
    const keys = [sceneName(uidA, 1, 'h1'), sceneName(uidB, 1, 'h9'), 'msg8_scene_2_jhd8qg'];
    expect(deadBackgroundKeys(keys, live, null)).toEqual([]);   // chat id unresolvable
    expect(deadBackgroundKeys(keys, new Set(), CHAT)).toEqual([]); // transient/empty chat read
    expect(deadBackgroundKeys(keys, null, CHAT)).toEqual([]);
  });
});

// ── pairImagesToScenes — bind by image hash, never by document position ───────
// The live 2026-08-02 bug: binding an <img> to the nearest PRECEDING <background> is the INVERSE of
// how the beat-shaper assigns scenes (a beat is owned by the nearest image AFTER it). Interspersed
// replies hid it for weeks; a tail-clustered reply lost scene_1 entirely and orphaned image #1.
describe('pairImagesToScenes (scene↔image binding)', () => {
  const uid = sceneUid(CHAT, 'pra3wa');
  const src1 = '/user/images/ArtificKoi/A_21h47m58s675ms.png';
  const src2 = '/user/images/ArtificKoi/A_21h48m22s582ms.png';
  const scene1 = sceneName(uid, 1, shortHash(src1));
  const scene2 = sceneName(uid, 2, shortHash(src2));
  const bg = (n) => `<background scene="${n}" />`;
  const img = (s) => `<span class="auto-img-wrap" data-rawtag="x"><img src="${s}" title="t" alt="a"><span class="auto-img-regen"></span></span>`;

  it('TAIL-CLUSTERED images still bind to their OWN scene (the live regression)', () => {
    // Every image sits AFTER every scene tag — the exact shape that made position-binding collapse
    // both images onto scene_2 and leave scene_1 unwritten.
    const mes = `${bg(scene1)}<p>a</p><p>b</p>${bg(scene2)}<p>c</p>${img(src1)}${img(src2)}`;
    const { pairs, unmatchedImages, foreignScenes } = pairImagesToScenes(mes);
    expect(pairs).toEqual([{ scene: scene1, url: src1 }, { scene: scene2, url: src2 }]);
    expect(unmatchedImages).toBe(0);
    expect(foreignScenes).toBe(0);
  });

  it('interspersed images bind identically — order genuinely does not matter', () => {
    const mes = `${bg(scene1)}<p>a</p>${img(src1)}${bg(scene2)}<p>b</p>${img(src2)}`;
    expect(pairImagesToScenes(mes).pairs).toEqual([{ scene: scene1, url: src1 }, { scene: scene2, url: src2 }]);
  });

  it('REVERSED document order still binds correctly (position carries no meaning)', () => {
    const mes = `${bg(scene1)}${bg(scene2)}${img(src2)}${img(src1)}`;
    expect(pairImagesToScenes(mes).pairs).toEqual([{ scene: scene2, url: src2 }, { scene: scene1, url: src1 }]);
  });

  it('one image bound to SEVERAL beat runs yields a pair per scene (same url)', () => {
    const scene2SameImg = sceneName(uid, 2, shortHash(src1));
    const mes = `${bg(scene1)}${bg(scene2SameImg)}${img(src1)}`;
    expect(pairImagesToScenes(mes).pairs).toEqual([
      { scene: scene1, url: src1 }, { scene: scene2SameImg, url: src1 },
    ]);
  });

  it('an image matching no scene hash is SKIPPED and counted, never bound to a guess', () => {
    const stray = '/user/images/hand-pasted.png';
    const { pairs, unmatchedImages } = pairImagesToScenes(`${bg(scene1)}${img(src1)}${img(stray)}`);
    expect(pairs).toEqual([{ scene: scene1, url: src1 }]);
    expect(unmatchedImages).toBe(1);
  });

  it('foreign / not-yet-shaped scene names are counted, never written', () => {
    const mes = `<background scene="櫻花飛舞的人光學園校門口" /><background scene="msg4_scene_1_glhvnc" />${img(src1)}`;
    const { pairs, foreignScenes, unmatchedImages } = pairImagesToScenes(mes);
    expect(pairs).toEqual([]);
    expect(foreignScenes).toBe(2);
    expect(unmatchedImages).toBe(1);
  });

  it('hashes the RAW src but stores the DECODED url (the shaper named it from the raw text)', () => {
    const rawSrc = '/user/images/a.png?v=1&amp;w=2';
    const scene = sceneName(uid, 1, shortHash(rawSrc));
    const { pairs } = pairImagesToScenes(`${bg(scene)}${img(rawSrc)}`);
    expect(pairs).toEqual([{ scene, url: '/user/images/a.png?v=1&w=2' }]);
  });

  it('empty / imageless / junk input returns nothing and throws nothing', () => {
    expect(pairImagesToScenes('').pairs).toEqual([]);
    expect(pairImagesToScenes(null).pairs).toEqual([]);
    expect(pairImagesToScenes(`${bg(scene1)}<p>prose only</p>`).pairs).toEqual([]);
  });
});

// The latch is edge-driven in the live seam, and an edge-driven latch is only as correct as the last
// edge it happened to see. This decision is the backstop that needs no edge — so the cases that matter
// are the ones where the two sources disagree, and the ones where writing would be presumptuous.
describe('decideForceReconcile (the ForceImageType backstop)', () => {
  it('CORRECTS a latch left true while galgame is closed — the live 2026-08-09 bug', () => {
    // Stuck true from a misread at seam start: every image generated since was forced to the backdrop
    // aspect while the player was reading the normal chat.
    const d = decideForceReconcile({ stored: [true, '強制圖片比例'], live: false });
    expect(d.write).toBe(true);
    expect(d.to).toBe(false);
    expect(d.reason).toMatch(/CLOSED/);
  });

  it('CORRECTS the other direction too — galgame open, latch false', () => {
    const d = decideForceReconcile({ stored: [false, 'label'], live: true });
    expect(d.write).toBe(true);
    expect(d.to).toBe(true);
    expect(d.reason).toMatch(/OPEN/);
  });

  it('writes NOTHING when the two already agree (both directions)', () => {
    expect(decideForceReconcile({ stored: [false, 'l'], live: false }).write).toBe(false);
    expect(decideForceReconcile({ stored: [true, 'l'], live: true }).write).toBe(false);
  });

  it('unwraps the MVU tuple — a bare boolean is equally valid', () => {
    // Comparing a tuple to a boolean would never be equal, so a correct latch would be rewritten on
    // every single pass. Both shapes must read the same.
    expect(decideForceReconcile({ stored: true, live: true }).write).toBe(false);
    expect(decideForceReconcile({ stored: false, live: false }).write).toBe(false);
    expect(decideForceReconcile({ stored: true, live: false })).toMatchObject({ write: true, to: false });
  });

  it('NEVER writes when the card has no such path — the platform must not create a consumer field', () => {
    for (const stored of [undefined, null, [undefined, 'label']]) {
      const d = decideForceReconcile({ stored, live: true });
      expect(d.write).toBe(false);
      expect(d.reason).toMatch(/absent/);
    }
  });

  it('corrects a stored value that is not a boolean — an uninterpretable latch is not a latch', () => {
    for (const stored of ['true', 1, {}, ['on', 'label']]) {
      const d = decideForceReconcile({ stored, live: false });
      expect(d.write).toBe(true);
      expect(d.to).toBe(false);
    }
  });

  it('treats a missing/garbage live flag as CLOSED rather than throwing', () => {
    expect(decideForceReconcile({ stored: [true, 'l'] })).toMatchObject({ write: true, to: false });
    expect(decideForceReconcile()).toMatchObject({ write: false });
  });
});

// ── unboundImageReport — the line that was missing when EVERY image was orphaned ──────────────
// Live 2026-08-11: a <pic> emitted OUTSIDE <maintext> (after the RES blocks) got no scene tag, so
// pairs was empty — and the old `pairs.length && …` gate then said nothing at all. The stage rendered
// blank with no console line anywhere naming a cause. Zero pairs is ambiguous on its own, so these
// tests pin BOTH directions: it must speak on the finished-and-orphaned case, and stay quiet while a
// producer is demonstrably still working.
describe('unboundImageReport — a fully orphaned message must not fail silently', () => {
  const IMG = (src) => `<span class="auto-img-wrap"><img src="${src}"></span></span>`;
  const scan = (raw) => unboundImageReport(raw, pairImagesToScenes(raw));

  it('THE LIVE CASE: image in the TAIL, no scene tags, envelope closed ⇒ reports and names the cause', () => {
    const raw = `<maintext>\n<p>prose</p>\n</maintext>\n<RES_Variable>[]</RES_Variable>\n${IMG('/a.png')}`;
    const r = scan(raw);
    expect(r).toMatch(/EVERY image is unbound/);
    expect(r).toMatch(/1 rendered image\(s\), 0 scene tag\(s\)/);
    expect(r).toMatch(/NO backdrop/);
    expect(r).toMatch(/outside the envelope/);      // points at the actual defect, not just "unbound"
  });

  it('stays silent while the envelope is still open — the shaper has not run yet', () => {
    expect(scan(`<maintext>\n<p>prose</p>\n${IMG('/a.png')}`)).toBe(null);
  });

  it('stays silent while mvu-helper still owes a render — a raw <pic> is left', () => {
    const raw = `<maintext>\n<p>p</p>\n${IMG('/a.png')}\n<pic char="X" prompt="y">\n</maintext>`;
    expect(scan(raw)).toBe(null);
  });

  it('says nothing when there are no images at all — a text reply is not a defect', () => {
    expect(scan('<maintext>\n<p>prose only</p>\n</maintext>')).toBe(null);
  });

  const reportUid = sceneUid(CHAT, 'rpt001');

  it('a correctly bound image reports nothing', () => {
    const src = '/user/images/x.png';
    const raw = `<maintext>\n<background scene="${sceneName(reportUid, 1, shortHash(src))}">\n<p>p</p>\n${IMG(src)}\n</maintext>`;
    expect(scan(raw)).toBe(null);
  });

  it('the PARTIAL mismatch keeps its old wording (some bound, some not)', () => {
    const src = '/bound.png';
    const raw = `<maintext>\n<background scene="${sceneName(reportUid, 1, shortHash(src))}">\n<p>p</p>\n`
      + `${IMG(src)}\n${IMG('/orphan.png')}\n</maintext>`;
    const r = scan(raw);
    expect(r).toMatch(/1 image\(s\) matched no scene hash/);
    expect(r).not.toMatch(/EVERY image is unbound/);
  });

  it('scene tags present but none carrying an image hash names DRIFT, not bad placement', () => {
    const raw = `<maintext>\n<background scene="${sceneName(reportUid, 1, shortHash('/gone.png'))}">\n<p>p</p>\n`
      + `${IMG('/different.png')}\n</maintext>`;
    const r = scan(raw);
    expect(r).toMatch(/EVERY image is unbound/);
    expect(r).toMatch(/drifted/);
    expect(r).not.toMatch(/outside the envelope/);
  });
});
