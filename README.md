# galgame-companion

galgame-companion is a Tavern Helper script that makes [galgame](https://github.com/bigmalove/galgame) work with MVU game cards and [MVU Helper](https://github.com/KritBlade/mvu-helper).

galgame turns a SillyTavern reply into a visual novel: a backdrop, a text box, one line at a time. It's a great plugin, but it was built for Chinese cards, and it knows nothing about MVU Helper's pictures, its status menu or the game state. galgame-companion is the adapter between the 2.

It never edits galgame. galgame sits in your Tavern Helper script library untouched and keeps auto-updating. galgame-companion is a separate entry next to it, and patches everything from the outside. Anything an update moves that it can't find anymore, it just skips.

## What you need

- **galgame,** in Tavern Helper's script library. Everything needs it.
- **An MVU card written in galgame's format,** with the story in `<maintext>` or `<gametxt>` and an `<UpdateVariable>` block in every reply. ArtificKoi is one.
- **MVU Helper 0.3.290 or later** for the pictures, the status menu and the game's own controls. Without it, those parts don't show up, and the rest still works.

It's built for MVU cards. On a galgame-format card with no MVU, every reply without an `<UpdateVariable>` gets an "Incomplete reply" warning, because galgame-companion reads a missing block as a turn the game never applied.

## Install

In Tavern Helper's script library, add a new script AFTER the galgame entry:

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js'
```

That's the generic URL. It always loads the newest release, so you never have to edit the entry again.

The one catch: jsDelivr caches it for up to **12 hours**, so a new release can take that long to reach you. To get it right away, run `curl https://purge.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js`, then reload SillyTavern.

**Pinned to one release,** for a card you ship, so it never changes under your players:

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion@v0.9.20/dist/galgame-companion.dist.js'
```

`@v0.9.20` is the release. To update, bump the number.

When it loads, the console prints one line, `[galgame-companion] v0.9.18 · build <hash>`, and `window.__galgameCompanion` is there. That's how you know it's running, and which release you got.

## What it does

Every feature is one folder under `src/features/`.

### i18n: an English GUI

galgame's buttons and menus are in Chinese. galgame-companion translates them into English, as galgame draws them.

- **Only exact matches are replaced,** from a dictionary of whole strings plus a few patterns. A string the dictionary doesn't know stays Chinese, so a new galgame release never gets a wrong translation.
- **Text and attributes:** the text itself, and the `placeholder`, `title` and `aria-label` of every element.
- **Never someone else's text.** A node another translator keyed, with `data-i18n`, `data-i18n-title` or `data-i18n-placeholder`, is never touched, and neither is anything inside it. That's SillyTavern's own UI and other extensions' panels.

### menu: the status menu inside galgame

A **Menu** button sits in the upper-left corner of galgame's screen, and in galgame's mobile menu. It opens the card's status menu right on top of the visual novel, so you never have to leave it.

- **The menu runs locked,** in the same sandboxed frame MVU Helper uses, mounted from `MvuHelper.statusMenuFrameSource()`.
- **It's always current.** The state is pushed to it after every reply, edit, swipe, chat change and MVU update.
- **It closes** on ✕, a click outside, or Esc. In fullscreen, it opens inside the fullscreen screen.
- **No MVU Helper, or one older than 0.3.290,** and it says "The StatusMenu needs mvu-helper 0.3.290 or later." A card with no status menu says "This card has no StatusMenu."

The button doesn't clash with galgame. It uses a `data-action` galgame has no handler for, so galgame never reacts to it.

### image: MVU Helper's pictures become the backdrops

When MVU Helper draws a picture into a reply, galgame-companion makes it the backdrop at that exact point of the story. So the scene changes while you read, the way a visual novel should.

- **Into galgame's own background library.** It writes each picture straight into galgame's IndexedDB, `GalgameUIPluginDB`, store `backgrounds`, in galgame's own record shape: `{ id, sceneName, imageBlob: null, imageUrl, packId, lastModified }`. `packId` is galgame's current pack, `pack_default` when there is none.
- **Matched by name, never by guess.** Every picture gets a scene name like `{uid}_scene_{n}_{hash}`. The hash comes from the picture's own address, so the right picture always lands on the right line.
- **No leftovers.** A regenerated picture replaces the old one. Delete a message or switch chats, and pictures nothing points at anymore are swept out. Open the chat in a second browser, and the backdrops are rebuilt on load.

2 buttons in the upper-right corner work on the backdrop you're looking at:

- **View,** the picture full size.
- **Regenerate,** which clicks MVU Helper's own regenerate button on that picture. When the picture belongs to an older reply, the backdrop is repainted when the new one arrives.

**The Background Manager gets 2 fixes.** galgame lists backgrounds alphabetically, which is useless with machine-made scene names. So it's sorted newest first. And a **Select** mode lets you tick several, with Select all, Clear, Delete selected and Done: one confirm, one delete. galgame's own cards are moved, never rebuilt, so galgame's buttons on them keep working.

### beat-shaper: a reply galgame can read

galgame reads a reply as `<p>` lines inside `<maintext>`. A model doesn't always write it that way, so galgame-companion shapes every reply as it arrives:

- **The prose goes into galgame's `<p>` lines,** with a `<background scene>` at every picture, so each picture becomes the backdrop at its place.
- **Clean-up:** `<gametxt>` becomes `<maintext>`. Reasoning that leaked into the reply moves to SillyTavern's reasoning box. A story cut off before its closing tag is closed. Each `<combat_log>` roll line moves into the prose, at the `<roll/>` marker where that check happens.
- **"Incomplete reply" warning.** A reply cut off mid-story, or one with no `<UpdateVariable>`, gets a toast. Both look finished, and both mean the game state didn't move while the story did. The greeting is exempt.

It runs on every new and edited AI reply, and only when galgame is installed. With mvu-helper, the shaping joins mvu-helper's own write of the reply, so a reply with pictures refreshes once.

**The model never sees that markup.** The saved reply keeps it for galgame. But every past reply sent back to the model loses it, with one blank line at each beat. That works for chat and text completion alike. So it costs no tokens, and the model never copies a layout it shouldn't write.

### galgame-bridge: the game state on galgame's screen

- **Location, weather and time pills,** read from `stat_data.World`, with the labels MVU Helper's engine gives them.
- **Story choices.** galgame's choice sheet works through a small stand-in for its AutoCardUpdater API, because MVU cards don't have one. The choices come from a `<choices>` block in the reply, 6 at most, and the sheet opens from its own button. The instruction for that block is only added when galgame's own mode is on for the card.
- **Game controls,** declared by the genre profile, see below. On ArtificKoi, that's the **Next Block** toggle, and the energy meters during an intimate scene.

### galgame-quirks: fixes for galgame's own behaviour

- **Fullscreen.** galgame's quit mode can leave the browser stuck in fullscreen. It's released.
- **"Generating" popup.** It now stays up for the whole turn: MVU Helper's PRE calls, the reply and the POST calls. It listens to MVU Helper's `mvu_helper_turn_phase` event, and gives up after 5 minutes so it can never hang.
- **Free input.** Enter makes a new line, and Ctrl+Enter or the Send button sends. The pop-up only closes on ✕.
- **Reply length.** galgame's format rule caps paragraphs and carries a sample reply. Both are cut for that prompt, so your card's preset decides how long a reply is. A TTS rule stays whole.
- **Peek at the backdrop.** On the newest reply, a click outside a styled card, like a terminal or a text message, hides the reply and shows the backdrop with galgame's Regen and Free chat buttons. The next click brings it back.

### Display defaults

On first run, galgame-companion sets galgame's display settings the way the card was designed, so the visual novel needs no setup:

| Setting | Set to |
| --- | --- |
| dialogue segment length | 460 |
| hide other floors | on |
| typewriter, and its sound | off |
| background fill | contain |
| CG as background | off |
| effects, sprites, BGM | off |
| Ctrl to skip | off |
| TTS, and TTS autoplay | off |
| background image source | `chatu8` |

It runs once per seed version (3.2 now), and only touches those settings. Everything else you set is left alone. A new seed version sets those fields once more. If galgame was already running, the page reloads once so galgame picks them up, at most twice a session.

galgame's setup wizard is also kept from popping up by itself. galgame opens it for any new player whose image library is empty, and its steps would change the settings above. On every start galgame-companion ticks the wizard's own "Don't auto-show again" for the player. Settings → General → Setup Wizard still opens it.

### Genre profiles

Different games put the clock and the controls in different places. A genre profile says where, for one kind of game. The live one is picked by MVU Helper's engine name, `MvuHelper.engineInfo().name`, read fresh every time.

| Profile | For | Declares |
| --- | --- | --- |
| `school` | ArtificKoi, engine name "School" | the Next Block toggle on `PendingState.BlockDone`, and while `PendingState.IntimacyActive`, a meter panel: your Energy, and each classmate's Energy, Arousal and Climax gauge |
| `main` | every other card | a plain clock, no controls |

## Without MVU Helper, or without MVU

galgame-companion doesn't check for MVU Helper. Every feature just does what it can:

| Needs | Features |
| --- | --- |
| galgame only | the English GUI, display defaults, every quirk fix, the picture viewer, the Background Manager fixes, story choices, reply shaping |
| MVU | the location and time pills, the meter panel, the Next Block state, the state pushed to the status menu |
| MVU Helper | the status menu, pictures as backdrops and Regenerate, writing Next Block, picking the genre profile, PRE and POST in the "Generating" popup, translated pill labels |

Without MVU Helper, the menu shows its message, there are no pictures, every card gets the `main` profile, and the pills show raw values.

## Checking your work

- **Is it running?** Look for `[galgame-companion] v… · build <hash>` in the console.
- **Pictures not showing?** Tick the **Image gen** debug domain on MVU Helper's Main tab. The picture seam logs through it.
- **A string still in Chinese?** That string isn't in the dictionary yet, see [Maintenance](#maintenance-after-every-galgame-update).

## Versioning

`0.X` is a development phase, and `0.X.N` is a fix inside it: v0.9.17, v0.9.18, and the next phase is v0.10.

A pinned tag is how you update, so the version in `package.json`, the git tag and the jsDelivr pin always move together:

1. Set `@v<version>` in the pinned line under Install and in `galgame-companion.import.json`.
2. Commit.
3. Tag that commit `v<version>`.
4. Push the commit AND the tag.

A bump with no tag ships nothing, and a stale pin keeps every card on the old build.

## Dev

```bash
npm install
npm start        # watch + serve together, logs in logs/*.log
npm stop
npm run dev      # esbuild --watch only > dist/galgame-companion.dist.js
npm run serve    # CORS server only, on http://127.0.0.1:5500
npm run build    # one build
npm test         # vitest, or npm run test:watch
```

Tavern Helper's ES import needs CORS, which is why the dev server sends it. Point a Tavern Helper entry at your local build, as `galgame-companion.import.json` does:

```js
import 'http://127.0.0.1:5500/dist/galgame-companion.dist.js?v=dev1'
```

Bump `?v=` to bust the cache. `artifickoi.json` is a second entry for the same local build, so you can test against ArtificKoi next to the released one.

`dist/` is committed. jsDelivr serves it straight from the tag, the same way galgame serves its own `dist/`.

## Maintenance after every galgame update

galgame-companion rides on galgame untouched, so a galgame release can move a selector or change its database. After each galgame update:

1. **Harvest new strings.** Set `HARVEST = true` in `src/features/i18n/i18n.js` and rebuild. Load it in SillyTavern, click through galgame's screens, then run `__galI18nDump()` in the console. It downloads `galgame-i18n-missing.json`. Add the real galgame strings to `src/features/i18n/i18n-dict.js`, never story text, presets, Tavern Helper's own UI or TTS voice names. Set `HARVEST` back to `false`.
2. **Check the selectors it hooks.** `#gal-global-overlay` is the anchor for almost everything. Then `#gal-mobile-menu`, `.gal-layer-bg` / `.gal-bg-base` / `.gal-bg-front`, `#gal-generating-indicator`, `#gal-free-input-modal`, `.gal-styled-stage`, `.gal-progress-bar`, `.gal-game-container[data-mes-id]` and `.gal-bottom-toolbar`. Also galgame's init lock, `__galgame_init_lock__`, and its format rule entry, `Galgame输出格式规范`.
3. **Check the background database.** Store `backgrounds` in `GalgameUIPluginDB`, and the record shape above, are all named once in `src/features/image/background-store.js`. When galgame bumps its `DB_VERSION`, make sure `image-seam.js` still writes a record galgame accepts, and that `lastModified` is still there to sort on.
4. **Check the Background Manager.** `.gal-tab-pane[data-pane="backgrounds"]`, `.gal-bg-grid`, `.gal-bg-card[data-scene]` and `.gal-pane-header` / `-stat` / `-actions`, in `src/features/image/background-manager.js`. A renamed one only means the fix doesn't apply: the grid goes back to alphabetical, and the Select button is missing.

How to patch galgame from the outside, without ever editing it, is in [doc/dev-helper.md](doc/dev-helper.md). Design notes for bigger changes are in [plans/](plans/).

Basically, galgame draws the visual novel, MVU Helper runs the game, and galgame-companion makes them talk to each other.
