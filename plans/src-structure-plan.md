# Plan — adopt the standard `src/` + `features/` template

Status: **v0.2 (2026-07-22)** · **P1–P3 DONE** · P4 (`-core` extractions) not started · Owner: KritBlade

> **Execution record.** Ran as one pass. 23/23 tests green, `npm run build` clean, and the bundle was
> proven a pure move (see §5). Deviations: none of substance — `galgame-quirks/` was created as planned,
> and `app/index.js`'s import list was regrouped by barrel (which reorders esbuild's module emission;
> §5 shows why that is safe here). The `-core` extractions (P4) remain open.
Implements: `Dev/CLAUDE.md` → **Directory structure — the standard template**
Baseline: v0.6.2 · 19 flat files in `src/` · esbuild bundle → `dist/galgame-companion.dist.js` · 1 test file

**Why this repo goes FIRST (before mvu-helper's src move):** it is the low-risk rehearsal.
Zero host module imports exist (`env.js` reaches the parent ST document via `window.parent`, not via
`import`), and esbuild resolves paths at build time — so the entire depth-sensitive-host-import problem
that makes the mvu-helper move risky is **absent here**. Only `build.mjs` `entryPoints` changes.
`dist/` output path is UNCHANGED, so the jsdelivr pin / `galgame-companion.import.json` release flow is
untouched.

---

## 1. Target tree

```
galgame-companion/
├── doc/  plans/  tests/  logs/
├── build.mjs  dev-server.mjs  dev-log.mjs  galgame-companion.import.json
├── package.json  vitest.config.js  README.md  .gitignore
├── dist/                                 build output (path unchanged — CDN consumers unaffected)
└── src/
    ├── app/                              bootstrap (3 files → earns a folder, unlike mvu-helper)
    │   ├── index.js                      composition root (esbuild entry)
    │   ├── style.js                      global CSS inject
    │   └── galgame-defaults.js           one-time galgame display-settings seed
    ├── env.js                            host wrapper (parent-document access + log) — single file, stays a file
    └── features/
        ├── i18n/              index.js + i18n.js + i18n-dict.js        (dict = 56 KB, 40% of src — contained at last)
        ├── menu/              index.js + toolbar.js + menu-modal.js + status-menu.js
        ├── image/             index.js + image-seam.js + image-viewer.js + image-regen.js
        ├── beat-shaper/       index.js + beat-shaper.js + beat-shaper-core.js
        ├── galgame-bridge/    index.js + choices.js + next-block.js + location-time-bridge.js
        └── galgame-quirks/    index.js + fullscreen-guard.js + generating-guard.js
```

**`galgame-quirks/` decision (was the open judgment call):** both files exist to work around a galgame
behaviour (leaked native fullscreen; stuck "Generating" indicator). Grouping them by that shared purpose
is function-grouping; the rejected alternative `guards/` would be kind-grouping. If a third quirk never
appears, cost is one small folder — acceptable.

Cross-feature edges after the move (all legal, all through barrels):
- `image/image-viewer.js` + `menu/menu-modal.js` → `galgame-quirks` (`currentFullscreenEl`)
- `image/image-seam.js` → `beat-shaper` (`SCENE_NAME_RE`)
- `image/image-regen.js` → own feature (`currentBgUrl` — internal, not in barrel)
- `galgame-bridge/next-block.js` → own feature (`refreshLocationTimePills` — internal)
- `menu/toolbar.js` → own feature (`openMenuModal` — internal)

## 2. Phases

### P1 — move + rewrite (all mechanical)

1. `git mv` per the target tree.
2. Specifier rewrites:
   - within a feature: `./x.js` unchanged
   - feature → `env.js`: `./env.js` → `../../env.js`
   - feature → other feature: `../<feature>/index.js` (barrel rule below)
   - `app/index.js`: `../env.js`, `../features/<f>/index.js`
   - `app/style.js`, `app/galgame-defaults.js`: `./env.js` → `../env.js`
3. `build.mjs`: `entryPoints: [join(root, 'src', 'app', 'index.js')]`. Grep `dev-server.mjs` /
   `dev-log.mjs` for hardcoded `src/` paths and update.
4. `tests/beat-shaper-core.test.js` → import `../src/features/beat-shaper/beat-shaper-core.js`.

### P2 — barrels

One `index.js` per feature exporting the start-function + the cross-feature surface listed above.
Rule (same as mvu-helper): **cross-feature imports end at `<feature>/index.js`** — esbuild would tolerate
directory imports, but keeping the explicit `/index.js` keeps ONE rule across both repos and stays
browser-correct if the bundler ever goes away.

### P3 — verify + release

- `npm test` (1 file) · `npm run build` succeeds · byte-compare sanity: `dist/` bundle loads in ST,
  toolbar/menu/i18n/backdrop smoke.
- Version bump + the usual jsdelivr pin flow only when a release is actually cut — the move itself does
  not change `dist/`.

## 3. Optional P4 — `-core` extractions (the real quality gap)

1 test file / 1 pure file out of 19 is the actual debt; folders don't fix it. While every import is
being touched anyway, pull the pure halves out as `-core.js` siblings (each becomes unit-testable):
- `choices.js` — `<choices>` block parse → option sheet rows
- `next-block.js` — BlockDone state read/advance decision
- `location-time-bridge.js` — `stat_data.World` → pill text mapping
- `image-seam.js` — scene-name keying / background-DB row shaping
Each extraction: move pure functions, add a `tests/<name>-core.test.js`. Do as separate commits AFTER
P1–P3 are green; skip freely if time-boxed.

## 5. How the move was PROVEN safe (reusable method)

A bundled project gets a verification a plain-ES-module project cannot: **compare the build output.**

1. Before touching anything, strip the two things a move legitimately changes — the build-timestamp
   banner and esbuild's `// src/<path>` module comments — and hash the rest:
   `grep -v "^  // src/" dist/*.js | tail -n +2 | md5sum` → baseline.
2. After the move, rebuild and hash the same way.
3. The hashes differed, so the diff had to be explained, not waved away. Two causes, both benign:
   - **Module emission order** changed (regrouping the import list moved `style.js` earlier). Safe here
     **only because no module has import-time side effects** — verified by scanning for top-level
     executable statements (`grep -nE "^[a-zA-Z_$][a-zA-Z0-9_$.]*\("` over every non-barrel file:
     zero hits). Every module only declares; execution is driven by the explicit `start*()` calls in
     `app/index.js`, whose order was NOT touched.
   - **esbuild collision suffixes** flipped: two modules each declare `STYLE_ID`, so one gets renamed
     `STYLE_ID2`, and which one depends on emission order. Verified by checking the value↔use pairing
     in both bundles — `el.id` still receives `"school-companion-style"` and `style.id` still receives
     `"school-companion-modal-css"`. All three `OVERLAY_SEL*` are the same literal, so the suffix is
     irrelevant.

**Rule for next time:** an unexplained bundle diff blocks the commit. "Tests pass" does not cover a
19-file move when one test file exists — the bundle comparison is what actually covered it.

## 6. Explicitly NOT in scope

- No `api/` / `services/` / `models/` inside features (server layers we don't have).
- No `config/`, no `lib/` (nothing to put in them; `env.js` is the host wrapper and is one file).
- No behaviour changes in P1–P3.
