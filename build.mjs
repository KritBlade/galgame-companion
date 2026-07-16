// galgame-companion build — bundles src/ into one IIFE dist file (mirrors galgame's
// esbuild setup, minus its CSS/vendor plumbing we don't need). v0.1
//   node build.mjs           one-shot build
//   node build.mjs --watch   rebuild on change (pair with a static server for live dev)
// esbuild resolves from maker-app/node_modules (already a dependency there).

import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teeToLog } from './dev-log.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

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
const logMessages = {
  name: 'log-messages',
  setup(build) {
    build.onEnd(async (result) => {
      const { warnings = [], errors = [] } = result;
      for (const line of await esbuild.formatMessages(warnings, { kind: 'warning', color: false }))
        process.stdout.write(line);
      for (const line of await esbuild.formatMessages(errors, { kind: 'error', color: false }))
        process.stderr.write(line);
      console.log(`[build] rebuilt v${version} — ${errors.length} error(s), ${warnings.length} warning(s) @ ${new Date().toISOString()}`);
    });
  },
};

const options = {
  entryPoints: [join(root, 'src', 'index.js')],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  target: 'es2020',
  banner: { js: `// galgame-companion v${version} — built ${new Date().toISOString()}` },
  outfile: join(root, 'dist', 'galgame-companion.dist.js'),
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
