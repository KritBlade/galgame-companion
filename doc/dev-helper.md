# dev-helper — patching galgame from the companion

How this script patches bugs and structural quirks in
[bigmalove/galgame](https://github.com/bigmalove/galgame) **without ever editing galgame**.
Read this before adding another fix that reaches into galgame's DOM or state.

## The constraint

galgame is imported into Tavern Helper's script library **untouched from CDN** and
auto-updates (README §Install). The companion is a *separate* TH script entry — zero upstream
coupling is the whole design (`index.js` header, GCP §1). So we can never fork, monkey-patch a
source line, or ship a modified galgame. When galgame has a bug or a structural quirk that
hurts our experience, the only lever we have is:

> **Patch the symptom from the parent document, keyed on markup galgame already emits.**

galgame renders its GUI into the parent SillyTavern document (`window.parent.document`, exposed
as `DOC` in `env.js`). The companion runs in its own iframe but shares that same-origin parent,
so it can inject CSS, listen for events in the capture phase, and read/flip galgame's state —
all from the outside.


### Check config file — galgame display settings (`galgame-defaults.js`)

The companion seeds galgame's per-browser display prefs so the card's VN presentation works with
**no manual setup**. Everything lives in the **top window's** storage (galgame's srcdoc iframe shares
the parent origin):

```js
localStorage.getItem('galgame-companion_seed_version')   // version gate — current "3.1"; ≥ SEED_VERSION ⇒ done
JSON.parse(localStorage.getItem('galgame-ui-plugin_settings'))   // galgame's blob — managed fields below
localStorage.getItem('galgame-ui-plugin_tts_enabled')    // "false" (TTS off; separate key)
sessionStorage.getItem('galgame-companion_seed_reload')  // # seed-reloads this session (transient; absent = steady state)
```

Managed fields (seeded once per SEED_VERSION):

| field | card value | galgame default |
| --- | --- | --- |
| `dialogSegLengthOverride` | `460` | `0` |
| `bgFillMode` | `'contain'` | `'cover'` |
| `effectsEnabled` | `false` | `true` |
| `showSprites` | `false` | `true` |
| `bgmEnabled` | `false` | `true` |
| `typewriterEnabled` / `typewriterSoundEnabled` | `false` | `true` |
| `ctrlKeySkip` | `false` | `true` |
| `bgImageSource` | `'chatu8'` (Zhihuiji — galgame never self-generates backdrops) | `'none'` |
| `hideOtherFloors` | `true` | `true` (already matches) |
| `cgAsBackground` | `false` | `false` (already matches) |

**How it converges (design decided 2026-07-18, replacing the failed plain one-shot).** Root cause of
the original failure: galgame reads the blob into module memory ONLY at its own init
(`loadSettings()`, init.js:71) and never re-reads; if it read *before* our seed, any of its 120+
`saveSettings()` callers (settings panel, wizard, map autopregen…) serializes that **stale memory back
over our seed** — and a plain one-shot flag then blocked retry forever (UAT: flag `"1"`, every field
default). The fix is to make galgame **re-read** rather than fight its saves — galgame's load-merge
`{...DEFAULT_SETTINGS, ...parsed}` (settings.js:1273) keeps our values once ONE init reads them, and
every later save preserves them, so user tweaks after convergence stick forever:

1. Seed the blob, set the flag.
2. If `topWindow['__galgame_init_lock__']` is **absent**, galgame hasn't run `loadSettings()` yet
   (lock-set and load are one synchronous block, init.js:68→71; same-origin iframes share one JS
   thread — race-free) → it reads the seed this session. **No reload.**
3. Lock present → galgame already read stale → **one full `topWindow.location.reload()`**.
   (Iframe-only reload does NOT work: the topWindow init lock survives so galgame's init self-skips;
   clearing it leaves dead event bindings behind the `*_BOUND_FLAG`s.)
4. Post-reload (sessionStorage marker): verify the seed survived — galgame's rare legacy-skin boot
   save (init.js:81) or an early auto-save can clobber in the seed→reload window. Clobbered → re-seed
   + reload once more. Hard cap 2 reloads/session, then `log.error` + give up. Never a loop.

Steady state (every normal session): flag check → return. Zero work, zero polling.

**`SEED_VERSION` bump rule:** bump ONLY when the seeded DATA changes — a default value, a managed
field added/removed, or a forced re-heal of broken installs (1→2 healed the v0.5.15 clobber; 2→3
added `ctrlKeySkip:false`; 3→3.1 added `bgImageSource:'chatu8'`). Use fractional bumps (3.1, 3.2…)
for small data tweaks — the gate compares numerically. A bump
re-applies card values ONCE per install, overwriting user tweaks to managed fields one time. Logic-only
changes ship as a normal script release with NO bump.

#### Force a re-seed on one install
```js
localStorage.removeItem('galgame-companion_seed_version');
location.reload();   // companion re-seeds; converges per the flow above (at most one more reload)
```


### Why this is safe against auto-update

Every hack is anchored to a galgame-owned hook: a stable id (`#gal-global-overlay`), a class the
overlay only carries while shown (`.active`), or a `data-action` galgame delegates on
(`close-mode`). If galgame renames the anchor, the hack simply **stops matching** and does
nothing — same graceful-degrade contract as the i18n dictionary. It never throws, never blocks
galgame's own handlers, never corrupts state. That is the bar every new patch must clear.

## Rules for a new galgame patch

1. **Anchor to something galgame already emits** — an id, a `.active`-style state class, or a
   `data-action`. Never depend on galgame internals we'd have to guess or on DOM order alone.
2. **Degrade to a no-op.** If the anchor is gone, the patch must do nothing (not error, not
   half-apply). Wrap DOM reads defensively; feature-detect APIs.
3. **Don't fight galgame's own handlers.** For events, use the **capture phase** so a galgame
   bubble-phase `stopPropagation()` can't hide the event from us (see `fullscreen-guard.js`),
   and `setTimeout(…, 0)` to let galgame's handler run *first* when you're patching its
   aftermath.
4. **Comment the WHY, live-proven and dated.** Each hack carries a block comment stating: the
   upstream mechanism, why it hurts us, what we can't do about it (can't edit galgame), and the
   date it was reproduced/proven live. A stale hack with no rationale is a landmine.
5. **Prove it live before you trust it.** Reproduce the bug in the real ST tab (Chrome DevTools
   MCP, see MvuGameMaker `CLAUDE.md`), inject the fix, confirm the observable flips, remove any
   test tag. Record the before→after number in the comment.
6. **CSS quirks → `style.js`; behavioural leaks → a dedicated `*-guard.js` module** wired in
   `index.js`. Keep one concern per file.

## Current patches

### 1. Overlay anti-collapse — `style.js` (v0.5.11, proven 2026-07-16)

**Symptom:** entering galgame mode with 沉浸模式 (immersive) **off** fires the toast but shows
no UI — an invisible overlay.

**Mechanism:** galgame appends `#gal-global-overlay` as a flex child of ST's `#chat`
(`display:flex; flex-direction:column`) with inline `flex-shrink:1` + `min-height:0`. Immersive
mode works by `display:none`-ing every sibling `.mes` row, so the overlay is the only flex item
and keeps full height. With immersive **off**, the message floors remain flex items and
`flex-shrink:1 + min-height:0` lets the overlay be squeezed to **0px**.

**Patch:**

```css
#gal-global-overlay.active { flex-shrink: 0 !important; min-height: 70vh !important; }
```

Keyed on `.active` (present only while the overlay is meant to show), so it can't affect a
hidden overlay. Live proof: injected the exact rule against a collapsed overlay → height
**0 → 907px**, visible in viewport.

### 2. Fullscreen leak-guard — `fullscreen-guard.js` (v0.5.x, proven 2026-07-15)

**Symptom:** quit galgame while in native fullscreen → page looks frozen behind an invisible
click-blocker.

**Mechanism:** galgame enters native fullscreen via `overlay.requestFullscreen()`, but its quit
handler (`[data-action="close-mode"]`) tears down the views and **never** calls
`document.exitFullscreen()`. The browser stays fullscreen on the now-hidden overlay, so every
click lands on the fullscreen backdrop.

**Patch:** a capture-phase `click` listener on `close-mode`; on the next tick, if the document
is still in native fullscreen, exit it. `exitFullscreen` needs no user gesture, and we're inside
a click anyway. Full multi-vendor prefix handling and non-swallowing error logs in the module.

### 3. Stuck "Generating" indicator — `generating-guard.js` (v0.5.15, proven 2026-07-18)

**Symptom:** on a fresh load / new chat, galgame's `正在生成内容…` (Generating) indicator latches
`.active` with **no** generation running and hangs over the greeting for up to ~120 s.

**Mechanism:** galgame shows `#gal-generating-indicator` when it thinks a reply is mid-stream (last
message has no closed `</p>`, or on `GENERATION_STARTED` while the overlay is open) and hides it via
the `.active` class. A load-time race can turn it ON without a matching hide; its only self-heal is a
~120 s timeout. galgame's internal gen-state is module-scoped inside its iframe (unreachable), but the
indicator element lives in the parent document.

**Patch:** poll (750 ms) from the parent; clear `.active` whenever ST is **provably idle** — no tracked
loud `GENERATION_STARTED` in flight and ST's own `is_send_press` / `streamingProcessor` unset (mirrors
galgame's own dry-run / quiet-gen filter, so a real stream is never hidden). Degrades to no-op if the
element/anchor is gone.

### 4. Right-gutter buttons un-clip — `style.js` (v0.5.20, proven 2026-07-18)

**Symptom:** galgame's right-edge column — sprite-toggle (👁) + the location/time status-popup triggers
(`弹窗一/二`) — is cut off at the default ~120 % dialogue-box scale.

**Mechanism:** galgame positions that column at `right:-40px`, hung into the gutter past the dialog
panel, but `.gal-game-container` is `overflow:hidden`. At ~120 % scale the gutter is only ~17 px, so the
40 px hang overflows and clips (survives only at ~100 % / mobile reflow). Can't per-side-unclip, and
`overflow:visible` would leak sprites/CG on cards that use them.

**Patch:** trim the centred dialog column ~88 px to widen the gutter — `#gal-global-overlay
.gal-dialog-layer { width: calc(100% - 88px) !important; }`. Tuned for the seeded scale; at much larger
scales the companion's own top-right pills still surface location/time. (Companion-owned buttons —
Next-Block, image viewer/regen, corner Menu — are also styled in `style.js` but are features, not
galgame patches.)

## Adding one — checklist

- [ ] Reproduced live in the real ST tab; captured the before-state number.
- [ ] Anchor is a stable galgame-emitted id / state-class / `data-action`.
- [ ] Degrades to a no-op if the anchor disappears.
- [ ] Capture phase + deferred tick if patching event aftermath.
- [ ] Block comment: mechanism · why it hurts · can't-edit-galgame · date proven · before→after.
- [ ] CSS → `style.js`; behaviour → new `*-guard.js` wired in `index.js`.
- [ ] Bumped the file's version header and `env.js` `VERSION`; rebuilt `dist/`.
- [ ] Removed any live test tag; confirmed the observable flips.

## Dev loop — local serve, not push-per-change

Pushing a tag per tweak is the slow path (commit + push + jsdelivr cache). For iterating, serve
`dist/` locally and point the live TH entry at it — **no push, no commit**, just reload ST.

**Fast dev (default while iterating):**

1. In the repo, run both watchers:
   ```bash
   npm run dev      # esbuild --watch → rebuilds dist/galgame-companion.dist.js on every save
   npm run serve    # static server WITH CORS on http://127.0.0.1:5500
   ```
2. In SillyTavern's TH script library, swap the galgame-companion entry's import line to the
   local URL (leave the CDN line commented for later):
   ```js
   import 'http://127.0.0.1:5500/dist/galgame-companion.dist.js?v=dev1'
   ```
3. Reload ST. Edit `src/*` → esbuild rebuilds → reload ST to pick it up. Bump `?v=dev2`,
   `dev3`, … only when the browser caches the file (usually reload is enough; the server sends
   `Cache-Control: no-store`).

**Log files (`logs/`).** Both dev processes tee their full output — including esbuild's build
warnings and any crash — to a file, so the state is inspectable without watching the terminal:

| Command | Log file |
| --- | --- |
| `npm run dev` (watch) | `logs/dev.log` |
| `npm run build` (one-shot) | `logs/build.log` |
| `npm run serve` | `logs/serve.log` |

Each file is **truncated fresh on every run** (`dev-log.mjs`, opened with flag `w`), so it always
reflects the *current* process — never stale output. `logs/` is git-ignored (via
`.git/info/exclude`). Implementation notes worth knowing before you touch `dev-log.mjs`:
- It patches `process.stdout/stderr.write`, not `console.*`, so it catches output that bypasses
  console. But esbuild's pretty warnings come from its **Go subprocess writing to fd 2** and can't
  be intercepted that way — `build.mjs` runs esbuild `logLevel:'silent'` and re-prints them via
  `esbuild.formatMessages()` so they *do* land in the log.
- A fatal crash (e.g. `EADDRINUSE`) is written by Node straight to fd 2, also bypassing the patch;
  `dev-log.mjs` adds `uncaughtException`/`unhandledRejection` handlers that persist the stack
  **synchronously** then exit non-zero — the crash is captured, not swallowed.

**Why the CORS server (not `python -m http.server`):** TH imports the script via ES
`import 'url'` from its `about:srcdoc` iframe, so the fetch is **cross-origin** and needs
`Access-Control-Allow-Origin`. A plain static server omits it and the import fails *silently*.
`dev-server.mjs` sends the CORS + no-store headers (mirrors galgame's own dev static server).

**Release (only when a meaningful change is done):** the CDN pin is the update mechanism, so a
release = a new tag. Steps:

1. Bump `VERSION` in `src/env.js` (single source of truth — `build.mjs` reads it into the dist
   banner) **and** `version` in `package.json`.
2. Bump the `@vX.Y.Z` pin in `galgame-companion.import.json` `content` (and README §Install).
3. `npm run build` → commit `dist/` (it's committed; jsdelivr serves it straight from the tag).
4. Commit, push, tag `vX.Y.Z`. Point the live TH entry back at the CDN line.

Rule of thumb: **local-serve every change; push a tag only when it's worth shipping.** Same-phase
fixes bump `0.X.N`; a new capability bumps `0.X` (README §Versioning).

## Where things live

| Concern | File |
| --- | --- |
| Parent document + logging + `VERSION` | `src/env.js` |
| CSS overrides / structural quirks | `src/style.js` |
| Behavioural leak-guards | `src/*-guard.js` (e.g. `fullscreen-guard.js`) |
| Wiring (start order) | `src/index.js` |
| Build (esbuild → `dist/`) | `build.mjs`, `npm run dev` |

Design docs (build phases, image-seam contract) live in the MvuGameMaker project:
`GALGAME_COMPANION_PLAN.md`, `VISUAL_PIPELINE_PLAN.md` §3.
