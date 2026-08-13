// background-manager-core unit tests — the Background Manager patch's pure decisions. v0.1
//
// Both failures this guards against are SILENT: a wrongly ordered grid still looks like a grid, and a
// stale header count still looks like a count. So the tests lean on the cases where "looks fine" and
// "is right" come apart — a library the companion never wrote (no usable timestamps), exact ties, and
// a stat line in either language.
import { describe, it, expect } from 'vitest';
import { sortSceneNamesByRecency, restatedCount } from '../src/features/image/background-manager-core.js';

const at = (iso) => Date.parse(iso);

describe('sortSceneNamesByRecency', () => {
  it('puts the newest first regardless of the alphabetical order galgame rendered', () => {
    const stamps = new Map([
      ['gc10xrcx1-bcadw2_scene_1_aaaaaa', at('2026-08-01T10:00:00Z')],
      ['gc16s0qki-0psyvj_scene_1_bbbbbb', at('2026-08-13T09:30:00Z')],
      ['gc4cdwmx-kul792_scene_2_cccccc', at('2026-08-07T18:00:00Z')],
    ]);
    const rendered = [
      'gc10xrcx1-bcadw2_scene_1_aaaaaa',
      'gc16s0qki-0psyvj_scene_1_bbbbbb',
      'gc4cdwmx-kul792_scene_2_cccccc',
    ];
    expect(sortSceneNamesByRecency(rendered, stamps)).toEqual([
      'gc16s0qki-0psyvj_scene_1_bbbbbb',
      'gc4cdwmx-kul792_scene_2_cccccc',
      'gc10xrcx1-bcadw2_scene_1_aaaaaa',
    ]);
  });

  it('sinks records with no usable timestamp to the bottom, in the order galgame had them', () => {
    const stamps = new Map([['dated', at('2026-08-01T10:00:00Z')]]);
    expect(sortSceneNamesByRecency(['rooftop', 'dated', 'classroom'], stamps))
      .toEqual(['dated', 'rooftop', 'classroom']);
  });

  it('leaves a library it knows nothing about exactly as galgame rendered it', () => {
    const rendered = ['classroom', 'rooftop', 'dormitory'];
    expect(sortSceneNamesByRecency(rendered, new Map())).toEqual(rendered);
  });

  it('keeps the rendered order for exact ties', () => {
    const same = at('2026-08-13T09:30:00Z');
    const stamps = new Map([['first', same], ['second', same], ['third', same]]);
    expect(sortSceneNamesByRecency(['first', 'second', 'third'], stamps))
      .toEqual(['first', 'second', 'third']);
  });

  it('ignores a stamp that is not a finite number (a hand-edited or malformed record)', () => {
    const stamps = new Map([['broken', NaN], ['good', at('2026-08-01T10:00:00Z')]]);
    expect(sortSceneNamesByRecency(['broken', 'good'], stamps)).toEqual(['good', 'broken']);
  });

  it('survives junk inputs rather than throwing inside a DOM patch', () => {
    expect(sortSceneNamesByRecency(null, null)).toEqual([]);
    expect(sortSceneNamesByRecency(['a'], null)).toEqual(['a']);
  });
});

describe('restatedCount', () => {
  it('rewrites the count in the translated line', () => {
    expect(restatedCount('55 background(s) saved', 12)).toBe('12 background(s) saved');
  });

  it('rewrites the count in galgame\'s untranslated line', () => {
    expect(restatedCount('已保存 55 个背景', 12)).toBe('已保存 12 个背景');
  });

  it('touches only the FIRST number — the hidden-title-background suffix keeps its own', () => {
    expect(restatedCount('已保存 55 个背景（已隐藏标题背景 2 项）', 54))
      .toBe('已保存 54 个背景（已隐藏标题背景 2 项）');
  });

  it('handles emptying the library', () => {
    expect(restatedCount('3 background(s) saved', 0)).toBe('0 background(s) saved');
  });

  it('returns a line it cannot model untouched instead of guessing', () => {
    expect(restatedCount('no digits here', 4)).toBe('no digits here');
    expect(restatedCount('5 saved', NaN)).toBe('5 saved');
    expect(restatedCount(null, 4)).toBe('');
  });
});
