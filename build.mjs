// galgame-companion build — bundles src/ into one IIFE dist file (mirrors galgame's
// esbuild setup, minus its CSS/vendor plumbing we don't need). v0.1
//   node build.mjs           one-shot build
//   node build.mjs --watch   rebuild on change (pair with a static server for live dev)
// esbuild resolves from maker-app/node_modules (already a dependency there).

import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// version from src/env.js (single source of truth)
const envSrc = readFileSync(join(root, 'src', 'env.js'), 'utf8');
const version = (envSrc.match(/VERSION = '([^']+)'/) || [])[1] || '0.0';

const options = {
  entryPoints: [join(root, 'src', 'index.js')],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  target: 'es2020',
  banner: { js: `// galgame-companion v${version} — built ${new Date().toISOString()}` },
  outfile: join(root, 'dist', 'galgame-companion.dist.js'),
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`[build] watching (v${version})…`);
} else {
  await esbuild.build(options);
  console.log(`[build] done (v${version})`);
}
