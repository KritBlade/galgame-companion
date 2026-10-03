// format-rule-trim-core unit tests — galgame's format rule, trimmed of what shortens replies.
//
// Without TTS, galgame's rule carries a per-paragraph cap (`- 每段字数: 不大于70字`) and a seven-line sample
// reply (`## 输出结构示例`), and narrators read both as a length rule for the whole reply: one turn came
// back at 507 characters where ST mode wrote 1701. Cutting both brought it to 1269 with the preset's
// length back in the narrator's plan. A TTS rule is left whole, because a reply read aloud has to stay short.
import { describe, it, expect } from 'vitest';
import { trimFormatRule, isGalgameFormatEntry, GALGAME_FORMAT_WORLD, GALGAME_FORMAT_ENTRY } from '../src/features/galgame-quirks/format-rule-trim-core.js';

// galgame's non-TTS rule, in the section order it writes (sections shortened).
const RULE = [
  '# Galgame 输出格式规范',
  '',
  '本角色卡配合专用前端面板，输出将被解析为Galgame视觉小说界面。',
  '',
  '## 输出格式要求',
  '- 每段字数: 不大于70字',
  '',
  '',
  '## 标签系统',
  '',
  '### 对话格式（含表情）',
  '- 格式: `<p>角色名: "对话内容"<表情名></p>`',
  '',
  '## 输出结构示例',
  '```',
  '<maintext>',
  '  <p>第一句旁白描述。</p>',
  '  <p>角色名: "这是角色的对话内容。"<微笑></p>',
  '</maintext>',
  '```',
  '',
  '## 重要提醒',
  '1. 角色说话时必须使用格式: `角色名: "对话内容"<表情名>`',
].join('\n');

const TRIMMED = [
  '# Galgame 输出格式规范',
  '',
  '本角色卡配合专用前端面板，输出将被解析为Galgame视觉小说界面。',
  '',
  '## 标签系统',
  '',
  '### 对话格式（含表情）',
  '- 格式: `<p>角色名: "对话内容"<表情名></p>`',
  '',
  '## 重要提醒',
  '1. 角色说话时必须使用格式: `角色名: "对话内容"<表情名>`',
].join('\n');

const TTS_RULE = [
  '# Galgame 输出格式规范',
  '',
  '## 输出格式要求',
  '- 每个<p></p>的字数: 25-70字',
  '',
  '## 输出结构示例',
  '<maintext>',
  '  <p>少女[微笑,女声]: "你终于来了～"</p>',
  '</maintext>',
  '',
  '## 重要提醒',
].join('\n');

describe('trimFormatRule', () => {
  it('MUTATION TARGET — the cap, its emptied heading and the sample reply go; everything else stays as written', () => {
    expect(trimFormatRule(RULE)).toEqual({ content: TRIMMED, isTts: false, cut: ['cap', 'empty-heading', 'sample'], missing: [] });
  });

  it('MUTATION TARGET — the sample goes even with no cap above it, and the cap is reported missing', () => {
    const noCap = RULE.replace('- 每段字数: 不大于70字\n', '');
    const result = trimFormatRule(noCap);
    expect(result.content).not.toMatch(/输出结构示例/);
    expect(result.missing).toEqual(['cap']);
  });

  it('MUTATION TARGET — a heading that still holds a rule keeps it', () => {
    const kept = RULE.replace('- 每段字数: 不大于70字', '- 每段字数: 不大于70字\n- 对话单独成段');
    const result = trimFormatRule(kept);
    expect(result.content).toContain('## 输出格式要求\n- 对话单独成段');
    expect(result.cut).toEqual(['cap', 'sample']);
  });

  it('a cap at another number is the same line and goes too', () => {
    expect(trimFormatRule(RULE.replace('70', '120')).cut).toContain('cap');
  });

  it('MUTATION TARGET — a TTS rule is left exactly as galgame wrote it, sample included', () => {
    expect(trimFormatRule(TTS_RULE)).toEqual({ content: TTS_RULE, isTts: true, cut: [], missing: [] });
  });

  it('MUTATION TARGET — a rule galgame reworded is left whole and both parts are reported missing', () => {
    const reworded = '# Galgame 输出格式规范\n\n## 标签系统\n- 格式: `<p>…</p>`\n';
    expect(trimFormatRule(reworded)).toEqual({ content: reworded, isTts: false, cut: [], missing: ['cap', 'sample'] });
  });

  it('an absent rule is reported missing, never a throw', () => {
    expect(trimFormatRule(undefined)).toEqual({ content: '', isTts: false, cut: [], missing: ['cap', 'sample'] });
  });
});

describe('isGalgameFormatEntry', () => {
  it('MUTATION TARGET — galgame\'s format entry is found by its book and its name', () => {
    expect(isGalgameFormatEntry({ world: GALGAME_FORMAT_WORLD, comment: GALGAME_FORMAT_ENTRY })).toBe(true);
  });

  it('an entry of that name in another book is not galgame\'s', () => {
    expect(isGalgameFormatEntry({ world: 'ArtificKoi', comment: GALGAME_FORMAT_ENTRY })).toBe(false);
  });

  it('another entry in galgame\'s book is left alone', () => {
    expect(isGalgameFormatEntry({ world: GALGAME_FORMAT_WORLD, comment: 'something else' })).toBe(false);
  });

  it('a missing entry is not galgame\'s', () => {
    expect(isGalgameFormatEntry(null)).toBe(false);
  });
});
