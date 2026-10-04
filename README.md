# galgame-companion

A companion **Tavern-Helper script** for [bigmalove/galgame](https://github.com/bigmalove/galgame) —
rides on the untouched galgame plugin as a third independent entry in TH's script library
(alongside galgame + [MVU](https://github.com/MagicalAstrogy/MagVarUpdate)). Zero upstream coupling:
galgame keeps auto-updating; anything this script can't find, it skips.

What it does, one folder each under `src/features/`:

1. **i18n** — translates galgame's Chinese GUI via a MutationObserver + exact-match dictionary
   (only explicit hits are replaced; new upstream strings just stay Chinese). Harvest mode collects
   untranslated strings: run `__galI18nDump()` in the console.
2. **menu** — a `Menu` button in galgame's bottom toolbar + mobile menu (new `data-action` → inert
   to galgame's own handlers). Its modal shows the card's StatusMenu in a sandboxed frame mounted
   from mvu-helper's `statusMenuFrameSource()`, pushed the current floor's `stat_data`.
3. **image** — the seam writes [mvu-helper](https://github.com/KritBlade/mvu-helper-dev)-generated
   images into galgame's own background library (`saveBackground`, keyed by the nearest-preceding
   `<background scene>`); every image arrives in one shape, because mvu-helper draws all of them at
   the card's Image type. Top-right buttons open the current backdrop in a lightbox and regenerate
   it. The Background Manager patch sorts the library newest-first by each record's `lastModified`
   (the seam's machine-minted scene names make its alphabetical grid unbrowsable) and adds a select
   mode — checkboxes, select-all, one confirm, one transaction. DOM-level over galgame's own markup:
   its card nodes are moved, never rebuilt, so its handlers stay bound.
4. **beat-shaper** — wraps the reply's prose in galgame's `<p>` lines and injects a uid-scoped
   `<background scene>` per image, so each image becomes the backdrop at its place in the reply.
5. **galgame-bridge** — feeds galgame's own UI from `stat_data`: the location/time pills and the
   Story-choices sheet (through an AutoCardUpdaterAPI shim — MVU cards have none), plus the controls
   the genre profile declares over the stage: the manual Next-Block toggle and the live meter panel.
6. **galgame-quirks** — workarounds for galgame behaviour we can't change upstream: releases the
   native fullscreen its "quit mode" leaks; raises and drops the "Generating" popup with the real
   turn, mvu-helper's PRE pass through its POST pass; makes the free-input pop-up write a new line
   on Enter (Ctrl+Enter or Send sends) and close only on ✕; and cuts the paragraph cap and sample
   reply from galgame's format rule so the card's preset sets the reply length (a TTS rule stays
   whole).

On start it also seeds galgame's display settings (`src/app/galgame-defaults.js`), so the card's
VN presentation needs no per-user setup, and logs which genre profile is live.

## Install (Tavern Helper script library)

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion@v0.9.13/dist/galgame-companion.dist.js'
```

Add AFTER the galgame script entry. `@v0.9.13` pins a release tag — bump it to update.

**Versionless (auto-latest)** — resolves to the newest semver tag, so the TH entry never needs editing:

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js'
```

Caveats: the CDN caches versionless URLs up to **12 h** (force with
`curl https://purge.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js`),
and every new tag auto-ships to you. Use versionless for your own dev loop; anything shipped
inside a card's 脚本库 should stay **pinned**.

**Versioning:** `0.X` = dev phase, `0.X.N` = iteration within the phase. Same-phase fixes:
v0.3.1, v0.3.2, …; a new phase (StatusMenu HUD, image seam) bumps to v0.4, v0.5, ….
Pinned tags are the update mechanism, so the version in `package.json`, the git tag and the
jsDelivr pin always move together: set `@v<version>` in the Install line above and in
`galgame-companion.import.json`, commit, tag that commit `v<version>`, and push the commit AND
the tag. A bump with no tag ships nothing; a stale pin keeps every card on the old build.

## Dev

```bash
npm install
npm run dev      # esbuild --watch → dist/galgame-companion.dist.js
npm run serve    # CORS static server on http://127.0.0.1:5500 (TH's ES import needs CORS)
```

Dev TH entry (see `galgame-companion.import.json`):

```js
import 'http://127.0.0.1:5500/dist/galgame-companion.dist.js?v=dev1'
```

Bump `?v=` to cache-bust. `dist/` is committed — jsdelivr serves it straight from the tag,
same model as galgame's own `dist/数据库界面插件.dist.js`.

## Maintenance (per upstream galgame bump)

The companion rides on `bigmalove/galgame` untouched, so an upstream release can shift selectors or
the IndexedDB schema. After each `git pull` of the galgame clone, run this loop:

1. **Re-harvest i18n** — set `HARVEST = true` (`src/i18n.js`), load in ST, exercise the chrome, run
   `__galI18nDump()` in the console, curate genuine galgame-chrome strings into `src/i18n-dict.js`
   (skip story text / ST presets / TH's own UI / TTS voice names), then flip `HARVEST` back to `false`.
2. **Spot-check the two anchor selectors** the companion hooks: `.gal-bottom-toolbar` (button injection)
   and `#gal-global-overlay` (immersive-mode detection). If renamed upstream, update and re-test.
3. **Verify the background-library DB contract** — object store `backgrounds` in `GalgameUIPluginDB`
   and the record shape (`{id, sceneName, imageUrl, packId, lastModified, …}`), all named once in
   `src/features/image/background-store.js`. Bump of galgame's `DB_VERSION` = re-verify `image-seam.js`
   still writes a compatible record, and that `lastModified` is still what the Background Manager
   patch can sort on.
4. **Spot-check the Background Manager pane selectors** — `.gal-tab-pane[data-pane="backgrounds"]`,
   `.gal-bg-grid`, `.gal-bg-card[data-scene]`, `.gal-pane-header/-stat/-actions`
   (`src/features/image/background-manager.js`). A rename degrades to "the patch does not apply":
   the grid falls back to galgame's alphabetical order and the Select button is missing.

## Design docs

Plans live in the MvuGameMaker project: `GALGAME_COMPANION_PLAN.md` (build phases G0–G5) and
`VISUAL_PIPELINE_PLAN.md` §3 (the image-seam contract).
