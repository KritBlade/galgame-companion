// beat-shaper-core unit tests — pure transform (plan GALGAME_DUMB_TERMINAL_PLAN.md §5.1). v0.2
import { describe, it, expect } from 'vitest';
import {
  shapeMessage, sceneName, sceneUid, shortHash, uidOfSceneName, chatKeyOfSceneName,
  SCENE_NAME_RE, LEGACY_SCENE_NAME_RE, parseCombatLog, repairTruncatedEnvelope,
} from '../src/features/beat-shaper/beat-shaper-core.js';

// A rendered image block exactly as mvu-helper's imagegen REPLACE path writes it.
const imgSrc = (n) => `http://127.0.0.1:8000/img${n}.png`;
const img = (n) =>
  `<span class="auto-img-wrap" data-rawtag="&lt;pic char=&quot;Mitsuki&quot;&gt;"><img src="${imgSrc(n)}" title="p${n}" alt="p${n}"><span class="auto-img-regen fa-solid fa-arrows-rotate" title="Regenerate image" role="button" tabindex="0" style="cursor:pointer;"></span></span>`;

// Deterministic stand-in for the live minter (beat-shaper.js mintUidForCurrentChat). Counts calls so a
// test can assert the uid is minted at most ONCE per shape and never for an image-less message.
const CHAT_KEY = 'k9f3x2';
function stubMinter(uid = sceneUid(CHAT_KEY, 'a1b2c3')) {
  const f = () => { f.calls++; return uid; };
  f.calls = 0;
  f.uid = uid;
  return f;
}
const mint = () => stubMinter();
// Expected injected name for image #n under a given uid (name carries the src hash, §2.1).
const nameFor = (uid, n) => sceneName(uid, n, shortHash(imgSrc(n)));

describe('scene naming contract (§2.1)', () => {
  it('sceneName round-trips through SCENE_NAME_RE', () => {
    const uid = sceneUid('k9f3x2', 'a1b2c3');
    expect(uid).toBe('gck9f3x2-a1b2c3');
    const m = sceneName(uid, 3, 'ab12z').match(SCENE_NAME_RE);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(uid);       // 1 = uid
    expect(m[2]).toBe('k9f3x2');  // 2 = chatKey
    expect(m[3]).toBe('3');       // 3 = beat number
    expect(m[4]).toBe('ab12z');   // 4 = image hash
  });
  it('uidOfSceneName / chatKeyOfSceneName read the name back', () => {
    const n = sceneName(sceneUid('c1', 'r1'), 2, 'h1');
    expect(uidOfSceneName(n)).toBe('gcc1-r1');
    expect(chatKeyOfSceneName(n)).toBe('c1');
    expect(uidOfSceneName('櫻花飛舞的人光學園校門口')).toBeNull();
    expect(chatKeyOfSceneName(null)).toBeNull();
  });
  it('rejects foreign names', () => {
    expect('櫻花飛舞的人光學園校門口').not.toMatch(SCENE_NAME_RE);
    expect('gcabc-def_scene_').not.toMatch(SCENE_NAME_RE);
    expect('xgcabc-def_scene_1_h').not.toMatch(SCENE_NAME_RE);
    expect('gcabc-def_scene_1').not.toMatch(SCENE_NAME_RE); // hash is mandatory now
  });
  it('rejects PRE-UID names, which only LEGACY_SCENE_NAME_RE still recognises', () => {
    // The msg{index} form is what collided across messages after a delete (§2.1). It must no longer
    // read as a current name, but the sweep still has to recognise it as OURS to clean it up.
    for (const legacy of ['msg2_scene_1', 'msg2_scene_2_159y58o', 'msg8_scene_2_jhd8qg']) {
      expect(legacy).not.toMatch(SCENE_NAME_RE);
      expect(legacy).toMatch(LEGACY_SCENE_NAME_RE);
    }
    expect('gck9f3x2-a1b2c3_scene_1_abc').not.toMatch(LEGACY_SCENE_NAME_RE);
    expect('櫻花').not.toMatch(LEGACY_SCENE_NAME_RE);
  });
  it('two uids from the same chat never substring-match each other (galgame findBestMatchScene safety)', () => {
    // galgame falls back to substring containment when a name misses; two full sibling names must not
    // cross-match, or a dead beat would silently borrow another message's backdrop.
    const a = sceneName(sceneUid(CHAT_KEY, 'aaaaaa'), 1, 'h1');
    const b = sceneName(sceneUid(CHAT_KEY, 'bbbbbb'), 1, 'h1');
    expect(a.includes(b)).toBe(false);
    expect(b.includes(a)).toBe(false);
  });
  it('shortHash is deterministic and content-sensitive', () => {
    expect(shortHash('a')).toBe(shortHash('a'));
    expect(shortHash('a')).not.toBe(shortHash('b'));
    expect(shortHash('x')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('uid minting + recovery (§2.1)', () => {
  const withOneImage = `<maintext>\n<p>b</p>\n${img(1)}\n</maintext>`;

  it('mints exactly once for a first shape and stamps it into every scene name', () => {
    const m = stubMinter();
    const r = shapeMessage(`<maintext>\n<p>b1</p>\n${img(1)}\n<p>b2</p>\n${img(2)}\n</maintext>`, m);
    expect(m.calls).toBe(1); // one uid per MESSAGE, not per image
    expect(r.stats.uid).toBe(m.uid);
    expect(r.stats.uidMinted).toBe(true);
    const names = [...r.text.matchAll(/<background scene="([^"]+)"/g)].map((x) => x[1]);
    expect(names).toEqual([nameFor(m.uid, 1), nameFor(m.uid, 2)]);
  });

  it('never mints for a message with no images', () => {
    const m = stubMinter();
    const r = shapeMessage('<maintext>\n裸旁白。\n</maintext>', m);
    expect(m.calls).toBe(0); // a uid nobody writes into the text could never be recovered
    expect(r.stats.uid).toBeNull();
    expect(r.stats.uidMinted).toBe(false);
  });

  it('RECOVERS the existing uid on a re-shape instead of minting a new one', () => {
    const first = stubMinter();
    const r1 = shapeMessage(withOneImage, first);
    const second = stubMinter(sceneUid(CHAT_KEY, 'zzzzzz')); // would be a DIFFERENT uid if called
    const r2 = shapeMessage(r1.text, second);
    expect(second.calls).toBe(0);
    expect(r2.stats.uid).toBe(first.uid);
    expect(r2.stats.uidMinted).toBe(false);
    expect(r2.changed).toBe(false);
  });

  it('keeps its uid when a message is RENUMBERED (the delete bug this replaces)', () => {
    // Regression lock for the live 2026-07-28 failure: message 6 still carried msg2_* names because the
    // old prefix was the chat index, so shaping the NEW message 2 pruned message 6's backdrop record.
    // shapeMessage no longer accepts an index at all — a renumber cannot reach the name.
    const m = stubMinter();
    const r1 = shapeMessage(withOneImage, m);
    const nameBefore = r1.text.match(/<background scene="([^"]+)"/)[1];
    const afterDelete = shapeMessage(r1.text, stubMinter(sceneUid(CHAT_KEY, 'other1')));
    expect(afterDelete.text.match(/<background scene="([^"]+)"/)[1]).toBe(nameBefore);
  });

  it('a REGENERATED image changes the hash but KEEPS the uid', () => {
    const withImg = (src) =>
      `<maintext>\n<p>b</p>\n<span class="auto-img-wrap" data-rawtag="&lt;pic&gt;"><img src="${src}"><span class="auto-img-regen"></span></span>\n</maintext>`;
    const m = stubMinter();
    const a = shapeMessage(withImg('http://h/old.png'), m);
    // A regen rewrites the <img> src inside the ALREADY-SHAPED text, so the old scene tag is still there.
    const regenned = a.text.replace('http://h/old.png', 'http://h/new.png');
    const b = shapeMessage(regenned, stubMinter(sceneUid(CHAT_KEY, 'nope11')));
    const nameA = a.text.match(/<background scene="([^"]+)"/)[1];
    const nameB = b.text.match(/<background scene="([^"]+)"/)[1];
    expect(nameA).not.toBe(nameB);                       // → galgame Map miss → fresh backdrop, no stale
    expect(uidOfSceneName(nameB)).toBe(m.uid);           // …but still THIS message's record set, so the
    expect(b.stats.uidMinted).toBe(false);               //    seam's prune drops the superseded sibling
  });
});

describe('gating', () => {
  it('leaves non-galgame messages alone', () => {
    const r = shapeMessage('plain prose, no maintext tag at all', mint());
    expect(r.changed).toBe(false);
    expect(r.deferred).toBeNull();
  });
  it('defers while <maintext> is unclosed (streaming)', () => {
    const r = shapeMessage('<maintext>\nstill streaming…', mint());
    expect(r.changed).toBe(false);
    expect(r.deferred).toBe('maintext-unclosed');
  });
  // A pending <pic> holds back SCENE BINDING ONLY — never the envelope rename. An image backend that
  // hangs (unreachable ComfyUI, blocked port, wedged queue) leaves the raw <pic> in the message
  // forever, and deferring the rename that long left galgame parsing the WHOLE message — including
  // <UpdateVariable>, whose `{ "op"` became a speaker name and broke the GUI until reload.
  it('shapes a <gametxt> reply even while a raw <pic> is pending — the rename must not wait on images', () => {
    const r = shapeMessage('<gametxt>\nbare prose.\n\n<pic char="X" prompt="y">\n</gametxt>', mint());
    expect(r.deferred).toBeNull();
    expect(r.changed).toBe(true);
    expect(r.stats.renamed).toBe(true);
    expect(r.text).toContain('<maintext>');
    expect(r.text).toContain('</maintext>');
    expect(r.text).not.toContain('<gametxt>');
    expect(r.stats.picsPending).toBe(true);
    expect(r.stats.scenes).toBe(0);          // held back — the image set is incomplete
    expect(r.stats.uid).toBeNull();          // and no identity is burned on a scene we won't write
    expect(r.text).toContain('<pic char="X" prompt="y">'); // the splice anchor survives VERBATIM
  });

  it('binds scenes on the retry once the <pic> has become a rendered image', () => {
    const rendered = '<span class="auto-img-wrap" data-rawtag="&lt;pic&gt;"><img src="a.png"><span></span></span>';
    const r = shapeMessage(`<maintext>\n<p>a</p>\n${rendered}\n</maintext>`, mint());
    expect(r.stats.picsPending).toBe(false);
    expect(r.stats.scenes).toBe(1);
    expect(r.stats.uid).not.toBeNull();
  });
  it('handles empty/non-string input', () => {
    expect(shapeMessage('', mint()).changed).toBe(false);
    expect(shapeMessage(null, mint()).changed).toBe(false);
  });
});

describe('<p>-wrapping', () => {
  it('wraps bare prose paragraphs, one per blank-line block', () => {
    const raw = '<maintext>\n第一段旁白。\n\n第二段旁白，跨\n兩行。\n</maintext>';
    const r = shapeMessage(raw, mint());
    expect(r.changed).toBe(true);
    expect(r.stats.wrapped).toBe(2);
    expect(r.text).toContain('<p>第一段旁白。</p>');
    expect(r.text).toContain('<p>第二段旁白，跨\n兩行。</p>');
  });
  it('never double-wraps existing <p> beats', () => {
    const raw = '<maintext>\n<p>橘美月: "你好"<微笑></p>\n\n裸旁白。\n</maintext>';
    const r = shapeMessage(raw, mint());
    expect(r.text).toContain('<p>橘美月: "你好"<微笑></p>');
    expect(r.text).not.toContain('<p><p>');
    expect(r.stats.wrapped).toBe(1);
  });
  it('leaves protected blocks and tag-only command lines bare', () => {
    const raw =
      '<maintext>\n<bgm>Spring Breath</bgm>\n\n<sprite action="exit" character="A" />\n\n<styled type="手机短信" from="小明">小明: 到了</styled>\n\n prose here \n</maintext>';
    const r = shapeMessage(raw, mint());
    expect(r.text).toContain('<bgm>Spring Breath</bgm>');
    expect(r.text).not.toContain('<p><bgm>');
    expect(r.text).not.toContain('<p><sprite');
    expect(r.text).not.toContain('<p><styled');
    expect(r.text).toContain('<p>prose here</p>');
  });
  it('touches nothing outside <maintext>', () => {
    const raw = 'planning notes stay bare\n<maintext>\nprose\n</maintext>\ntrailer stays bare';
    const r = shapeMessage(raw, mint());
    expect(r.text).toMatch(/^planning notes stay bare\n/);
    expect(r.text).toMatch(/\ntrailer stays bare$/);
    expect(r.text).not.toContain('<p>planning');
    expect(r.text).not.toContain('<p>trailer');
  });
});

describe('scene strip + inject', () => {
  it('strips narrator/galgame-COT scene tags', () => {
    const raw = '<maintext>\n<background scene="櫻花飛舞的人光學園校門口" />\n<p>a</p>\n</maintext>';
    const r = shapeMessage(raw, mint());
    expect(r.text).not.toContain('櫻花飛舞');
    expect(r.stats.strippedScenes).toBe(1);
  });
  it('one image → scene_1 hoisted to the top of <maintext>', () => {
    const m = stubMinter();
    const raw = `<maintext>\n<p>beat one</p>\n\n旁白。\n\n${img(1)}\n\n<p>beat after</p>\n</maintext>`;
    const r = shapeMessage(raw, m);
    const inner = r.text.slice(r.text.indexOf('<maintext>') + '<maintext>'.length);
    expect(inner.trimStart().startsWith(`<background scene="${nameFor(m.uid, 1)}" />`)).toBe(true);
    expect(r.stats.scenes).toBe(1);
    expect((r.text.match(/<background\b/g) || []).length).toBe(1);
  });
  it('N images → scene_1 top; scene_n OPENS beat n (leads its prose, right after image n-1)', () => {
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n${img(1)}\n<p>b2</p>\n${img(2)}\n<p>b3</p>\n</maintext>`;
    const r = shapeMessage(raw, m);
    const s1 = r.text.indexOf(nameFor(m.uid, 1));
    const p1 = r.text.indexOf('<p>b1</p>');
    const i1 = r.text.indexOf('img1.png');
    const s2 = r.text.indexOf(nameFor(m.uid, 2));
    const p2 = r.text.indexOf('<p>b2</p>');
    const i2 = r.text.indexOf('img2.png');
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(-1);
    // scene 1 LEADS beat 1; beat-1 prose precedes image 1
    expect(s1).toBeLessThan(p1);
    expect(p1).toBeLessThan(i1);
    // scene 2 sits AFTER image 1 but BEFORE beat-2 prose, so galgame's nearest-preceding resolve renders
    // <p>b2> on scene 2. REGRESSION LOCK: v0.3 placed scene 2 above image 2 (AFTER <p>b2>), so b2 rendered
    // on scene 1 and scene 2's backdrop never displayed — s2 < p2 is exactly what that bug violated.
    expect(i1).toBeLessThan(s2);
    expect(s2).toBeLessThan(p2);
    expect(p2).toBeLessThan(i2);
    // no scene tag other than ours
    expect((r.text.match(/<background\b/g) || []).length).toBe(2);
  });
  it('TAIL-CLUSTERED images (both at the end, no prose between) still bind BOTH scenes to beats', () => {
    // Reasoning-model failure mode: all prose first, then img1 img2 adjacent at the tail. The old code
    // anchored scene #2 right after image #1 (past every beat) so it governed NO beat and image #2 never
    // displayed. v0.5 binds scenes to beats + steals a trailing beat for the starved image.
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n\n<p>b2</p>\n\n<p>b3</p>\n${img(1)}\n${img(2)}\n</maintext>`;
    const r = shapeMessage(raw, m);
    const s1 = r.text.indexOf(nameFor(m.uid, 1));
    const s2 = r.text.indexOf(nameFor(m.uid, 2));
    const p3 = r.text.indexOf('<p>b3</p>');
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(-1);
    expect(r.stats.scenes).toBe(2);
    expect(s1).toBeLessThan(s2); // scene 1 top, scene 2 later
    expect(s2).toBeLessThan(p3); // scene 2 LEADS the last beat → galgame renders b3 on image #2 (it displays)
    expect((r.text.match(/<background\b/g) || []).length).toBe(2);
  });
});

// mvu-helper wraps a <pic> it could NOT render in the SAME auto-img-wrap envelope as a real image, so
// downstream consumers keep treating it as image machinery rather than prose. It carries no <img> and no
// regen control. Counting one as an image is what broke the live reply of 2026-08-09.
const placeholder = () =>
  '<span class="auto-img-wrap" data-rawtag="&lt;pic char=&quot;Mitsuki&quot;&gt;">'
  + '<code class="auto-img-pictag" style="display:block;">&lt;pic char=&quot;Mitsuki&quot;&gt;</code>'
  + '<span class="auto-img-unrendered" title="This pic tag was not rendered"></span></span>';

describe('UNRENDERED <pic> placeholder is not an image', () => {
  it('a placeholder takes no scene number — one real image still governs the WHOLE reply', () => {
    // THE LIVE BUG (2026-08-09): one image + one placeholder was censused as TWO images, so scene_2 was
    // minted and opened a beat run. No <img> carries scene_2's hash, so image-seam writes no record for
    // it, and every beat it governs renders with NO BACKDROP — image on the first beats, blank stage after.
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n\n<p>b2</p>\n${img(1)}\n\n<p>b3</p>\n\n<p>b4</p>\n${placeholder()}\n</maintext>`;
    const r = shapeMessage(raw, m);
    expect(r.stats.scenes).toBe(1);
    expect((r.text.match(/<background\b/g) || []).length).toBe(1);
    expect(r.text).toContain(nameFor(m.uid, 1));
    // Nothing may reference a scene_2 — that name is precisely what has no record to resolve to.
    expect(r.text).not.toContain(`${m.uid}_scene_2`);
    // The one scene must still LEAD every beat, including the ones after the placeholder.
    const s1 = r.text.indexOf(nameFor(m.uid, 1));
    expect(s1).toBeLessThan(r.text.indexOf('<p>b4</p>'));
  });

  it('the placeholder survives verbatim — it is protected from the <p>-wrap, just not counted', () => {
    // The two roles are separate: PROTECT both kinds of wrap (a bare <code> gets <p>-wrapped by ST's
    // renderer and corrupts the GUI), COUNT only the ones holding an image.
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n${img(1)}\n\n${placeholder()}\n</maintext>`;
    const r = shapeMessage(raw, m);
    expect(r.text).toContain(placeholder());
    expect(r.text).not.toMatch(/<p>\s*<span class="auto-img-wrap"/);
  });

  it('a reply whose ONLY wrap is a placeholder gets no scene and mints no uid', () => {
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n\n${placeholder()}\n</maintext>`;
    const r = shapeMessage(raw, m);
    expect(r.stats.scenes).toBe(0);
    expect(r.text).not.toContain('<background');
    expect(m.calls).toBe(0); // a uid nobody writes into the text can never be recovered
  });

  it('TWO real images still bind both scenes with a placeholder sitting between them', () => {
    // The two-image binding (v0.5 tail-clustering, hash-based pairing) is untouched — the placeholder
    // must simply be invisible to the census, not shift the numbering of the images around it.
    const m = stubMinter();
    const raw = `<maintext>\n<p>b1</p>\n${img(1)}\n\n<p>b2</p>\n${placeholder()}\n\n<p>b3</p>\n${img(2)}\n</maintext>`;
    const r = shapeMessage(raw, m);
    expect(r.stats.scenes).toBe(2);
    expect(r.text).toContain(nameFor(m.uid, 1));
    expect(r.text).toContain(nameFor(m.uid, 2));
    expect(r.text.indexOf(nameFor(m.uid, 2))).toBeLessThan(r.text.indexOf('<p>b3</p>'));
  });
});

describe('leaked-reasoning strip (Fix §0b)', () => {
  it('strips an ORPHAN </think> (+ the CoT before it) ahead of <maintext>, keeping maintext + tail intent', () => {
    // A reasoning model emitted planning + a bare </think> (no surviving <think> open) into .mes; the real
    // /Intent/ emission lives in the post-maintext <UpdateVariable> block and MUST survive.
    const raw = 'The user goes to the ruins. Plan: 1 do this 2 that.\nLet us go.\n</think>\n\n<maintext>\n<p>narration</p>\n</maintext>\n\n<UpdateVariable>/Intent/eventFire: leila_1</UpdateVariable>';
    const r = shapeMessage(raw, mint());
    expect(r.stats.strippedThink).toBe(1);
    expect(r.text.startsWith('<maintext>')).toBe(true); // reasoning + </think> gone; maintext leads
    expect(r.text).not.toContain('</think>');
    expect(r.text).not.toContain('Plan:');
    expect(r.text).toContain('<p>narration</p>');
    expect(r.text).toContain('/Intent/eventFire: leila_1'); // TAIL preserved — real intent survives
  });
  it('does not flag strippedThink on a clean message (no </think>)', () => {
    const r = shapeMessage('<maintext>\n<p>clean beat</p>\n</maintext>', mint());
    expect(r.stats.strippedThink).toBe(0);
  });
});

describe('gametxt→maintext bridge + engine display-noise', () => {
  it('renames a closed <gametxt> pair when no <maintext> exists', () => {
    const raw = '<think>x</think>\n<gametxt>\n<p>beat</p>\n</gametxt>\n<DateAndTime>t</DateAndTime>';
    const r = shapeMessage(raw, mint());
    expect(r.changed).toBe(true);
    expect(r.stats.renamed).toBe(true);
    expect(r.text).toContain('<maintext>');
    expect(r.text).toContain('</maintext>');
    expect(r.text).not.toContain('<gametxt>');
    expect(r.text).not.toContain('</gametxt>');
    expect(r.text).toContain('<DateAndTime>t</DateAndTime>'); // outside envelope untouched
  });
  it('leaves <gametxt> alone when <maintext> already exists', () => {
    const raw = '<gametxt>meta</gametxt>\n<maintext>\n<p>beat</p>\n</maintext>';
    const r = shapeMessage(raw, mint());
    expect(r.stats.renamed).toBe(false);
    expect(r.text).toContain('<gametxt>meta</gametxt>');
  });
  it('defers while <gametxt> is unclosed (streaming)', () => {
    const r = shapeMessage('<gametxt>\nstill streaming…', mint());
    expect(r.changed).toBe(false);
    expect(r.deferred).toBe('gametxt-unclosed');
  });
  it('strips <bgimg> prompt blocks (would display via ST renderer p-wrap)', () => {
    const raw =
      '<gametxt>\n<background scene="教室" /><bgimg>high school classroom, morning light</bgimg>\n<p>beat</p>\n</gametxt>';
    const r = shapeMessage(raw, mint());
    expect(r.stats.strippedBgimg).toBe(1);
    expect(r.text).not.toContain('<bgimg>');
    expect(r.text).not.toContain('classroom');
  });
  it('comment-hides <classmate_trait_check> so POST keeps the data but nothing displays', () => {
    const block = '<classmate_trait_check>\nPending: Mana. TRAITS: STA50 INT25.\n</classmate_trait_check>';
    const raw = `<gametxt>\n<p>beat</p>\n${block}\n</gametxt>`;
    const r = shapeMessage(raw, mint());
    expect(r.stats.hidden).toBe(1);
    expect(r.text).toContain(`<!--gc:hidden\n${block}\n-->`); // data survives for POST's inputRegex
    expect(r.text).not.toContain('<p><!--'); // the hider itself never becomes a beat
  });
  it('bridge output is idempotent (second run is a no-op)', () => {
    const raw =
      '<gametxt>\n<background scene="舊" /><bgimg>tags</bgimg>\n<p>b1</p>\n\n裸旁白。\n\n<classmate_trait_check>\nc\n</classmate_trait_check>\n</gametxt>';
    const r1 = shapeMessage(raw, mint());
    expect(r1.changed).toBe(true);
    const r2 = shapeMessage(r1.text, mint());
    expect(r2.changed).toBe(false);
    expect(r2.text).toBe(r1.text);
  });
});

describe('idempotency', () => {
  const sample = `pre-planning\n<maintext>\n<background scene="舊場景" />\n<bgm>Song</bgm>\n\n裸旁白第一段。\n\n<p>橘美月[微笑,女聲]: "對話"</p>\n\n${img(1)}\n\n又一段旁白。\n\n${img(2)}\n\n<p>結尾</p>\n</maintext>\npost`;
  it('second run is a no-op (changed=false, identical text)', () => {
    const r1 = shapeMessage(sample, stubMinter());
    expect(r1.changed).toBe(true);
    // A DIFFERENT minter on the second run: convergence must come from uid RECOVERY, not from the test
    // handing back the same value.
    const r2 = shapeMessage(r1.text, stubMinter(sceneUid(CHAT_KEY, 'zzzzzz')));
    expect(r2.changed).toBe(false);
    expect(r2.text).toBe(r1.text);
  });
  it('re-run re-derives the same scene set (strip-then-inject)', () => {
    const m = stubMinter();
    const r1 = shapeMessage(sample, m);
    const names = [...r1.text.matchAll(/<background scene="([^"]+)"/g)].map((x) => x[1]);
    expect(names).toEqual([nameFor(m.uid, 1), nameFor(m.uid, 2)]);
    // every injected name carries a hash group (load-bearing for galgame's per-name cache, §2.1)
    for (const n of names) expect(n.match(SCENE_NAME_RE)[4]).toBeTruthy();
  });
});

// ── §4 roll line: <combat_log> re-homed at the narrator's <roll/> markers ─────
const combatLog = (...lines) => `\n<combat_log>\n${lines.join('\n')}\n</combat_log>\n`;
const CRIT_FAIL = '[Support] on Mitsuki — DC 12, RawDie ①1 +2 CHA = 3 → CritFail';
const SUCCESS = '[Repair] on Mitsuki — DC 12, RawDie 13 +0 CHA = 13 → Success';

describe('parseCombatLog (§4)', () => {
  it('reads each line and tiers it by its TRAILING verdict word', () => {
    const rolls = parseCombatLog(combatLog(CRIT_FAIL, SUCCESS));
    expect(rolls.map((r) => r.outcome)).toEqual(['CritFail', 'Success']);
    expect(rolls[0].line).toBe(CRIT_FAIL);
  });

  it('never tiers a crit as an ordinary pass/fail (longest-first alternation)', () => {
    expect(parseCombatLog(combatLog('[Flirt] on Ume — DC 5 → CritSuccess'))[0].outcome).toBe('CritSuccess');
    expect(parseCombatLog(combatLog('[Flirt] on Ume — DC 20 → Failure'))[0].outcome).toBe('Failure');
  });

  it('yields nothing for the engine\'s no-roll sentence, comments, or a missing block', () => {
    expect(parseCombatLog(combatLog('No calculation needed — mundane scene, no D20 roll this reply.'))).toEqual([]);
    expect(parseCombatLog(combatLog('# a comment'))).toEqual([]);
    expect(parseCombatLog('no block here')).toEqual([]);
    expect(parseCombatLog('')).toEqual([]);
  });
});

describe('roll placement (§4)', () => {
  const shaped = (inner, log) => shapeMessage(`<gametxt>${inner}</gametxt>${log}`, mint()).text;
  const bodyOf = (t) => t.slice(t.indexOf('<maintext>'), t.indexOf('</maintext>'));

  it('substitutes marker #k with line #k, IN ORDER — not by target name', () => {
    // Both checks name Mitsuki: only positional pairing can tell them apart.
    const out = shaped('He tried to comfort her.\n<roll/>\n\nHe apologised.\n<roll/>\n', combatLog(CRIT_FAIL, SUCCESS));
    expect(out.indexOf('CritFail')).toBeLessThan(out.indexOf('→ Success'));
    expect(out).toContain('💀'); // CritFail
    expect(out).toContain('✅'); // Success
    expect(out).not.toContain('<roll/>');
  });

  it('carries severity as TEXT — galgame drops any beat holding HTML (live 2026-08-03)', () => {
    const body = bodyOf(shaped('<roll/>', combatLog(CRIT_FAIL)));
    expect(body).toContain('🎲 💀 [Support] on Mitsuki');
    expect(body).not.toContain('<span');
    expect(body).not.toContain('style=');
  });

  it('a marker on its OWN line becomes its own beat (substitution precedes the wrap)', () => {
    const body = bodyOf(shaped('He apologised.\n\n<roll/>\n\nShe turned away.', combatLog(CRIT_FAIL)));
    expect(body).toMatch(/<p>🎲 💀 \[Support\][^<]*<\/p>/);
  });

  it('escapes the model-written line rather than trusting it', () => {
    // The raw line survives verbatim in the tail's <combat_log>, which we never rewrite and galgame
    // never parses — so assert on the RENDERED body only.
    const body = bodyOf(shaped('<roll/>', combatLog('[Probe] on <script>x</script> — DC 5 → Success')));
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
  });

  it('parks UNMARKED rolls at the top, labelled — a crit fail is never silently dropped', () => {
    const body = bodyOf(shaped('He apologised.\n<roll/>\n', combatLog(SUCCESS, CRIT_FAIL)));
    const unmarked = body.indexOf('(unmarked)');
    expect(unmarked).toBeGreaterThan(-1);
    expect(body.slice(unmarked, unmarked + 120)).toContain('CritFail');
    expect(unmarked).toBeLessThan(body.indexOf('He apologised'));
  });

  it('an unmarked roll is a real BEAT, not bare text (wrapped like prose)', () => {
    const body = bodyOf(shaped('He apologised.', combatLog(CRIT_FAIL)));
    expect(body).toMatch(/<p>🎲 \(unmarked\) 💀 [^<]*<\/p>/);
  });

  it('drops a SURPLUS marker — it names a roll that never happened', () => {
    const out = shaped('a\n<roll/>\n\nb\n<roll/>\n', combatLog(SUCCESS));
    expect(out).not.toContain('<roll/>');
    expect(bodyOf(out).match(/🎲/g)).toHaveLength(1);
  });

  it('a no-roll reply renders no die anywhere', () => {
    const out = shaped('Just a quiet walk home.', combatLog('No calculation needed — mundane scene, no D20 roll this reply.'));
    expect(bodyOf(out)).not.toContain('🎲');
  });

  it('counts placed vs unplaced honestly (the log reads off these)', () => {
    const s = shapeMessage(`<gametxt>a\n<roll/>\n</gametxt>${combatLog(SUCCESS, CRIT_FAIL)}`, mint()).stats;
    expect(s).toMatchObject({ rolls: 2, rollsPlaced: 1, rollsUnplaced: 1 });
  });

  it('re-shape converges — markers are RESTORED, not accumulated (idempotency)', () => {
    const raw = `<gametxt>He apologised.\n<roll/>\n\nShe turned away.\n<roll/>\n</gametxt>${combatLog(CRIT_FAIL, SUCCESS)}`;
    const once = shapeMessage(raw, mint());
    const twice = shapeMessage(once.text, mint());
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
    expect(bodyOf(once.text).match(/🎲/g)).toHaveLength(2);
  });

  it('re-shape converges for UNMARKED rolls too (deleted, then re-derived)', () => {
    const raw = `<gametxt>He apologised.</gametxt>${combatLog(CRIT_FAIL, SUCCESS)}`;
    const once = shapeMessage(raw, mint());
    const twice = shapeMessage(once.text, mint());
    expect(twice.changed).toBe(false);
    expect(bodyOf(once.text).match(/\(unmarked\)/g)).toHaveLength(2);
  });

  it('does not disturb scene binding — scene #1 still leads the whole body', () => {
    const uid = sceneUid(CHAT_KEY, 'a1b2c3');
    const raw = `<gametxt>beat one\n\n${img(1)}\n\nbeat two\n\n${img(2)}\n</gametxt>${combatLog(CRIT_FAIL)}`;
    const out = shapeMessage(raw, stubMinter(uid)).text;
    expect(out).toContain(nameFor(uid, 1));
    expect(out).toContain(nameFor(uid, 2));
    expect(out.indexOf(nameFor(uid, 1))).toBeLessThan(out.indexOf('🎲'));
  });
});

// §4b — truncation repair. A reply that hits the token ceiling never emits its closing tag, so the
// "unclosed ⇒ still streaming" rule defers FOREVER and galgame keeps parsing raw text. Live
// 2026-08-04 that handed galgame `{ "op"` (from a half-emitted <UpdateVariable>) as a character
// name; the quote broke its CSS selector and the main-interface render failed on every attempt —
// the Galgame button stopped working until a reload.
describe('repairTruncatedEnvelope (§4b)', () => {
  it('closes after the last COMPLETE </p> and keeps the partial tail OUTSIDE the envelope', () => {
    const raw = '<maintext>\n<p>done</p>\n<charImage char="Mitsuki" body="golden amber';
    const out = repairTruncatedEnvelope(raw);
    expect(out).toBeTruthy();
    const inner = out.text.match(/<maintext>([\s\S]*?)<\/maintext>/i)[1];
    expect(inner).toContain('<p>done</p>');
    expect(inner).not.toContain('charImage');          // the truncation is outside
    expect(out.text).toContain('charImage');           // …but NOT deleted
    expect(out.droppedChars).toBeGreaterThan(0);
  });

  it('quarantines a half-emitted JSONPatch — the exact text that broke galgame', () => {
    const raw = '<maintext>\n<p>She turned away.</p>\n<UpdateVariable>\n[{ "op": "replace", "path": "/Cla';
    const inner = repairTruncatedEnvelope(raw).text.match(/<maintext>([\s\S]*?)<\/maintext>/i)[1];
    expect(inner).not.toContain('"op"');               // galgame can no longer read it as a speaker
  });

  it('repairs a <gametxt> reply with its own tag, not maintext', () => {
    const out = repairTruncatedEnvelope('<gametxt>\n<p>beat</p>\n<charImage char="X" body="cut');
    expect(out.closeTag).toBe('</gametxt>');
    expect(out.text).toContain('</gametxt>');
    expect(out.text).not.toContain('</maintext>');
  });

  it('refuses when there is no complete </p> to close after — better raw than an empty envelope', () => {
    expect(repairTruncatedEnvelope('<maintext>\n<p>never finished')).toBe(null);
  });

  it('returns null for text with no envelope at all', () => {
    expect(repairTruncatedEnvelope('just prose')).toBe(null);
    expect(repairTruncatedEnvelope('')).toBe(null);
    expect(repairTruncatedEnvelope(null)).toBe(null);
  });

  it('the repaired text then shapes normally — the turn still gets its beats', () => {
    const raw = '<maintext>\n<p>She smiled.</p>\n<p>Then she left.</p>\n<charImage char="X" body="cut';
    const shaped = shapeMessage(repairTruncatedEnvelope(raw).text, () => 'gcuidtest-aaaaaa');
    expect(shaped.deferred).toBe(null);
    expect(shaped.text).toContain('She smiled.');
    expect(shaped.text).toContain('Then she left.');
  });
});
