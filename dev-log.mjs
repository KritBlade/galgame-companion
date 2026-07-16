// galgame-companion dev logging — tee everything a dev process prints into logs/<name>.log,
// truncated FRESH on each run so the file always reflects the CURRENT process (never appends
// stale output from a previous run). v0.2
//
// Why patch process.stdout/stderr.write (not console.*): most output that matters — esbuild's
// warnings, Node's own messages — goes straight to the std streams, bypassing console. Patching
// the low-level writers captures those AND every console.log/warn/error. Shell redirection
// (`> logs/x.log`) was rejected: on the user's PowerShell it writes UTF-16 (mangles the Chinese
// i18n strings) and can't merge stderr cleanly. In-process is shell-agnostic and UTF-8.
//
// Two things the naive stream tee still misses, both handled below:
//   1. A fast synchronous crash exits before the async write stream flushes → empty log. Fixed by
//      writing the header SYNCHRONOUSLY (writeFileSync, truncating) so the file is durable at once,
//      then teeing via an APPEND stream.
//   2. Node prints a fatal uncaught exception directly to fd 2, bypassing the JS write patch (same
//      class of miss as esbuild's Go subprocess). Fixed by uncaughtException/unhandledRejection
//      handlers that persist the crash synchronously, echo it to the real terminal, then exit
//      non-zero — the crash is surfaced, never swallowed (project rule).

import { writeFileSync, appendFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export function teeToLog(name) {
  const dir = join(root, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.log`);

  // Keep the ORIGINAL writers to (a) still print to the real terminal and (b) report a logging
  // failure without recursing through the patched writer (which would loop forever).
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  // Synchronous truncate + header: durable immediately, so even an instant crash leaves a file.
  const header = `[dev-log] ${name} → logs/${name}.log (fresh this run)\n`;
  writeFileSync(file, header, { flag: 'w' }); // 'w' truncates = fresh every run
  origOut(header);

  // Append (header already written synchronously above). Async errors must surface — route to the
  // original stderr so they can't recurse into this same handler.
  const stream = createWriteStream(file, { flags: 'a', encoding: 'utf8' });
  stream.on('error', (e) => origErr(`[dev-log] ${name} log stream error: ${e.message}\n`));

  const tee = (orig) => (chunk, enc, cb) => {
    try {
      stream.write(chunk);
    } catch (e) {
      origErr(`[dev-log] ${name} log write failed: ${e && e.message}\n`);
    }
    return orig(chunk, enc, cb);
  };
  process.stdout.write = tee(origOut);
  process.stderr.write = tee(origErr);

  // Persist a crash the write-patch can't see, then re-surface it and preserve the non-zero exit.
  const onFatal = (label) => (err) => {
    const msg = `\n[dev-log] ${name} ${label}:\n${(err && (err.stack || err.message)) || err}\n`;
    try {
      appendFileSync(file, msg); // synchronous — guaranteed to land before we exit
    } catch (e) {
      origErr(`[dev-log] ${name} could not persist crash: ${e && e.message}\n`);
    }
    origErr(msg);
    process.exit(1);
  };
  process.on('uncaughtException', onFatal('uncaughtException'));
  process.on('unhandledRejection', onFatal('unhandledRejection'));

  // Flush the tail of a cleanly-ended watcher/server on exit.
  process.on('exit', () => { try { stream.end(); } catch (e) { origErr(`[dev-log] ${name} close failed: ${e && e.message}\n`); } });

  return file;
}
