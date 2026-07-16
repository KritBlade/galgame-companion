// galgame-companion dev server — static file server WITH CORS headers. v0.1
// Tavern Helper loads scripts via ES `import 'url'` from its srcdoc iframe → the fetch is
// cross-origin and NEEDS Access-Control-Allow-Origin (a plain `python -m http.server`
// fails silently there). Mirrors galgame's own tools/dev-static-server.js.
//   node dev-server.mjs        → serves this folder on http://127.0.0.1:5500
// Pair with `node build.mjs --watch`; bump the ?v= in the import JSON to cache-bust.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teeToLog } from './dev-log.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = 5500;

// Tee server output (requests, 404s) to logs/serve.log — truncated fresh each run.
teeToLog('serve');

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-store',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    const safe = normalize(urlPath).replace(/^([/\\])+/, '').replace(/^(\.\.([/\\]|$))+/, '');
    const file = join(root, safe || 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', ...CORS });
    res.end(body);
  } catch (e) {
    // 404s are expected during dev (favicon etc.) — still log which path missed
    console.warn(`[dev-server] 404 ${req.url}: ${e.message}`);
    res.writeHead(404, CORS);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-server] serving ${root} on http://127.0.0.1:${PORT} (CORS on)`);
});
