// galgame-companion · format-rule-trim-core — PURE decision: cut the parts of galgame's format rule that push
// a narrator into short replies, so the reply length comes from the card's own preset.
//
// galgame writes its output format rule into the worldbook entry `Galgame输出格式规范` (world
// `galgame界面插件`, upstream src/logic/cot-template.js). Without TTS, two parts of it read as a length rule
// for the WHOLE reply, and a narrator plans its length off them instead of off the preset:
//   • `- 每段字数: 不大于70字` under `## 输出格式要求` — a per-paragraph cap taken as a total cap
//   • `## 输出结构示例` — a sample reply seven short lines long
// Measured on one turn, one model: ST mode 1701 characters of prose; galgame mode 507; the cap cut alone
// 806; both cuts 1269, with the preset's length back in the narrator's plan.
// The cuts take the cap line, the `## 输出格式要求` heading once it is left empty, and the sample section up
// to the next `## ` heading. The tag rules and `## 重要提醒` stay whole.
//
// With TTS on, galgame writes a different cap (`- 每个<p></p>的字数: 25-70字`) and its own sample — a
// reply read aloud has to stay short, so a TTS rule is left exactly as galgame wrote it.

export const GALGAME_FORMAT_WORLD = 'galgame界面插件';
export const GALGAME_FORMAT_ENTRY = 'Galgame输出格式规范';

const PARAGRAPH_CAP_LINE = /^- 每段字数: 不大于\d+字[ \t]*(?:\r?\n|$)/m;
const EMPTY_FORMAT_HEADING = /^## 输出格式要求[ \t]*\r?\n(?:[ \t]*\r?\n)+(?=## )/m;
const SAMPLE_SECTION = /^## 输出结构示例[ \t]*\r?\n[\s\S]*?(?=^## )/m;
const TTS_PARAGRAPH_CAP_LINE = /^- 每个<p><\/p>的字数: /m;

// Is this loaded worldbook entry galgame's format rule? Entries arrive from ST with `world` (the book)
// and `comment` (the entry's name).
export function isGalgameFormatEntry(entry) {
  return Boolean(entry) && entry.world === GALGAME_FORMAT_WORLD && entry.comment === GALGAME_FORMAT_ENTRY;
}

// The rule's text → { content, isTts, cut, missing }.
//   isTts   — the rule is galgame's TTS rule; `content` is unchanged on purpose
//   cut     — what was removed: 'cap', 'empty-heading', 'sample'
//   missing — which of the two length parts ('cap', 'sample') a non-TTS rule no longer carries, i.e.
//             galgame reworded that part and whatever replaced it reaches the prompt
export function trimFormatRule(rule) {
  let content = String(rule == null ? '' : rule);
  if (TTS_PARAGRAPH_CAP_LINE.test(content)) return { content, isTts: true, cut: [], missing: [] };
  const cut = [];
  const missing = [];
  if (PARAGRAPH_CAP_LINE.test(content)) { content = content.replace(PARAGRAPH_CAP_LINE, ''); cut.push('cap'); }
  else missing.push('cap');
  if (EMPTY_FORMAT_HEADING.test(content)) { content = content.replace(EMPTY_FORMAT_HEADING, ''); cut.push('empty-heading'); }
  if (SAMPLE_SECTION.test(content)) { content = content.replace(SAMPLE_SECTION, ''); cut.push('sample'); }
  else missing.push('sample');
  return { content, isTts: false, cut, missing };
}
