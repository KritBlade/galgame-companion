# galgame-companion

A companion **Tavern-Helper script** for [bigmalove/galgame](https://github.com/bigmalove/galgame) —
rides on the untouched galgame plugin as a third independent entry in TH's script library
(alongside galgame + [MVU](https://github.com/MagicalAstrogy/MagVarUpdate)). Zero upstream coupling:
galgame keeps auto-updating; anything this script can't find it silently skips.

Four capabilities:

1. **i18n overlay** — translates galgame's Chinese GUI via a MutationObserver + exact-match
   dictionary (only explicit hits are replaced; new upstream strings just stay Chinese).
   Harvest mode collects untranslated strings: run `__galI18nDump()` in the console.
2. **Toolbar button** — injects a `Menu` button into galgame's bottom toolbar + mobile menu
   (new `data-action` → inert to galgame's own handlers).
3. **MVU stat HUD** — pops a StatusMenu rendering the card's MVU `stat_data` in an iframe
   with a TH-globals bridge.
4. **Image seam** — writes [mvu-helper](https://github.com/KritBlade/mvu-helper)-generated
   images into galgame's own background library (`saveBackground`, keyed by the
   nearest-preceding `<background scene>`), and flips `World_Calc.ForceImageType` on
   immersive enter/exit so every image matches the user's chosen aspect.

## Install (Tavern Helper script library)

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion@v0.5.18/dist/galgame-companion.dist.js'
```

Add AFTER the galgame script entry. `@v0.5.18` pins a release tag — bump it to update.

**Versionless (auto-latest)** — resolves to the newest semver tag, so the TH entry never needs editing:

```js
import 'https://cdn.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js'
```

Caveats: the CDN caches versionless URLs up to **12 h** (force with
`curl https://purge.jsdelivr.net/gh/KritBlade/galgame-companion/dist/galgame-companion.dist.js`),
and every new tag auto-ships to you. Use versionless for your own dev loop; anything shipped
inside a card's 脚本库 should stay **pinned**.

**Versioning:** `0.X` = dev phase, `0.X.N` = iteration within the phase (since pinned tags
are the update mechanism, every change ships as a new tag). Same-phase fixes: v0.3.1,
v0.3.2, …; a new phase (StatusMenu HUD, image seam) bumps to v0.4, v0.5, ….

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

## Design docs

Plans live in the MvuGameMaker project: `GALGAME_COMPANION_PLAN.md` (build phases G0–G5) and
`VISUAL_PIPELINE_PLAN.md` §3 (the image-seam contract).
