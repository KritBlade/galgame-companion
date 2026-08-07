// The vitest front door onto the School v4 contract check. The check itself is in
// schoolv4-contract-core.mjs so the CARD's build chain can run it with plain node — read that file's
// header for why this exists at all.
//
// NOTE THE SHAPE: there is no describe.skipIf here. A skip is invisible in a pass count, and an
// invisible skip is exactly how mvu-helper lost these suites for weeks. Instead the first test ALWAYS
// runs and names whether the card was found, so `npm test` output says which mode it ran in.

import { describe, it, expect } from 'vitest';
import { runContractCheck } from './schoolv4-contract-core.mjs';

const result = runContractCheck();

describe('School v4 contract — the card still has the paths this companion drives', () => {
    it(result.ran
        ? `RAN against ${result.cardDir}`
        : `SKIPPED — ${result.reason} (this is a machine setup gap, not a pass)`, () => {
        // Always green: its NAME is the report. A contributor without the card repo still sees, in the
        // verbose reporter, that the contract went unchecked rather than that it held.
        expect(typeof result.ran).toBe('boolean');
    });

    it.skipIf(!result.ran)('every hardcoded stat_data path still exists in the card', () => {
        expect(result.failures).toEqual([]);
    });

    it.skipIf(!result.ran)('checks a non-zero number of couplings (a check of nothing is not a pass)', () => {
        expect(result.checked.length).toBeGreaterThan(5);
    });
});
