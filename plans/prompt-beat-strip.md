# Plan — past replies reach the model without galgame's beat markup

Status: **v0.2 (2026-10-15) · proposed, nothing built** · Owner: KritBlade · Ships as galgame-companion **v0.9.17**

galgame builds its display beats from closed `<p>…</p>` tags and binds backdrops with
`<background scene="…" />` lines, and it reads both from the **saved** reply. So every saved reply
carries them, and SillyTavern sends them back to the model with every past reply in the prompt. This
plan removes that markup from the **outgoing prompt only** and leaves one blank line wherever a beat
boundary stood. The saved reply, SillyTavern's own view and galgame's GUI do not change.

**The three goals (the user's, 2026-10-15):**
1. **An edit made in SillyTavern shows in galgame's GUI.** The saved reply stays the one copy galgame
   reads: no second stored copy (galgame's enhanced-mode record in `message.extra`), no second model call.
2. **`<p>` / `</p>` are removed only from what goes to the model.** The companion's `<background scene>`
   lines go with them.
3. **In that outgoing text, every former beat boundary is exactly one blank line.**

**This version (v0.2):** the user's rulings of 2026-10-15 are applied:
- **Text completion is covered** by a second hook (§3.3).
- **A swiped reply that ignores edits** is checked live, then fixed by a `galgame-quirks` patch if
  confirmed (§6).
- **The enhanced-mode warning is dropped.** The companion never turns galgame's enhanced mode on.

The plan replaces `mvu-helper/plans/executed/history-markup-strip.md` (School pack 5.139.0
`PromptDeTagBeat` regex). That regex was rolled back uncommitted on 2026-10-15, because it deleted beat
boundaries instead of turning them into blank lines (§1).

---

## Tracking

| # | Item | Status | Verified by |
|---|---|---|---|
| 1 | `stripBeatMarkupForPrompt()` pure core (§3.1) | not started | vitest: every case in §4.1, the round trip §4.2, idempotence |
| 2 | Chat-completion hook on `CHAT_COMPLETION_PROMPT_READY` (§3.2) | not started | a dry-run capture on the local tab: 0 `<p>`/`</p>`/`<background>` in assistant messages, system messages byte-identical |
| 3 | Text-completion hook on `GENERATE_BEFORE_COMBINE_PROMPTS` (§3.3) | not started | vitest on the event payload; live only if a text-completion connection is available (§5.4) |
| 4 | Mutation run (§4.3) | not started | each rule broken on purpose fails a test; file restored byte-identical |
| 5 | Local A/B (§5.1) | not started | tokens of the same past replies before/after; whole-prompt size; no visible character lost |
| 6 | One real turn on the local test chat (§5.2) | not started | reply shaped as before, galgame shows its beats, a Continue appends cleanly |
| 7 | Goal 1, single-swipe edit (§5.3) | not started | edit a reply in ST → galgame GUI shows the edit, no second model call |
| 8 | Goal 1, swiped reply ignores edits — live check (§6) | unverified | edit the current swipe of a reply with 2+ swipes; watch which swipe galgame shows |
| 9 | `galgame-quirks` patch for #8 (§6) | only if #8 confirms it | the same live check passes |
| 10 | Release v0.9.17 (§8) | not started | jsDelivr serves `@v0.9.17`; the page logs `v0.9.17` |
| 11 | Retire `mvu-helper/plans/executed/history-markup-strip.md` | needs the user's ruling (delete, or rewrite its top as dropped) | — |

---

## 1. Why, and why here

**What the School regex got wrong.** `PromptDeTagBeat` (prompt-only, AI output) deleted every `<p>` and
`</p>`. That is harmless where beats are already separated by a blank line (`</p>\n\n<p>`), which was
every reply in the local A/B. It is not harmless where the model wrote **one `<p>` per line** with a
single newline between them, as it does whenever galgame's format rule is in the prompt (staging
msgs 312 and 314). There `<p>A</p>\n<p>B</p>` reached the model as `A\nB`. On staging msg 316 the
format rule was absent. The model copied the single-newline layout it saw, with no `<p>`. The shaper
splits bare prose only on blank lines (`wrapFreeRun`, `beat-shaper-core.js`), so the whole story
became one beat. galgame showed one packed paragraph, with `<平靜>`-style expression tags as text.

**What it saves.**
- Local tab, no VectFox, 200k context: the same 69 past replies went from 97,264 to 82,324 tokens
  (−15.4%) with the regex version.
- Staging with VectFox: only the last 2 replies go to the model word for word, so it saves about 590
  of 164,853 characters (≈0.4%).
- Not every mvu-helper user runs VectFox, so the strip is worth having.

**Why the companion owns it.**
- `<p>` and `<background scene>` exist only for galgame's display.
- The companion's shaper writes them. galgame's format rule teaches the model to write them too.
- Taking them out of the prompt is the other half of the same feature:
  - every card that uses the companion gets it;
  - nothing is written into the user's regex list or the card;
  - it goes away with the companion;
  - one test can check the shaper against its own undo (§4.2).

**Alternatives ruled out.**
- **A prompt-only regex (any owner):** it runs before ST counts tokens, so when the budget is full the
  prompt does not shrink; ST fills the room with older replies instead. Its fixed patterns also miss
  seams with an image between two beats. From the companion it would also mean writing regexes into
  each user's ST settings.
- **galgame's enhanced mode** (stores a formatted copy in `message.extra.galgame_enhanced_format`):
  - it costs a second model call per reply;
  - its stored copy shadows the saved reply, so edits do not show until it re-formats;
  - it drops its copy whenever another write lands during the format. That happened live twice on
    2026-10-15, on staging msg 316 and on local msg 2.
  It breaks goal 1.
- **Keeping `<p>` out of the saved reply:** galgame cannot display a reply without them, and the model
  keeps writing them as long as past replies or galgame's format rule show them.

## 2. Behaviour (the contract)

`stripBeatMarkupForPrompt(text)` takes one past reply as it is about to be sent and returns:

1. Every `<p>` / `<p …>` (any attributes, e.g. galgame's TTS `<p tts="…">`) and every `</p>` is gone.
2. Every `<background …/>` tag is gone with its line. This is the shaper's own pattern,
   `RE_BACKGROUND_TAG`.
3. **Each beat becomes its own paragraph.** Inside the envelope, a beat's text is separated from the
   next content (another beat, an image tag, a roll line, a following block) by **exactly one blank
   line**. That holds whatever stood there before: no whitespace, one newline, several, or a backdrop
   line.
4. **Envelope edges keep their newline.** Right after the opening tag line (`<maintext>`, `<content>`)
   and right before the closing one, the original single newline stays. No blank line is added there.
5. Nothing else changes:
   - the text inside a beat is byte-identical, single newlines included;
   - every other tag and block is untouched (`<UpdateVariable>`, `<combat_log>`, `<pic>`, image wraps,
     `<!--gc:hidden … -->`).
6. A reply with no `<p>` and no `<background>` comes back **identical** (same string).
7. **Idempotent:** stripping twice gives the same text as stripping once.

The hooks apply it to past replies only:
- **Chat completion:** `role: 'assistant'` messages.
- **Text completion:** non-injected history items.

**Injected and system prompts are never touched.** galgame's format rule arrives as one of them (a
system message, or an injected item in text completion), and its `<p>` examples must reach the model
intact.

## 3. Implementation

### 3.1 Pure core — `src/features/beat-shaper/prompt-beat-strip-core.js`

- Exports `stripBeatMarkupForPrompt(text) → { text, beatTags, sceneLines }`. The counts are for the log
  line.
- Lives in `beat-shaper/` because it undoes exactly the markup this feature defines. It imports
  `RE_BACKGROUND_TAG` and the beat pattern from `beat-shaper-core.js` (exported for this), so the
  strip can never drift from what the shaper writes.
- It is not added to the 1,033-line core file.
- Takes a string. A multimodal message (`content` as an array of parts) is handled by the hook (§3.2),
  which strips each `type: 'text'` part.

### 3.2 Hook — `src/features/beat-shaper/prompt-beat-strip.js`

This copies `galgame-quirks/format-rule-trim.js`, the companion's existing edit that applies to one
prompt build only.

- `startPromptBeatStrip()`:
  - If `window.eventOn` and `tavern_events.CHAT_COMPLETION_PROMPT_READY` are present, it registers
    `onPromptReady`.
  - Otherwise it calls `log.warn('prompt-beat-strip: … — past replies reach the model with galgame's
    beat markup')` and returns.
  - It is exported through the `beat-shaper/index.js` barrel and started in `src/app/index.js` next to
    `startBeatShaper()`.
- `onPromptReady({ chat, dryRun })`:
  - For each entry with `role === 'assistant'`, it replaces `content` (or each text part) with the
    stripped text.
  - ST emits this event with the exact list it sends (`SillyTavern/public/scripts/openai.js:1618-1619`),
    so the change is outgoing-only; `message.mes` is never written.
  - mvu-helper already rewrites outgoing history the same way (image context-swap,
    `mvu-helper/src/features/imagegen/image-gen.js:741-757`).
- **No galgame gate.** Old replies keep their `<p>` even if galgame is removed later, and stripping them
  is still right.
- **Dry runs are stripped too**, since the transform is pure and holds no state, but they are not
  logged.
- **Log:** one `log.info` line per real send, e.g.
  `prompt-beat-strip: 37 past replies · 412 beat tags + 9 backdrop lines removed · 52,140 → 47,610 chars`.
  It is not logged when there was nothing to strip.
- **Listener order:** mvu-helper is an ST extension, so its context-swap listener registers before this
  TavernHelper script. By the time the strip runs, rendered image wraps are already `<pic …>` tags. The
  core handles both forms anyway (§4.1).

### 3.3 Text-completion hook — same file, `onBeforeCombine(data)`

Text-completion APIs (KoboldCpp, text-generation-webui, NovelAI, …) never fire
`CHAT_COMPLETION_PROMPT_READY`; ST builds one flat string instead. The hook point is the event fired just
before ST flattens it:

- ST emits `GENERATE_BEFORE_COMBINE_PROMPTS` with `data.finalMesSend`
  (`SillyTavern/public/script.js:5234`). That is the list of chat-history items for this build, a
  `structuredClone` of the history (`script.js:5145`), so writing to it never touches the saved chat.
- After the event, ST builds the prompt string from **that same array** (`combine()`, `script.js:5184`,
  called at `5237`). So stripping `item.message` in place changes what is sent.
- **Which items:** history items carry no role, but only past replies contain `<p>`. The strip touches
  only `item.message`, never `item.extensionPrompts`, and skips items with `item.injected === true`. In
  text completion, depth injections (galgame's format rule is a world-info entry at depth 0) ride in
  exactly those two places, so the rule's `<p>` examples stay intact.
- **Skip when `data.api === 'openai'`.** ST runs this path for chat completion too, but ignores the
  string it produces; §3.2 covers that API.
- **Same token consequence as §3.2:** ST counted the history before this event, so the prompt gets
  smaller and nothing older is refilled.

**Without this hook**, a text-completion user would simply get today's behaviour: `<p>` stays in the
history the model sees, and nothing breaks. The display and the saved replies are the same either way.

## 4. Tests — `tests/prompt-beat-strip-core.test.js`

**Fixtures copy the SHAPE of real replies with neutral text.** The repo is public, and the real replies
are the user's chat. Each fixture names the reply whose shape it copies.

### 4.1 Cases

| Case | Input shape (source) | Expected |
|---|---|---|
| Shaped blank-line prose | `<p>a1\na2</p>\n\n<p>b</p>` (staging 310) | `a1\na2\n\nb` — inner newline kept |
| Model-written per-line beats | `<content>\n<p>a</p>\n<p>b</p>` (staging 312/314) | `<content>\na\n\nb` — **the case that broke** |
| No newline between beats | `<p>a</p><p>b</p>` | `a\n\nb` |
| Backdrop between beats | `<p>a</p>\n<background scene="x" />\n<p>b</p>` | `a\n\nb` |
| Image wrap / `<pic>` between beats | `<p>a</p>\n<span class="auto-img-wrap"…>…</span></span>\n<p>b</p>`, and the `<pic …>` form | `a\n\n<image>\n\nb`, image text untouched |
| Envelope edges | `<maintext>\n<background …/>\n<p>[ 🗓️ Date…]\n📍 …</p>\n\n<p>x</p>\n</maintext>` | `<maintext>\n[ 🗓️ Date…]\n📍 …\n\nx\n</maintext>` |
| `<content>` inside the first beat | `<p><content>\na</p>\n\n<p>b</p>` (staging 310) | `<content>\na\n\nb` |
| TTS attribute form | `<p tts="v1">名: "…"<微笑></p>` | `名: "…"<微笑>` |
| Unclosed last beat (truncated reply) | `<p>a</p>\n<p>b` | `a\n\nb` |
| Nothing to strip | a reply with no `<p>` / `<background>` | the identical string |
| Blocks after the envelope | `</maintext>\n\n<UpdateVariable>…` | byte-identical tail |
| Idempotence | every case above | `strip(strip(x)) === strip(x)` |

The hooks get their own small tests:
- **Chat completion**, with an injected `chat` array: assistant entries are stripped, system and user
  entries are untouched, and text parts of a multimodal entry are stripped while image parts are kept.
- **Text completion**, with an injected `data`:
  - `finalMesSend[i].message` is stripped;
  - `extensionPrompts` and `injected` items are byte-identical;
  - `data.api === 'openai'` leaves everything untouched.

### 4.2 Round trip against the shaper

For raw replies written as blank-line paragraphs, `stripBeatMarkupForPrompt(shapeMessage(raw).text)`
must give back the same list of prose paragraphs (split on blank lines, trimmed) as `raw`. This test
catches the class of bug in §1 where it starts: any shape the shaper can produce must undo to separated
paragraphs.

### 4.3 Mutations

Break each rule once, confirm a test fails, and restore the file byte for byte:
1. Seam to empty instead of a blank line.
2. `<p …>` attributes not matched.
3. Backdrop line left in.
4. A system message stripped.
5. Edge newline doubled.
6. Inner single newline collapsed.
7. Identity case returns a new string with changes.

## 5. Live checks (local tab, test chat)

**5.1 A/B.** Use dry runs only: `ctx.generate('normal', {}, true)` with a temporary
`CHAT_COMPLETION_PROMPT_READY` listener registered **after** the strip, so it reads the stripped list.
Compare against a capture with the strip disabled. Report:
- tokens of the same past replies, before and after;
- the whole-prompt size (it should drop by about that much, since ST does not refill after this event);
- 0 visible characters lost;
- system messages identical.

**5.2 One real turn.**
- The sent prompt has 0 `<p>` in past replies, with a blank line at every former boundary.
- The new reply is shaped as before and galgame shows its beats.
- Then press Continue once: the continuation appends to the saved reply, and the shaper re-wraps it on
  `MESSAGE_UPDATED`.

**5.3 Goal 1, single swipe** (companion on, galgame enhanced mode off):
- Edit a sentence, add a paragraph and delete a `<p>` in a reply, then save.
- ST emits `MESSAGE_EDITED` then `MESSAGE_UPDATED` (`SillyTavern/public/script.js:8405, 8431`). The
  shaper re-shapes on `MESSAGE_UPDATED`, and galgame re-reads when the message's DOM changes (its
  content observer, `galgame/src/logic/message-observer.js`).
- Expected: the GUI shows the edit and no second generation runs. This should already hold today. It is
  verified here because goal 1 rests on it.

**5.4 Text completion.** This needs a text-completion connection selected in ST.
- Run a dry run and read the flattened prompt with a temporary `GENERATE_AFTER_COMBINE_PROMPTS`
  listener (`script.js:5242-5244`).
- Expected: 0 `<p>` in past replies, and galgame's format rule (when attached) still carries its
  examples.
- If no text-completion backend is available, item 3 stays verified by vitest only, and the plan says so.

## 6. Swiped replies may ignore edits (live check, then a `galgame-quirks` patch)

**The suspicion:**
- galgame's reader `getFormattedSwipeContent` (`galgame/src/utils/html.js:74-89`) returns the
  **first** swipe that carries galgame tags (`<p`, `<maintext`, `<background`, …), not the current one.
- TavernHelper's `getChatMessages(…, { include_swipes: true })` returns every swipe
  (`JS-Slash-Runner/src/function/chat_message.ts:121-139`).
- The shaper tags every swipe, so on a reply with 2+ swipes galgame may keep showing swipe 0. An edit
  to the current swipe would then never appear, which breaks goal 1.

**Live check (item 8):**
1. Swipe a reply on the local test chat.
2. Edit the current swipe.
3. Read which swipe galgame displays.
4. Repeat after switching back to swipe 0.

**Fix route (ruled 2026-10-15):** a `galgame-quirks` patch in the companion, joining the other galgame
workarounds there (`galgame-quirks/index.js`). Its exact hook is designed once the live check shows the
real behaviour: which galgame entry point it has to correct, and whether galgame re-reads on a swipe at
all. Nothing is built on the suspicion alone.

## 7. Known limits

- **Both hooks run after ST counts tokens** (chat completion: `openai.js:1623` returns counts taken
  earlier; text completion: the history was trimmed to budget before `getCombinedPrompt`). ST's token
  display overstates what is sent, and the freed room is not refilled with older replies. The prompt
  simply gets smaller.
- **Text completion with "Collapse consecutive newlines" on** (`power_user.collapse_newlines`,
  `script.js:5199-5201`): ST squashes every blank line in the flattened prompt to a single newline,
  the blank lines this strip leaves included. That user setting flattens the model's own paragraphs the
  same way. The companion does not override it.
- **The model may still write `<p>` itself** when galgame's format rule is in the prompt (galgame mode
  on, enhanced mode off). That is expected: the shaper handles either form, and the next prompt strips
  them again.

## 8. Release

1. `npm test` green and `npm run build` clean.
2. Bump `package.json` to `0.9.17`. Pin `@v0.9.17` in `README.md`'s install line and in
   `galgame-companion.import.json`.
3. Add the feature to `README.md`'s capability list, in the beat-shaper item.
4. Commit with `dist/` included (`git add -A`), tag `v0.9.17`, push the commit **and** the tag.
5. Prove it: the jsDelivr URL serves the tagged build, and the live page logs `v0.9.17`.
