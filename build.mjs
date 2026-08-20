// galgame-companion build — bundles src/ (entry src/app/index.js) into one IIFE dist file (mirrors galgame's
// esbuild setup, minus its CSS/vendor plumbing we don't need). v0.2
//   node build.mjs           one-shot build
//   node build.mjs --watch   rebuild on change (pair with a static server for live dev)
// esbuild resolves from maker-app/node_modules (already a dependency there).

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teeToLog } from './dev-log.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Per-BUILD identity, stamped into the bundle so the running code can name itself (env.js BUILD).
// It is a HASH OF THE BUNDLE'S OWN CONTENT — the identity of the code, not of the commit it happens
// to land in.
//
// IT USED TO BE `git rev-parse --short HEAD`, and that could never settle, because dist/ is
// COMMITTED: a source commit moved HEAD, the rebuild stamped the new HEAD, dist/ went dirty, the
// dist commit moved HEAD again, and the next rebuild was dirty again. Six commits in forty existed
// only to re-stamp. The stamp was naming a commit that did not exist yet at build time — the same
// defect as the removed `@<ISO time>` half (a stamp that changes with nothing else) and the same
// defect as the old dirty check (a stamp measuring its own output), arrived at from a third
// direction.
//
// A content hash changes IF AND ONLY IF the bundled code changes. Rebuild any number of times, commit
// anything at all: identical source produces a byte-identical dist/, so it only ever shows as
// modified when it genuinely differs. To map a stamp back to a commit: `git log -S<stamp> -- dist/`.
//
// THE `-dirty` SUFFIX IS GONE FROM THE STAMP, and its job is done better by the hash itself: a build
// carrying uncommitted edits hashes to something no commit contains, so a bundle that does not match
// any committed dist/ IS the dirty one (which is how `e6fd873-dirty` reached jsdelivr unnoticed —
// a suffix people had learned to skim). The uncommitted-source WARNING stays, at build time, where
// the person who could still act on it is looking.
function contentStamp(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 7);
}

// Shipping a bundle built from uncommitted source is the thing worth catching, so say it out loud
// per build. dist/ is excluded: building WRITES dist/, so counting it would make every build after
// the first report a dirtiness it caused itself.
function warnIfSourceUncommitted() {
  try {
    const s = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    if (s.status !== 0) return;
    const sourceChanges = s.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/\sdist\//.test(l));
    if (sourceChanges.length) {
      console.warn(`[build] NOTE: ${sourceChanges.length} uncommitted source change(s) — this bundle exists in no commit. Do not publish it.`);
    }
  } catch (e) {
    console.warn('[build] could not read git to check for uncommitted source:', e.message);
  }
}

// Tee build output (incl. esbuild's own warnings) to logs/ — 'dev' for the watch loop
// (npm run dev), 'build' for a one-shot (npm run build). Truncated fresh each run.
teeToLog(isWatch ? 'dev' : 'build');

// THE version — package.json is the single source, and this is the only reader. It is stamped into
// the bundle (env.js VERSION) alongside the build stamp, so the running code and the package agree
// by construction instead of by remembering to edit two files.
//
// READ FRESH ON EVERY REBUILD, exactly like the content stamp — never cached at process start. This is
// the version-half of the 2026-08-02 stamp lesson, learned separately (2026-08-19): it used to be a
// top-level `const`, so a --watch process outlived a version bump and stamped its startup version
// onto every later rebuild — a `git pull` that moved package.json to 0.8.2 woke the watcher, which
// rebuilt the NEW source labeled 0.8.1 with a CURRENT sha. A regression label on correct code, and
// dist/ showed dirty with nothing really changed.
function currentVersion() {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '0.0';
  } catch (e) {
    console.warn('[build] could not read package.json for the version (using "0.0"):', e.message);
    return '0.0';
  }
}

// esbuild's pretty-printed warnings/errors come from its Go subprocess writing straight to fd 2,
// which bypasses the Node process.stderr.write patch dev-log.mjs uses — so with logLevel:'info'
// they'd reach the terminal but NEVER the log file. Instead run esbuild silent and re-print the
// messages ourselves via formatMessages → console (which IS teed). color:false keeps the log
// file free of ANSI escapes. onEnd fires on every build (one-shot AND each watch rebuild).
const PLACEHOLDER = '__BUILD_STAMP__';
const VERSION_PLACEHOLDER = '__VERSION__';
const VERSION_RE = /__VERSION__/g;
const outfile = join(root, 'dist', 'galgame-companion.dist.js');

const logMessages = {
  name: 'log-messages',
  setup(build) {
    build.onEnd(async (result) => {
      const { warnings = [], errors = [] } = result;
      for (const line of await esbuild.formatMessages(warnings, { kind: 'warning', color: false }))
        process.stdout.write(line);
      for (const line of await esbuild.formatMessages(errors, { kind: 'error', color: false }))
        process.stderr.write(line);

      // STAMP THE OUTPUT, not the source. Done here (post-bundle, every rebuild) rather than via
      // esbuild `define`/`banner`: those are evaluated ONCE when the context is created, so in
      // --watch mode every rebuild would carry the FIRST build's stamp — the precise staleness this
      // whole mechanism exists to detect. onEnd fires per rebuild, so the stamp is always current.
      //
      // WE own the disk write (`write: false` below) instead of reading back what esbuild wrote.
      // With esbuild writing, a --watch rebuild could land its own copy AFTER this rewrite and the
      // served bundle would carry the raw placeholder — observed live on the second rebuild,
      // 2026-08-02. Writing the stamped text ourselves removes the ordering question entirely.
      //
      // Stamp warnings count toward the summary line below. They did not until 2026-08-11, when a
      // deliberately broken placeholder printed a WARNING and the very next line still read
      // "0 warning(s)" — the summary was reporting esbuild's tally while calling it the build's.
      let stampWarnings = 0;
      let stamp = '(unstamped)';
      const version = currentVersion(); // per-rebuild, same discipline as the content stamp
      if (!errors.length) {
        try {
          const file = (result.outputFiles || [])[0];
          if (!file) throw new Error('esbuild produced no output file');
          // BOTH placeholders are stamped here, and a MISSING one is always reported. A silent
          // miss would ship a bundle whose own name for itself is the literal `__VERSION__` —
          // visible to a player in a toast title line, and indistinguishable in the log from a
          // version that simply never got bumped.
          let text = file.text;
          // VERSION IS STAMPED FIRST, because the build stamp is a hash of the FINISHED bundle: the
          // version it reports has to be inside the text being hashed. Hashing first would give two
          // different releases of identical code the same identity.
          //
          // The banner carries the placeholder too (it must not freeze a startup version the way
          // the old template literal did), so this is a replaceAll and "found at least twice" is
          // the healthy state: banner + env.js. Fewer than two means one of them lost it.
          if ((text.match(VERSION_RE) || []).length >= 2) {
            text = text.replaceAll(VERSION_PLACEHOLDER, version);
          } else {
            stampWarnings++;
            console.warn(`[build] WARNING: ${VERSION_PLACEHOLDER} found fewer than twice in the bundle (banner + env.js expected) — the missing site will NOT carry package.json's ${version}. Did a placeholder get renamed?`);
            text = text.replaceAll(VERSION_PLACEHOLDER, version); // stamp whatever is left anyway
          }
          if (text.includes(PLACEHOLDER)) {
            stamp = contentStamp(text);
            text = text.replace(PLACEHOLDER, stamp);
          } else {
            stampWarnings++;
            console.warn(`[build] WARNING: ${PLACEHOLDER} not found in the bundle — env.js BUILD will read as the raw placeholder and build reporting is BROKEN. Did the placeholder in src/env.js get renamed?`);
          }
          mkdirSync(dirname(outfile), { recursive: true });
          writeFileSync(outfile, text);
          warnIfSourceUncommitted();
        } catch (e) {
          console.error('[build] build-stamp write FAILED — dist/ may be stale or missing:', e);
        }
      }
      console.log(`[build] rebuilt v${version} [${stamp}] — ${errors.length} error(s), ${warnings.length + stampWarnings} warning(s) @ ${new Date().toISOString()}`);
    });
  },
};

const options = {
  entryPoints: [join(root, 'src', 'app', 'index.js')],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  target: 'es2020',
  // No build time OR version literal in the banner: both would be frozen at context-creation time
  // in --watch mode (the version literally was, until 2026-08-19 — see currentVersion()). The onEnd
  // plugin stamps this placeholder per rebuild, alongside env.js BUILD.
  banner: { js: `// galgame-companion v${VERSION_PLACEHOLDER}` },
  outfile,
  // The stamp plugin writes dist/ itself — see its onEnd. Never flip this back to true without
  // removing that write, or the two racing writers put an unstamped bundle on disk.
  write: false,
  logLevel: 'silent',
  plugins: [logMessages],
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`[build] watching (v${currentVersion()})…`);
} else {
  await esbuild.build(options);
  console.log(`[build] done (v${currentVersion()})`);
}
