// tests/schoolv4-card-path.mjs — locate the sibling School v4 card repo. TEST/CHECK SCOPE ONLY.
//
// ⚠ NOTHING UNDER src/ MAY IMPORT THIS. galgame-companion ships to users as a Tavern-Helper script
// and never reads a repo directory at runtime; this exists so the contract check can find the card on
// OUR machines. It is the same file, for the same reason, as mvu-helper's tests/schoolv4-bundle-path.mjs.
//
// WHY THE LIST AND NOT ONE PATH (borrowed lesson, mvu-helper 2026-08-03): that repo hardcoded a single
// folder name, the office checkout is called MVU_Game_Maker-dev, so `haveCard` was false and the only
// suites that touched the real card SKIPPED — 379 passed instead of 385, no failure, no mention of what
// was skipped. A check that silently does not run is worse than no check, so: try every known name, and
// make "not found" VISIBLE (see the always-on test in schoolv4-contract.test.js).
//
// Order matters: first match wins, so the newest/most-specific name is checked first.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Extend this list rather than editing a path inside a check — that is how the name got pinned to one
// machine in the first place.
const REPO_NAMES = [
    'MVU_Game_Maker-dev',   // OFFICE
    'MVU_Game_Maker',
    'MvuGameMaker',         // HOME
];

const SUBPATH = join('maker-app', 'GameLogic', 'Schoolv4');
const SIBLINGS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Absolute path to the sibling School v4 folder, or the first candidate when none exist (so the
 * caller's own existsSync checks fail normally instead of throwing).
 * Override with MVU_GAME_MAKER_DIR=<path to the repo root>.
 */
export function schoolv4Dir() {
    const override = process.env.MVU_GAME_MAKER_DIR;
    if (override) return join(override, SUBPATH);
    for (const name of REPO_NAMES) {
        const dir = join(SIBLINGS, name, SUBPATH);
        if (existsSync(dir)) return dir;
    }
    return join(SIBLINGS, REPO_NAMES[0], SUBPATH);
}
