// galgame-companion build — bundles src/ (entry src/app/index.js) into one IIFE dist file (mirrors galgame's
// esbuild setup, minus its CSS/vendor plumbing we don't need). v0.1
//   node build.mjs           one-shot build
//   node build.mjs --watch   rebuild on change (pair with a static server for live dev)
// esbuild resolves from maker-app/node_modules (already a dependency there).

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teeToLog } from './dev-log.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Per-BUILD identity, stamped into the bundle so the running code can name itself (env.js BUILD).
// git sha + a dirty flag + the build time: the sha says which commit, `-dirty` says "plus
// uncommitted edits" (the normal dev-loop state), and the time separates two builds of the same
// dirty tree — which is exactly the case that was indistinguishable before.
function buildStamp() {
  let sha = 'nogit';
  let dirty = '';
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
    if (r.status === 0) sha = r.stdout.trim();
    const s = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    if (s.status === 0 && s.stdout.trim()) dirty = '-dirty';
  } catch (e) {
    console.warn('[build] could not read git for the build stamp (using "nogit"):', e.message);
  }
  return `${sha}${dirty} @${new Date().toISOString()}`;
}

// Tee build output (incl. esbuild's own warnings) to logs/ — 'dev' for the watch loop
// (npm run dev), 'build' for a one-shot (npm run build). Truncated fresh each run.
teeToLog(isWatch ? 'dev' : 'build');

// version from src/env.js (single source of truth)
const envSrc = readFileSync(join(root, 'src', 'env.js'), 'utf8');
const version = (envSrc.match(/VERSION = '([^']+)'/) || [])[1] || '0.0';

// esbuild's pretty-printed warnings/errors come from its Go subprocess writing straight to fd 2,
// which bypasses the Node process.stderr.write patch dev-log.mjs uses — so with logLevel:'info'
// they'd reach the terminal but NEVER the log file. Instead run esbuild silent and re-print the
// messages ourselves via formatMessages → console (which IS teed). color:false keeps the log
// file free of ANSI escapes. onEnd fires on every build (one-shot AND each watch rebuild).
const PLACEHOLDER = '__BUILD_STAMP__';
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
      let stamp = '(unstamped)';
      if (!errors.length) {
        try {
          const file = (result.outputFiles || [])[0];
          if (!file) throw new Error('esbuild produced no output file');
          if (!file.text.includes(PLACEHOLDER)) {
            console.warn(`[build] WARNING: ${PLACEHOLDER} not found in the bundle — env.js BUILD will read as the raw placeholder and version reporting is BROKEN. Did the placeholder in src/env.js get renamed?`);
            mkdirSync(dirname(outfile), { recursive: true });
            writeFileSync(outfile, file.text);
          } else {
            stamp = buildStamp();
            mkdirSync(dirname(outfile), { recursive: true });
            writeFileSync(outfile, file.text.replace(PLACEHOLDER, stamp));
          }
        } catch (e) {
          console.error('[build] build-stamp write FAILED — dist/ may be stale or missing:', e);
        }
      }
      console.log(`[build] rebuilt v${version} [${stamp}] — ${errors.length} error(s), ${warnings.length} warning(s) @ ${new Date().toISOString()}`);
    });
  },
};

const options = {
  entryPoints: [join(root, 'src', 'app', 'index.js')],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  target: 'es2020',
  // No build time in the banner: it would be frozen at context-creation time in --watch mode. The
  // authoritative, per-rebuild stamp is written by the onEnd plugin above (env.js BUILD).
  banner: { js: `// galgame-companion v${version}` },
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
  console.log(`[build] watching (v${version})…`);
} else {
  await esbuild.build(options);
  console.log(`[build] done (v${version})`);
}
