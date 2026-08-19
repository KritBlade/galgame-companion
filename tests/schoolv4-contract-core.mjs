// tests/schoolv4-contract-core.mjs — does the card this companion drives still HAVE the paths we drive?
//
// WHY THIS EXISTS (live 2026-08-07). School v4 split its `World_Calc` catch-all into owner-scoped roots.
// Both stat_data paths hardcoded here moved with it, and NOTHING caught it:
//   • next-block queried input[data-bind-checked="World_Calc.BlockDone"] → no such element → the chip
//     logged "checkbox not found" and the Next-Block control was simply dead;
//   • image-seam wrote World_Calc.ForceImageType → setMvuVariable returns false on an unknown path,
//     which that code reads as "this card has no G4a init" and gives up PERMANENTLY, by design.
// Both degrade quietly, on the seam, in a way that looks like a card problem. The card's own build was
// green the whole time — it is self-consistent; we are the ones holding a stale copy of its schema.
//
// SO THIS IS A PLAIN MODULE, NOT ONLY A VITEST FILE. The thing that BREAKS this contract is a change in
// the CARD repo, so the card's build chain has to be able to run it too — with plain node, no vitest, no
// install. `runContractCheck()` is the whole check; the vitest file and the CLI below are two front doors
// onto it. See schoolv4-contract.test.js and the card's Tools/build.cjs step.
//
// DIRECTION OF KNOWLEDGE: this file names the card. src/ never does — the couplings it checks are
// declared by importing the constants the shipping code actually uses, so a rename in src/ can never
// leave the check testing a stale copy of itself.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schoolv4Dir } from './schoolv4-card-path.mjs';
import { SCHOOL } from '../src/genre/genre-profile-core.js';
import { FORCE_PATH } from '../src/features/image/image-seam.js';

// Fields location-time-bridge reads off stat_data.World for galgame's pills. Declared rather than
// imported: they are destructured inline (W.Location, W.Date…), not named by a constant.
// Wall* is the game's published DISPLAY clock; the pills prefer it over Date/Time (which some games
// use as a resume CURSOR). Pinned here so the card cannot drop it without this check saying so.
// Derived from the SCHOOL genre profile, never re-typed here: the profile is what the shipping code
// reads, so a field renamed there must fail this check rather than silently pass an outdated copy.
// Location/Weather are destructured inline by the pills (no constant to import), so they stay literal.
const WORLD_PILL_FIELDS = ['Location', 'Weather',
    ...new Set([...SCHOOL.clockDate, ...SCHOOL.clockWeekday, ...SCHOOL.clockTime])];

// value at a dot-path, or undefined. MVU stores #tuple fields as [value, label]; presence is what we
// check, so no unwrapping is needed.
const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * @returns {{ ran: boolean, cardDir: string, reason?: string, failures: string[], checked: string[] }}
 *   ran:false means the sibling card repo was not found — the CALLER must surface that, never treat
 *   it as a pass (that exact silence is what the sibling-path module's header is about).
 */
export function runContractCheck() {
    const cardDir = schoolv4Dir();
    const seedPath = join(cardDir, 'initmvu.json');
    const cardPath = join(cardDir, 'ArtificKoi.json');
    if (!existsSync(seedPath) || !existsSync(cardPath)) {
        return { ran: false, cardDir, reason: 'School v4 sibling repo not found (looked for ' + seedPath + ')', failures: [], checked: [] };
    }

    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    const statData = seed.stat_data || seed;
    const failures = [];
    const checked = [];

    // 1. Every path we drive must EXIST in the card's shipped seed.
    const paths = [
        [SCHOOL.advanceControl.bindPath, 'genre/school advanceControl.bindPath', 'the Next-Block chip drives this checkbox; an absent path means the chip is dead'],
        [FORCE_PATH, 'image-seam.js FORCE_PATH', 'Mvu.setMvuVariable returns false on an unknown path and the seam then gives up permanently'],
        ...WORLD_PILL_FIELDS.map((f) => ['World.' + f, 'location-time-bridge.js pills', "galgame's location/time pills read this"]),
    ];
    for (const [path, owner, why] of paths) {
        checked.push(path + '  (' + owner + ')');
        if (at(statData, path) === undefined) {
            failures.push(`${path} — declared by ${owner} — is NOT in the card's initmvu.json. ${why}.`);
        }
    }

    // 2. THE SHARPER ONE. next-block does not read SCHOOL.advanceControl.bindPath from stat_data; it finds the stat-menu's
    //    checkbox by exactly `input[data-bind-checked="<SCHOOL.advanceControl.bindPath>"]` and clicks it. A path can be
    //    present in the seed and still not be RENDERED as a checkbox — which fails the same way, so
    //    assert against the built card, the artifact that actually ships.
    const card = JSON.parse(readFileSync(cardPath, 'utf8'));
    const menus = ((card.data && card.data.extensions && card.data.extensions.regex_scripts) || [])
        .filter((rs) => typeof rs.replaceString === 'string' && rs.replaceString.includes('VARIABLE_UPDATE_ENDED'));
    const selector = `data-bind-checked="${SCHOOL.advanceControl.bindPath}"`;
    checked.push(selector + '  (next-block.js findRealCb selector, vs the BUILT card)');
    if (!menus.length) {
        failures.push('no stat-menu regex script found in the built card — has the card layout changed?');
    } else if (!menus.some((rs) => rs.replaceString.includes(selector))) {
        failures.push(`the built card renders no \`${selector}\` — next-block's findRealCb would return null and the chip would log "checkbox not found".`);
    }

    return { ran: true, cardDir, failures, checked };
}

// ── CLI front door: `node tests/schoolv4-contract-core.mjs` ──────────────────
// Exit 0 = contract holds (or the card is absent, which is not OUR failure — but say so).
// Exit 1 = a coupling is stale. Used by the card repo's build chain, which has no vitest.
if (process.argv[1] && process.argv[1].endsWith('schoolv4-contract-core.mjs')) {
    const r = runContractCheck();
    if (!r.ran) {
        console.log('[schoolv4-contract] SKIPPED — ' + r.reason);
        process.exit(0);
    }
    if (r.failures.length) {
        console.error('[schoolv4-contract] STALE — galgame-companion drives ' + r.failures.length + ' path(s) this card no longer has:');
        for (const f of r.failures) console.error('  ✗ ' + f);
        console.error('  card: ' + r.cardDir);
        process.exit(1);
    }
    console.log('[schoolv4-contract] OK — ' + r.checked.length + ' coupling(s) still match ' + r.cardDir);
}
