// galgame-companion dev launcher — watch build + static server from one command. v0.3
//   npm start    watch build AND serve on http://127.0.0.1:5500   (Ctrl+C stops both)
//   npm stop     stop them — works from ANY terminal, not just the one that started it
// Edits rebuild on save. Restart only for what a rebuild can't pick up (see below).
//
// `npm run dev` alone is ONLY the watcher — it starts no server, so nothing is hosted and the
// Tavern Helper import from 127.0.0.1:5500 fails. `npm run serve` alone serves whatever dist/ last
// held. Both halves are needed; this runs them together.
//
// They are concurrent, not sequential: `build.mjs --watch` never returns, so nothing can be
// sequenced after it. But not simultaneous either — the server comes up only after the watcher's
// FIRST build, because a request arriving before that gets whatever dist/ held before, and on a
// fresh clone that is a 404 which reads as a broken server rather than a build still running.
//
// The server runs in THIS process (dev-server.mjs listens on import); only the watcher is a child.
// So there are exactly two pids, both recorded — no process tree to walk, and no orphan left
// holding the port because a tree kill missed a level.
//
// Restart (npm stop; npm start) for what a rebuild cannot see: a package.json version bump
// (build.mjs reads it once at module load, so a watch rebuild keeps stamping the OLD version), and
// edits to build.mjs or dev-server.mjs themselves.

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = 5500; // must match dev-server.mjs
const pidFile = join(root, 'logs', 'dev-launcher.pid');

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); }); // EXPECTED: refused = free
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

// process.kill() only REQUESTS the kill — it returns before the OS has torn the process down and
// released its listening socket. Probing the port once, immediately after, reports "still serving"
// on a stop that in fact worked (observed live). Poll until the port actually frees instead: a stop
// that succeeds while announcing failure is worse than announcing nothing.
async function waitForPortFree(port, timeoutMs = 3000, stepMs = 100) {
  for (let waited = 0; waited < timeoutMs; waited += stepMs) {
    if (!(await isPortInUse(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return !(await isPortInUse(port));
}

function removePidFile() {
  try {
    if (existsSync(pidFile)) unlinkSync(pidFile);
  } catch (e) {
    console.warn(`[dev-launcher] could not remove ${pidFile}:`, e.message);
  }
}

function killPid(label, pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    console.warn(`[dev-launcher] ${pidFile} has no usable ${label} pid — not killing anything for it.`);
    return false;
  }
  try {
    process.kill(pid);
    return true;
  } catch (e) {
    // ESRCH just means that half already died on its own — the other half still needs stopping.
    console.warn(`[dev-launcher] could not stop ${label} (pid ${pid}):`, e.message);
    return false;
  }
}

// A pid file outlives the process that wrote it — a crash or a hard kill leaves one pointing at a
// pid the OS is free to hand to something else. So the pids ALONE never authorize a kill: the port
// must also be in use. Recorded pids + occupied port together mean our processes are the ones
// running; either on its own is a state to report, not to act on.
async function stopRunningServer() {
  const isServing = await isPortInUse(PORT);

  if (!existsSync(pidFile)) {
    if (isServing) {
      console.error(`[dev-launcher] port ${PORT} is serving, but there is no ${pidFile} — that server was not started by npm start, so npm stop will not kill it. Stop it in its own terminal (Ctrl+C).`);
      return 1;
    }
    console.log('[dev-launcher] nothing to stop — no server is running.');
    return 0;
  }

  let pids;
  try {
    pids = JSON.parse(readFileSync(pidFile, 'utf8'));
  } catch (e) {
    console.error(`[dev-launcher] could not read ${pidFile} (${e.message}) — refusing to kill anything. Delete it and stop the processes in their own terminal.`);
    return 1;
  }

  if (!isServing) {
    removePidFile();
    console.log(`[dev-launcher] nothing to stop — port ${PORT} is free. Removed the stale pid file (launcher ${pids.launcher}, watch build ${pids.watchBuild}).`);
    return 0;
  }

  // Launcher FIRST. It watches its child and reports the child's death as a failure ("watch build
  // exited — stopping the server too"), which is true for a crash and a lie for a stop the user
  // asked for. Killing the launcher first means there is nobody left to mis-report the second kill.
  killPid('launcher/server', pids.launcher);
  killPid('watch build', pids.watchBuild);
  removePidFile();

  if (!(await waitForPortFree(PORT))) {
    console.error(`[dev-launcher] killed the recorded pids, but port ${PORT} is STILL serving — something else is on it.`);
    return 1;
  }
  console.log(`[dev-launcher] stopped (launcher/server ${pids.launcher}, watch build ${pids.watchBuild}); port ${PORT} is free.`);
  return 0;
}

if (process.argv.includes('--stop')) {
  process.exit(await stopRunningServer());
}

if (await isPortInUse(PORT)) {
  console.error(`[dev-launcher] port ${PORT} is already serving — run npm stop first (or Ctrl+C in the terminal that started it).`);
  process.exit(1);
}

// `node build.mjs --watch`, not `npm run dev`: same script, minus an npm wrapper process between
// us and the pid we record.
const watchBuild = spawn(process.execPath, [join(root, 'build.mjs'), '--watch'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
watchBuild.stdout.on('data', (chunk) => process.stdout.write(chunk));
watchBuild.stderr.on('data', (chunk) => process.stderr.write(chunk));
watchBuild.on('error', (e) => {
  console.error('[dev-launcher] watch build failed to start:', e);
  process.exit(1);
});
watchBuild.on('exit', (code, signal) => {
  // A live server on a dead watcher is the worst of both: it keeps serving happily while silently
  // no longer tracking edits, so every save looks like it did nothing.
  console.error(`[dev-launcher] watch build exited (code ${code}, signal ${signal}) — stopping the server too, rather than serve a bundle that no longer follows your edits.`);
  process.exit(code === 0 ? 1 : (code ?? 1));
});

process.on('exit', () => {
  removePidFile();
  try {
    if (watchBuild.exitCode === null && watchBuild.signalCode === null) watchBuild.kill();
  } catch (e) {
    console.warn('[dev-launcher] could not stop the watch build:', e.message);
  }
});
process.on('SIGINT', () => process.exit(0));  // Ctrl+C → 'exit' handler kills the watcher, clears the pid file
process.on('SIGTERM', () => process.exit(0));

// build.mjs prints this from its esbuild onEnd, on EVERY build — failing ones included. Gating on
// the line rather than on "0 error(s)" is deliberate: a failing build should still bring the server
// up, so the errors are visible in the browser console instead of leaving you with no server at all.
await new Promise((resolve) => {
  const onData = (chunk) => {
    if (!/\[build\] rebuilt/.test(String(chunk))) return;
    watchBuild.stdout.off('data', onData);
    resolve();
  };
  watchBuild.stdout.on('data', onData);
});

mkdirSync(dirname(pidFile), { recursive: true });
writeFileSync(pidFile, JSON.stringify({ launcher: process.pid, watchBuild: watchBuild.pid }));

// Starts listening on import (its listen() call is top-level), so this process IS the server.
await import('./dev-server.mjs');
