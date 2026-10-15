// prompt-beat-strip-core unit tests — galgame's beat markup out of the past replies sent to the model.
//
// The failure this guards: deleting <p>/</p> alone turned `<p>A</p>\n<p>B</p>` into `A\nB`, the model copied
// that single-newline layout, and the shaper — which splits bare prose on blank lines only — wrapped a whole
// reply into one beat (galgame showed one packed paragraph). So every beat boundary must come out as exactly
// one blank line. Fixtures copy the SHAPE of real replies (named per case) with neutral text.
import { describe, it, expect } from 'vitest';
import {
  stripBeatMarkupForPrompt, stripChatCompletionPrompt, stripTextCompletionPrompt,
} from '../src/features/beat-shaper/prompt-beat-strip-core.js';
import { shapeMessage, sceneUid } from '../src/features/beat-shaper/beat-shaper-core.js';

const strip = (text) => stripBeatMarkupForPrompt(text).text;

// A rendered image block exactly as mvu-helper's imagegen REPLACE path writes it.
const img = (n) =>
  `<span class="auto-img-wrap" data-rawtag="&lt;pic char=&quot;Mitsuki&quot;&gt;"><img src="http://127.0.0.1:8000/img${n}.png" title="p${n}" alt="p${n}"><span class="auto-img-regen fa-solid fa-arrows-rotate" title="Regenerate image" role="button" tabindex="0" style="cursor:pointer;"></span></span>`;
const mint = () => () => sceneUid('k9f3x2', 'a1b2c3');

// Every closed beat's body, trimmed — what galgame would show as beats.
const beatsOf = (text) => [...text.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)].map((m) => m[1].trim());
// The paragraphs of the envelope's inner text (split on blank lines, trimmed, empty ones dropped).
const paragraphsOf = (text) => {
  const m = /<maintext>([\s\S]*?)<\/maintext>/i.exec(text);
  return (m ? m[1] : text).split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);
};

const CAPTION = '[ 🗓️ Date: 2026-04-12 (Sun) | 🕰️ Time: 16:10 | Weather: Clear ]\n📍 Location: Home_Room (the room)';
const TAIL = '\n\n<UpdateVariable>\n<JSONPatch>\n[\n  { "op": "replace", "path": "/World/Time/0", "value": "16:10" }\n]\n</JSONPatch>\n</UpdateVariable>\n\n<StatusPlaceHolderImpl/>';

// Shaped by the companion from blank-line prose (staging 310): a backdrop line on top, the caption as the first
// beat, the model's <content> opener riding inside the next beat, blank lines between beats, an image after.
const SHAPED_BLANK_LINE_PROSE = `<maintext>
<background scene="gck9f3x2-a1b2c3_scene_1_1abc" />
<p>${CAPTION}</p>

<p><content>
Wait.</p>

<p>The pan hissed.
— "Did I really cook this?"</p>

<p>Mana: "It smells fine."<smile></p>

${img(1)}
</maintext>${TAIL}`;

// Written by the model itself, one beat per line, single newlines between (staging 312/314) — the case that broke.
const MODEL_PER_LINE_BEATS = `<maintext>
<background scene="gck9f3x2-d4e5f6_scene_1_2xyz" />
<p>${CAPTION}</p>

<content>
<p>I folded my arms.</p>
<p>Me: "Should I keep the notes to myself, then?"<tease></p>
<p>Her grin froze.</p>
<p>Mana: "Ugh...!"<surprised></p>
<p>🎲 ✨ [Flirt] on Mana — DC 9, RawDie 20 +2 = 22 → CritSuccess</p>
${img(2)}
</maintext>${TAIL}`;

describe('stripBeatMarkupForPrompt — every beat boundary is one blank line (§2)', () => {
  const cases = [
    ['shaped blank-line prose keeps a beat\'s inner newline', '<p>a1\na2</p>\n\n<p>b</p>', 'a1\na2\n\nb'],
    ['model-written per-line beats (the case that broke)', '<content>\n<p>a</p>\n<p>b</p>', '<content>\n\na\n\nb'],
    ['no newline between beats', '<p>a</p><p>b</p>', 'a\n\nb'],
    ['a backdrop line between beats', '<p>a</p>\n<background scene="x" />\n<p>b</p>', 'a\n\nb'],
    ['an image wrap between beats stays whole, a blank line each side', `<p>a</p>\n${img(1)}\n<p>b</p>`, `a\n\n${img(1)}\n\nb`],
    ['an unrendered <pic> between beats', '<p>a</p>\n<pic char="Mana" prompt="x">\n<p>b</p>', 'a\n\n<pic char="Mana" prompt="x">\n\nb'],
    ['envelope tag lines also get a blank line (no tag-name special case)',
      '<maintext>\n<background scene="s" />\n<p>cap</p>\n\n<p>x</p>\n</maintext>', '<maintext>\n\ncap\n\nx\n\n</maintext>'],
    ['<content> inside the first beat stays with its text', '<p><content>\na</p>\n\n<p>b</p>', '<content>\na\n\nb'],
    ['galgame\'s TTS attribute form', '<p tts="v1">名: "你好"<微笑></p>', '名: "你好"<微笑>'],
    ['an English expression tag ending a line is not a container', '<p>Mana: "Hi"<smile></p>\n<p>Me: "Yo"<grin></p>', 'Mana: "Hi"<smile>\n\nMe: "Yo"<grin>'],
    ['an unclosed last beat (truncated reply)', '<p>a</p>\n<p>b', 'a\n\nb'],
    ['a full-width space opening a paragraph is the story\'s indentation', '<p>a</p>\n<p>　　b</p>', 'a\n\n　　b'],
    ['a tag at the very start or end keeps the outer whitespace as it was', '\n<p>a</p>\n', '\na\n'],
    ['a <p> inside a styled card is that card\'s HTML', '<p>a</p>\n<styled class="c"><p>card</p></styled>\n<p>b</p>', 'a\n\n<styled class="c"><p>card</p></styled>\n\nb'],
    ['a <p> inside the shaper\'s hidden block is left alone', '<p>a</p>\n<!--gc:hidden\n<p>x</p>\n-->\n<p>b</p>', 'a\n\n<!--gc:hidden\n<p>x</p>\n-->\n\nb'],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(strip(input)).toBe(expected);
    });
    it(`${name} — idempotent`, () => {
      expect(strip(strip(input))).toBe(strip(input));
    });
  }

  it('a reply with nothing to strip comes back as the identical string', () => {
    const plain = '<maintext>\nNo beats here.\n\nNone at all.  \n</maintext>\n';
    const result = stripBeatMarkupForPrompt(plain);
    expect(result.text).toBe(plain);
    expect(result.beatTags).toBe(0);
    expect(result.sceneLines).toBe(0);
  });

  it('a non-string passes through untouched', () => {
    expect(stripBeatMarkupForPrompt(undefined).text).toBeUndefined();
    expect(stripBeatMarkupForPrompt(null).text).toBeNull();
  });

  it('counts what it removed', () => {
    const result = stripBeatMarkupForPrompt(SHAPED_BLANK_LINE_PROSE);
    expect(result.beatTags).toBe(8);
    expect(result.sceneLines).toBe(1);
  });

  it('shaped blank-line prose: every beat is its own paragraph, the tail is byte-identical', () => {
    const out = strip(SHAPED_BLANK_LINE_PROSE);
    expect(out).not.toMatch(/<\/?p[\s>]|<background\b/i);
    expect(paragraphsOf(out)).toEqual([CAPTION, '<content>\nWait.', 'The pan hissed.\n— "Did I really cook this?"', 'Mana: "It smells fine."<smile>', img(1)]);
    expect(out.endsWith(`</maintext>${TAIL}`)).toBe(true);
  });

  it('model-written per-line beats: one paragraph per beat, never a single-newline run', () => {
    const out = strip(MODEL_PER_LINE_BEATS);
    expect(out).not.toMatch(/<\/?p[\s>]|<background\b/i);
    expect(paragraphsOf(out)).toEqual([
      CAPTION, '<content>', 'I folded my arms.', 'Me: "Should I keep the notes to myself, then?"<tease>', 'Her grin froze.',
      'Mana: "Ugh...!"<surprised>', '🎲 ✨ [Flirt] on Mana — DC 9, RawDie 20 +2 = 22 → CritSuccess', img(2),
    ]);
    expect(out.endsWith(`</maintext>${TAIL}`)).toBe(true);
  });
});

describe('round trip against the shaper (§4.2)', () => {
  it('shape then strip gives back the paragraphs of blank-line prose', () => {
    const raw = `<maintext>\n${CAPTION}\n\n<content>\nLine one.\nLine two.\n\nMana: "Hi."<smile>\n\n${img(1)}\n\nLast beat.\n</maintext>${TAIL}`;
    const shaped = shapeMessage(raw, mint()).text;
    expect(shaped).toMatch(/<p>/);
    expect(shaped).toMatch(/<background scene=/);
    expect(paragraphsOf(strip(shaped))).toEqual(paragraphsOf(raw));
  });

  // The direction that broke: the model copies the stripped layout, and the shaper must find the same beats in it.
  for (const [name, reply] of [['model-written per-line beats', MODEL_PER_LINE_BEATS], ['shaped blank-line prose', SHAPED_BLANK_LINE_PROSE]]) {
    it(`${name}: a reply written in the stripped layout shapes back into the same beats`, () => {
      const reshaped = shapeMessage(strip(reply), mint()).text;
      expect(beatsOf(reshaped)).toEqual(beatsOf(reply));
    });
  }
});

describe('stripChatCompletionPrompt — past replies only (§3.2)', () => {
  const RULE = '# Galgame 输出格式规范\n- 格式: `<p>角色名: "对话内容"<表情名></p>`\n<background scene="场景名" />';
  const build = () => [
    { role: 'system', content: RULE },
    { role: 'user', content: 'I wave. <p>not mine to touch</p>' },
    { role: 'assistant', content: MODEL_PER_LINE_BEATS },
    { role: 'assistant', content: [{ type: 'text', text: SHAPED_BLANK_LINE_PROSE }, { type: 'image_url', image_url: { url: 'data:x' } }] },
    { role: 'assistant', content: 'A reply with no markup.' },
  ];

  it('strips assistant entries in place and leaves system and user messages byte-identical', () => {
    const chat = build();
    const imagePart = chat[3].content[1];
    const stats = stripChatCompletionPrompt(chat);
    expect(chat[0].content).toBe(RULE);
    expect(chat[1].content).toBe('I wave. <p>not mine to touch</p>');
    expect(chat[2].content).toBe(strip(MODEL_PER_LINE_BEATS));
    expect(chat[3].content[0].text).toBe(strip(SHAPED_BLANK_LINE_PROSE));
    expect(chat[3].content[1]).toBe(imagePart);
    expect(chat[3].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:x' } });
    expect(chat[4].content).toBe('A reply with no markup.');
    expect(stats.replies).toBe(2);
    expect(stats.charsAfter).toBeLessThan(stats.charsBefore);
  });

  it('tolerates a missing or malformed list', () => {
    expect(stripChatCompletionPrompt(undefined).replies).toBe(0);
    expect(stripChatCompletionPrompt([null, { role: 'assistant' }, { role: 'assistant', content: 42 }]).replies).toBe(0);
  });
});

describe('stripTextCompletionPrompt — non-injected history items only (§3.3)', () => {
  const build = (api) => ({
    api,
    finalMesSend: [
      { message: 'User: hello\n', extensionPrompts: [] },
      { message: `Assistant: ${MODEL_PER_LINE_BEATS}\n`, extensionPrompts: ['<p>cfg example</p>\n'] },
      { message: '# Galgame 输出格式规范\n`<p>角色名: "对话内容"<表情名></p>`\n', extensionPrompts: [], injected: true },
    ],
  });

  it('strips history messages and leaves extensionPrompts and injected items byte-identical', () => {
    const data = build('textgenerationwebui');
    const stats = stripTextCompletionPrompt(data);
    expect(data.finalMesSend[0].message).toBe('User: hello\n');
    expect(data.finalMesSend[1].message).toBe(strip(`Assistant: ${MODEL_PER_LINE_BEATS}\n`));
    expect(data.finalMesSend[1].extensionPrompts).toEqual(['<p>cfg example</p>\n']);
    expect(data.finalMesSend[2].message).toBe('# Galgame 输出格式规范\n`<p>角色名: "对话内容"<表情名></p>`\n');
    expect(stats.replies).toBe(1);
  });

  it('leaves chat completion\'s copy of this path alone (api "openai")', () => {
    const data = build('openai');
    const before = structuredClone(data);
    expect(stripTextCompletionPrompt(data)).toBeNull();
    expect(data).toEqual(before);
  });

  it('tolerates missing data', () => {
    expect(stripTextCompletionPrompt(undefined)).toBeNull();
    expect(stripTextCompletionPrompt({ api: 'kobold' })).toBeNull();
  });
});
