// beat-shaper-core unit tests — pure transform (plan GALGAME_DUMB_TERMINAL_PLAN.md §5.1). v0.1
import { describe, it, expect } from 'vitest';
import { shapeMessage, sceneName, SCENE_NAME_RE } from '../src/beat-shaper-core.js';

// A rendered image block exactly as mvu-helper's imagegen REPLACE path writes it.
const img = (n) =>
  `<span class="auto-img-wrap" data-rawtag="&lt;pic char=&quot;Mitsuki&quot;&gt;"><img src="http://127.0.0.1:8000/img${n}.png" title="p${n}" alt="p${n}"><span class="auto-img-regen fa-solid fa-arrows-rotate" title="Regenerate image" role="button" tabindex="0" style="cursor:pointer;"></span></span>`;

describe('scene naming contract (§2.1)', () => {
  it('sceneName round-trips through SCENE_NAME_RE', () => {
    const m = sceneName(42, 3).match(SCENE_NAME_RE);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('42');
    expect(m[2]).toBe('3');
  });
  it('rejects foreign names', () => {
    expect('櫻花飛舞的人光學園校門口').not.toMatch(SCENE_NAME_RE);
    expect('msg42_scene_').not.toMatch(SCENE_NAME_RE);
    expect('xmsg42_scene_1').not.toMatch(SCENE_NAME_RE);
  });
});

describe('gating', () => {
  it('leaves non-galgame messages alone', () => {
    const r = shapeMessage('plain prose, no maintext tag at all', 1);
    expect(r.changed).toBe(false);
    expect(r.deferred).toBeNull();
  });
  it('defers while <maintext> is unclosed (streaming)', () => {
    const r = shapeMessage('<maintext>\nstill streaming…', 1);
    expect(r.changed).toBe(false);
    expect(r.deferred).toBe('maintext-unclosed');
  });
  it('defers while a raw <pic> tag is pending (image gen in flight)', () => {
    const r = shapeMessage('<maintext>\n<p>a</p>\n<pic char="X" prompt="y">\n</maintext>', 1);
    expect(r.changed).toBe(false);
    expect(r.deferred).toBe('pics-pending');
  });
  it('handles empty/non-string input', () => {
    expect(shapeMessage('', 1).changed).toBe(false);
    expect(shapeMessage(null, 1).changed).toBe(false);
  });
});

describe('<p>-wrapping', () => {
  it('wraps bare prose paragraphs, one per blank-line block', () => {
    const raw = '<maintext>\n第一段旁白。\n\n第二段旁白，跨\n兩行。\n</maintext>';
    const r = shapeMessage(raw, 5);
    expect(r.changed).toBe(true);
    expect(r.stats.wrapped).toBe(2);
    expect(r.text).toContain('<p>第一段旁白。</p>');
    expect(r.text).toContain('<p>第二段旁白，跨\n兩行。</p>');
  });
  it('never double-wraps existing <p> beats', () => {
    const raw = '<maintext>\n<p>橘美月: "你好"<微笑></p>\n\n裸旁白。\n</maintext>';
    const r = shapeMessage(raw, 5);
    expect(r.text).toContain('<p>橘美月: "你好"<微笑></p>');
    expect(r.text).not.toContain('<p><p>');
    expect(r.stats.wrapped).toBe(1);
  });
  it('leaves protected blocks and tag-only command lines bare', () => {
    const raw =
      '<maintext>\n<bgm>Spring Breath</bgm>\n\n<sprite action="exit" character="A" />\n\n<styled type="手机短信" from="小明">小明: 到了</styled>\n\n prose here \n</maintext>';
    const r = shapeMessage(raw, 5);
    expect(r.text).toContain('<bgm>Spring Breath</bgm>');
    expect(r.text).not.toContain('<p><bgm>');
    expect(r.text).not.toContain('<p><sprite');
    expect(r.text).not.toContain('<p><styled');
    expect(r.text).toContain('<p>prose here</p>');
  });
  it('touches nothing outside <maintext>', () => {
    const raw = 'planning notes stay bare\n<maintext>\nprose\n</maintext>\ntrailer stays bare';
    const r = shapeMessage(raw, 5);
    expect(r.text).toMatch(/^planning notes stay bare\n/);
    expect(r.text).toMatch(/\ntrailer stays bare$/);
    expect(r.text).not.toContain('<p>planning');
    expect(r.text).not.toContain('<p>trailer');
  });
});

describe('scene strip + inject', () => {
  it('strips narrator/galgame-COT scene tags', () => {
    const raw = '<maintext>\n<background scene="櫻花飛舞的人光學園校門口" />\n<p>a</p>\n</maintext>';
    const r = shapeMessage(raw, 7);
    expect(r.text).not.toContain('櫻花飛舞');
    expect(r.stats.strippedScenes).toBe(1);
  });
  it('one image → scene_1 hoisted to the top of <maintext>', () => {
    const raw = `<maintext>\n<p>beat one</p>\n\n旁白。\n\n${img(1)}\n\n<p>beat after</p>\n</maintext>`;
    const r = shapeMessage(raw, 7);
    const inner = r.text.slice(r.text.indexOf('<maintext>') + '<maintext>'.length);
    expect(inner.trimStart().startsWith(`<background scene="${sceneName(7, 1)}" />`)).toBe(true);
    expect(r.stats.scenes).toBe(1);
    expect((r.text.match(/<background\b/g) || []).length).toBe(1);
  });
  it('N images → scene_1 top, scene_n directly above image n', () => {
    const raw = `<maintext>\n<p>b1</p>\n${img(1)}\n<p>b2</p>\n${img(2)}\n<p>b3</p>\n</maintext>`;
    const r = shapeMessage(raw, 9);
    const s1 = r.text.indexOf(sceneName(9, 1));
    const i1 = r.text.indexOf('img1.png');
    const s2 = r.text.indexOf(sceneName(9, 2));
    const i2 = r.text.indexOf('img2.png');
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(-1);
    expect(s1).toBeLessThan(i1);
    expect(i1).toBeLessThan(s2);
    expect(s2).toBeLessThan(i2);
    // no scene tag other than ours
    expect((r.text.match(/<background\b/g) || []).length).toBe(2);
  });
});

describe('idempotency', () => {
  const sample = `pre-planning\n<maintext>\n<background scene="舊場景" />\n<bgm>Song</bgm>\n\n裸旁白第一段。\n\n<p>橘美月[微笑,女聲]: "對話"</p>\n\n${img(1)}\n\n又一段旁白。\n\n${img(2)}\n\n<p>結尾</p>\n</maintext>\npost`;
  it('second run is a no-op (changed=false, identical text)', () => {
    const r1 = shapeMessage(sample, 42);
    expect(r1.changed).toBe(true);
    const r2 = shapeMessage(r1.text, 42);
    expect(r2.changed).toBe(false);
    expect(r2.text).toBe(r1.text);
  });
  it('re-run re-derives the same scene set (strip-then-inject)', () => {
    const r1 = shapeMessage(sample, 42);
    const names = [...r1.text.matchAll(/<background scene="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([sceneName(42, 1), sceneName(42, 2)]);
  });
});
