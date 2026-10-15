# Plan — past replies reach the model without galgame's beat markup

Status: **v0.3 (2026-10-15) · released as galgame-companion v0.9.17 · the swipe patch (#9) awaits a ruling** · Owner: KritBlade

galgame builds its display beats from closed `<p>…</p>` tags and binds backdrops with
`<background scene="…" />` lines, and it reads both from the **saved** reply. So every saved reply
carries them, and SillyTavern sends them back to the model with every past reply in the prompt. This
feature removes that markup from the **outgoing prompt only** and leaves one blank line wherever a beat
boundary stood. The saved reply, SillyTavern's own view and galgame's GUI do not change.

**The three goals (the user's, 2026-10-15):**
1. **An edit made in SillyTavern shows in galgame's GUI.** The saved reply stays the one copy galgame
   reads: no second stored copy (galgame's enhanced-mode record in `message.extra`), no second model call.
2. **`<p>` / `</p>` are removed only from what goes to the model.** The companion's `<background scene>`
   lines go with them.
3. **In that outgoing text, every former beat boundary is exactly one blank line.**

**This version (v0.3):**
- **The strip is built and live-checked** for chat completion: 38 past replies sent with no beat markup,
  −16.5% of their tokens (§5). Text completion is covered by vitest only.
- **One deviation from v0.2: no envelope special case** (§2 rule 4). A boundary next to `<maintext>`
  also becomes a blank line, because telling a container tag from an English expression tag would
  need tag names or a guess.
- **The swipe bug is confirmed live** (§6). The only safe companion-side patch wraps a function inside
  galgame's own frame, so it waits for the user's ruling.

---

## Tracking

| # | Item | Status | Verified by |
|---|---|---|---|
| 1 | Pure core `prompt-beat-strip-core.js` (§3.1) | done | vitest: 43 tests (every case in §4.1, both round trips §4.2, idempotence, both hooks) |
| 2 | Chat-completion hook on `CHAT_COMPLETION_PROMPT_READY` (§3.2) | done | local dry run and one real turn: 0 markup in 38 past replies; every reply equals the core applied to the pre-strip capture; no other message changed |
| 3 | Text-completion hook on `GENERATE_BEFORE_COMBINE_PROMPTS` (§3.3) | done — vitest only | no text-completion connection on the local tab (§5.4) |
| 4 | Mutation run (§4.3) | done | 11/11 caught; file restored byte-identical |
| 5 | Local A/B (§5.1) | done | past replies 52,188 → 43,583 tokens (−16.5%); whole prompt −8,605 (−6.2%); 0 visible characters lost |
| 6 | One real turn + Continue (§5.2) | done | reply shaped into 56 beats, none glued by a single newline; Continue checked by dry run |
| 7 | Goal 1, edit shows in galgame (§5.3) | done for a single-swipe latest reply; swiped replies wait on #9 | msg 212 (one swipe): an edit through ST appeared in galgame's view, and so did its revert; no second model call |
| 8 | Swiped reply shows the wrong swipe (§6) | confirmed live | msg 212: ST on swipe 1, galgame displayed swipe 0 |
| 9 | `galgame-quirks` patch for #8 (§6) | needs the user's ruling on the design | — |
| 10 | Release v0.9.17 (§8) | done | jsDelivr serves `@v0.9.17` with the same `VERSION` and `BUILD` as the local bundle |

---

## 1. Why, and why here

**What the School regex got wrong.** `PromptDeTagBeat` (prompt-only, AI output) deleted every `<p>` and
`</p>`. That is harmless where beats are already separated by a blank line (`</p>\n\n<p>`). It is not
harmless where the model wrote **one `<p>` per line** with a single newline between them, as it does
whenever galgame's format rule is in the prompt (staging msgs 312 and 314). There `<p>A</p>\n<p>B</p>`
reached the model as `A\nB`. On staging msg 316 the format rule was absent. The model copied the
single-newline layout it saw, with no `<p>`. The shaper splits bare prose only on blank lines
(`wrapFreeRun`, `beat-shaper-core.js`), so the whole story became one beat. galgame showed one packed
paragraph, with `<平靜>`-style expression tags as text.

**What it saves** (§5.1):
- Local tab, no VectFox: the 38 past replies in the prompt went from 52,188 to 43,583 tokens (−16.5%).
  The whole prompt dropped by the same 8,605 tokens (−6.2%), because ST does not refill after the hook.
- Staging with VectFox: only the last 2 replies go to the model word for word, so the saving there is
  small (≈590 of 164,853 characters).
- Not every mvu-helper user runs VectFox, so the strip is worth having.

**Why the companion owns it.**
- `<p>` and `<background scene>` exist only for galgame's display.
- The companion's shaper writes them. galgame's format rule teaches the model to write them too.
- Taking them out of the prompt is the other half of the same feature:
  - every card that uses the companion gets it;
  - nothing is written into the user's regex list or the card;
  - it goes away with the companion;
  - one test checks the shaper against its own undo (§4.2).

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
3. **Each beat becomes its own paragraph.** A seam is a run of beat tags and the ASCII whitespace around
   them. Between two pieces of content it becomes **exactly one blank line**, whatever stood there: no
   whitespace, one newline, several, or a backdrop line. "Content" includes an image, a `<pic>`, a roll
   line and the envelope's own tag lines.
4. **No envelope special case.** A boundary next to `<maintext>` or `</maintext>` also becomes a blank
   line. Only a tag at the very start or end of the text, with no neighbour on one side, simply goes,
   keeping the whitespace that was there. Why not keep a single newline at the envelope:
   - telling a container tag from an inline one needs either tag names (`<content>` is a preset's,
     not the companion's) or a shape guess;
   - an English expression tag ending a dialogue line (`"Hi"<smile>`) looks exactly like a container
     opening, so the guess would glue beats again;
   - the cost is two newline characters per reply.
5. Nothing else changes:
   - the text inside a beat is byte-identical, single newlines included. A seam takes only ASCII
     whitespace, so a full-width space opening a paragraph stays as indentation;
   - machinery blocks are never edited inside: an image wrap, a `<pic>`, a `<styled>` card, galgame's
     popups, `<option>`, `<bgm>`, and the shaper's `<!--gc:hidden … -->`. A `<p>` in there is the
     block's own HTML. The list is beat-shaper-core's `MACHINERY_BLOCK_SOURCE`, the same list the shaper's
     `<p>`-wrap protects.
6. A reply with no `<p>` and no `<background>` comes back **identical** (same string).
7. **Idempotent:** stripping twice gives the same text as stripping once.

The hooks apply it to past replies only:
- **Chat completion:** `role: 'assistant'` messages, and each `type: 'text'` part of a multimodal one.
- **Text completion:** non-injected history items.

**Injected and system prompts are never touched.** galgame's format rule arrives as one of them (a
system message, or an injected item in text completion), and its `<p>` examples must reach the model
intact.

## 3. Implementation

### 3.1 Pure core — `src/features/beat-shaper/prompt-beat-strip-core.js`

- `stripBeatMarkupForPrompt(text) → { text, beatTags, sceneLines }`.
- `stripChatCompletionPrompt(chat)` and `stripTextCompletionPrompt(data)` carry the decisions of which
  entries are past replies (role, `injected`, `api === 'openai'`). They edit in place and return
  `{ replies, beatTags, sceneLines, charsBefore, charsAfter }`. `stripTextCompletionPrompt` returns
  `null` for chat completion. Keeping those decisions in the core makes them testable.
- It lives in `beat-shaper/` because it undoes exactly the markup this feature defines.
  `beat-shaper-core.js` exports `RE_BACKGROUND_TAG` and `MACHINERY_BLOCK_SOURCE` for it, so the strip
  cannot drift from what the shaper writes and protects. Its `<p>`-wrap regex is built from the same
  list, unchanged.

### 3.2 Hooks — `src/features/beat-shaper/prompt-beat-strip.js`

This copies `galgame-quirks/format-rule-trim.js`, the companion's existing edit that applies to one
prompt build only.

- `startPromptBeatStrip()`, started in `src/app/index.js` right after `startBeatShaper()`, registers:
  - `CHAT_COMPLETION_PROMPT_READY` → `stripChatCompletionPrompt(eventData.chat)`. ST emits this with
    the exact list it sends (`SillyTavern/public/scripts/openai.js:1618-1619`). TavernHelper's
    `eventOn` passes ST's object through unchanged (`JS-Slash-Runner/src/function/event.ts:23-62`), so
    the in-place edit reaches the request.
  - `GENERATE_BEFORE_COMBINE_PROMPTS` → `stripTextCompletionPrompt(data)` (§3.3).
  - `GENERATE_AFTER_COMBINE_PROMPTS` → the text-completion log line. The before-event carries no
    dry-run flag; this one does, and ST fires it right after for the same build.
  - A missing `eventOn` or event name is a `log.warn` naming the path that goes unstripped.
- ST awaits listeners one at a time and catches a throw (`SillyTavern/public/lib/eventemitter.js:144-152`).
  The hooks still catch and `log.warn` with context: a failed strip sends that request with its markup.
- **Listener order:** mvu-helper is an ST extension, so its listeners run first. On the local tab the
  companion's is the last of 6, after mvu-helper's image context-swap, so rendered image wraps reach
  the strip as `<pic …>` tags. The core handles both forms.
- **No galgame gate.** Old replies keep their `<p>` even if galgame is removed later, and stripping them
  is still right.
- **Dry runs are stripped too** (the transform holds no state) but never logged.
- **Log:** one `log.info` line per real send, e.g.
  `prompt-beat-strip (chat completion): 37 past replies · 412 beat tags + 9 backdrop lines removed · 52,140 → 47,610 chars`.
  `log.info` prints only with the companion's `DEBUG` build switch, which is off in releases.

### 3.3 Text completion — `stripTextCompletionPrompt(data)`

Text-completion APIs (KoboldCpp, text-generation-webui, NovelAI, …) never fire
`CHAT_COMPLETION_PROMPT_READY`; ST builds one flat string instead. The hook point is the event fired just
before ST flattens it:

- ST emits `GENERATE_BEFORE_COMBINE_PROMPTS` with `data.finalMesSend`
  (`SillyTavern/public/script.js:5234`). That is the list of chat-history items for this build, a
  `structuredClone` of the history (`script.js:5145`), so writing to it never touches the saved chat.
- After the event, ST builds the prompt string from **that same array** (`combine()`, `script.js:5184`,
  called at `5237`). So stripping `item.message` in place changes what is sent.
- **Which items:** history items carry no role, but only past replies contain `<p>`. The strip touches
  only `item.message`, never `item.extensionPrompts`, and skips items with `item.injected === true`.
  Depth injections (galgame's format rule is a world-info entry at depth 0) arrive as injected items
  (`doChatInject`, `script.js:5628-5675`), so the rule's `<p>` examples stay intact.
- **Skip when `data.api === 'openai'`.** ST runs this path for chat completion too, but ignores the
  string it produces; §3.2 covers that API.

## 4. Tests — `tests/prompt-beat-strip-core.test.js`

**Fixtures copy the SHAPE of real replies with neutral text.** The repo is public, and the real replies
are the user's chat. Each fixture names the reply whose shape it copies.

### 4.1 Cases (each also checked for idempotence)

| Case | Input shape (source) | Expected |
|---|---|---|
| Shaped blank-line prose | `<p>a1\na2</p>\n\n<p>b</p>` (staging 310) | `a1\na2\n\nb` — inner newline kept |
| Model-written per-line beats | `<content>\n<p>a</p>\n<p>b</p>` (staging 312/314) | `<content>\n\na\n\nb` — **the case that broke** |
| No newline between beats | `<p>a</p><p>b</p>` | `a\n\nb` |
| Backdrop between beats | `<p>a</p>\n<background scene="x" />\n<p>b</p>` | `a\n\nb` |
| Image wrap between beats | `<p>a</p>\n<span class="auto-img-wrap"…>…</span></span>\n<p>b</p>` | `a\n\n<image>\n\nb`, image untouched |
| `<pic>` between beats | `<p>a</p>\n<pic char="Mana" prompt="x">\n<p>b</p>` | `a\n\n<pic …>\n\nb` |
| Envelope tag lines | `<maintext>\n<background …/>\n<p>cap</p>\n\n<p>x</p>\n</maintext>` | `<maintext>\n\ncap\n\nx\n\n</maintext>` |
| `<content>` inside the first beat | `<p><content>\na</p>\n\n<p>b</p>` (staging 310) | `<content>\na\n\nb` |
| TTS attribute form | `<p tts="v1">名: "你好"<微笑></p>` | `名: "你好"<微笑>` |
| English expression tag | `<p>Mana: "Hi"<smile></p>\n<p>Me: "Yo"<grin></p>` | `Mana: "Hi"<smile>\n\nMe: "Yo"<grin>` |
| Unclosed last beat (truncated reply) | `<p>a</p>\n<p>b` | `a\n\nb` |
| Full-width indentation | `<p>a</p>\n<p>　　b</p>` | `a\n\n　　b` |
| Text edges | `\n<p>a</p>\n` | `\na\n` |
| `<p>` inside a styled card | `<p>a</p>\n<styled class="c"><p>card</p></styled>\n<p>b</p>` | card untouched, a blank line each side |
| `<p>` inside the shaper's hidden block | `<!--gc:hidden\n<p>x</p>\n-->` between beats | block untouched, a blank line each side |
| Nothing to strip | a reply with no `<p>` / `<background>` | the identical string |
| Whole replies | the staging 310 and 312/314 shapes with caption, image and tail | one paragraph per beat; tail after `</maintext>` byte-identical |

The hooks get their own tests:
- **Chat completion:** assistant entries are stripped, system and user entries are byte-identical,
  a multimodal entry's text part is stripped and its image part kept, and a reply without markup is not
  counted.
- **Text completion:** `finalMesSend[i].message` is stripped; `extensionPrompts` and `injected` items
  are byte-identical; `api: 'openai'` returns `null` and touches nothing.

### 4.2 Round trips against the shaper

- **Shape, then strip:** for a raw reply written as blank-line paragraphs (with an image),
  `strip(shapeMessage(raw))` gives back the same paragraphs as `raw`.
- **Strip, then shape** (the direction that broke): a reply written in the stripped layout, which is
  what the model copies, shapes back into the same beats as the original. This holds for both the
  model-written per-line shape and the shaped blank-line shape.

### 4.3 Mutations — 11/11 caught

Each rule was broken once, a test failed every time, and the file was restored byte for byte:
1. A seam becomes nothing instead of a blank line.
2. `<p …>` attributes are not matched.
3. The backdrop line is left in.
4. A system message is stripped.
5. Edge whitespace is replaced by a blank line too.
6. A seam eats full-width indentation.
7. The identity case returns a changed string.
8. Injected text-completion items are stripped.
9. Machinery blocks are not skipped.
10. Chat completion's copy of the text path is stripped.
11. A machinery neighbour is ignored at a seam.

## 5. Live checks (local tab, test chat, 2026-10-15)

**5.1 A/B (one dry run, nothing sent).**
- **Method:** capture A sat right before the companion's listener (after mvu-helper's image swap) and
  capture B at the end. The core was loaded from the dev server to compare.
- **Prompt:** 113 messages, 38 past replies. 37 carried markup before the strip, 0 after.
- **Exact match:** all 38 replies equal the core applied to A, and 0 other messages changed.
- **Tokens:** past replies 52,188 → 43,583 (−8,605, −16.5%); the whole prompt 139,192 → 130,587
  (−6.2%), the same 8,605 tokens, because ST does not refill after the hook.
- **Visible text:** 0 replies lost a visible character. A tag-removal check that also ate a bare `<`
  in a leaked thinking block ("< 10 則為 Fumble") at first reported 1 loss; a check matching only
  real tags shows none.
- **The broken shape:** A held 24 seams with at most one newline, the shape that packed staging msg 316.
  Every one is a blank line in B.

**5.2 One real turn** (msg 212 swiped; it was a reply the provider cut off earlier):
- **The request sent:** 38 past replies, 0 with markup, blank-line paragraphs.
- **The new reply:**
  - it has `<maintext>`, `<UpdateVariable>`, `<RES_Variable>` and the POST block;
  - the shaper made 56 beats, with 0 seams glued by a single newline, and 1 backdrop.
- **galgame's format rule** was not in that prompt, because galgame mode was off.
- **Continue** was checked by a dry run, not a real Continue. Continuing a complete reply only appends
  after its tail, and the strip's whole effect on Continue is in the prompt. Result: all 37 past replies
  were stripped, including the one being continued; the saved msg 212 still has its 56 beats.

**5.3 Goal 1 — an edit made in ST shows in galgame.**
- **The latest reply, one swipe** (msg 212, regenerated by the user):
  - galgame was opened on it, and a marker was inserted into its first beat through ST's edit flow.
  - galgame's view showed the marker within seconds. Reverting the edit removed it from the view too.
  - The saved reply kept its 71 beats, and no second model call ran.
  - The text was restored byte-identical; its SHA-256 on disk matches.
- **An older reply** (msg 210): the edit saved and ST showed it, but galgame did not, even after 8 s.
  That is galgame's design, not the strip: it redraws its view only for the latest AI message
  (`galgame/src/ui/process-message.js:298-305`). The edit was reverted byte-identical, confirmed on disk.
- **A swiped reply:** #8 decides what galgame shows, so goal 1 holds there only once #9 is built.

**5.4 Text completion:** the local tab has no text-completion connection, so item 3 is verified by
vitest only.

**5.5 A turn the user generated** (msg 212, regenerated, 2026-10-15 21:35 UTC):
- **The request sent** (ST's itemized prompt): 180 messages, 71 past replies, 0 with markup; no system
  message touched.
- **The model's layout:** it wrote plain paragraphs separated by blank lines, copying the stripped
  history. The shaper wrapped 71 of them (`wrapped=71p`), the case that packed staging msg 316.
- **Earlier tries in the same turn failed for reasons outside this feature:**
  - one was stopped;
  - one got HTTP 404 while the connection was being switched (ST logged "Custom model changed to
    抗截断-build-gemini-3.8-flash");
  - one came back empty in 0.00 s, the relay failure this chat showed before the strip existed.
- **The successful reply** had no envelope; the shaper inserted it once the turn finished. Replies
  without an envelope also came before the strip (the local msg 212 swipe 0 of the first A/B).

## 6. Swiped replies show the wrong swipe (confirmed; patch design needs a ruling)

**Confirmed live 2026-10-15:**
- galgame was opened on msg 212 with ST on swipe 1. It displayed swipe 0 ("test 我看了一眼手機上的時間…").
- galgame's reader `getFormattedSwipeContent` (`galgame/src/utils/html.js:74-89`, unchanged in the
  deployed `bigmalove/galgame@v2.51` bundle) checks its enhanced-mode record, then returns the **first**
  swipe carrying galgame tags. It never looks at the current swipe.
- The shaper tags every swipe, and `<maintext>` alone matches galgame's tag test, so on any swiped reply
  galgame shows swipe 0. An edit to the current swipe can never appear, which breaks goal 1.

**Why the obvious patches are unsafe:**
- galgame reads swipes through TavernHelper's `getChatMessages(id, { include_swipes: true })`.
- The same call shape feeds galgame code that **writes swipes back** (`timeline/navigation.js:266-283`,
  `logic/enhanced-mode.js:672-797`).
- Reordering or trimming the swipe list for every such call would scramble or delete the user's swipes.

**The one safe patch point found:**
- `getChatMessages` is a writable own property of galgame's TavernHelper frame
  (`TH-script--galgame--…`).
- A companion wrapper changes the result **only when the call stack shows galgame's
  `getFormattedSwipeContent`**; the v2.51 bundle keeps its function names. It returns the message
  with its swipe list cut to the current swipe.
- Every other call passes through untouched, so galgame's swipe writes never see a changed list.
- **If galgame renames or minifies that function,** the wrapper stops matching and the wrong-swipe
  display returns. The display breaks; data is never at risk.
- **Needs:** a pure core for the stack match and the trim, with tests; re-applying when TavernHelper
  recreates galgame's frame; and an upstream report with the one-line fix (read `swipes[swipe_id]` first).

**Ruled out:**
- **Writing galgame's enhanced-mode record from the companion:** a stored copy of every reply, which
  goal 1 excludes.
- **Removing galgame tags from non-current swipes:** that edits the user's swipes, and `<maintext>`
  alone still matches.

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

## 8. Release (v0.9.17)

- **Checks:** `npm test`: 17 files, 355 passed, 2 skipped (the School contract tests in
  `tests/schoolv4-contract.test.js`). `npm run build` is clean.
- **Version and pins:** `package.json` is `0.9.17`, and `@v0.9.17` is pinned in `README.md` and
  `galgame-companion.import.json`. `README.md`'s beat-shaper item names the prompt strip.
- **Released:** committed with `dist/` (`git add -A`), tagged `v0.9.17`, and the commit and tag pushed.
- **Proven:** the jsDelivr URL for the tag serves the same `VERSION` and `BUILD` as the local bundle.
