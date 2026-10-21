// galgame-defaults tests — the setup wizard opt-out. v0.1
//
// galgame pops its setup wizard by itself for a player whose image library is empty, unless its own
// "don't auto-show again" key holds '1'. The companion writes that '1' on every start, outside the
// seed-version gate, so a converged install gets it too and no reload is ever needed for it.
// Outside a browser env.js's topWindow is globalThis, so the stores are stubbed there.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const OPTOUT_KEY = 'galgame-ui-plugin_setup_wizard_optout';
const SEED_FLAG_KEY = 'galgame-companion_seed_version';
const SETTINGS_KEY = 'galgame-ui-plugin_settings';

function memoryStore(initial = {}, { failOn } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { if (k === failOn) throw new Error('quota'); data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

const saved = {};
function stubGlobal(name, value) {
  saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

async function startWith(local, session = memoryStore()) {
  stubGlobal('localStorage', local);
  stubGlobal('sessionStorage', session);
  vi.resetModules();
  const { startGalgameDefaults } = await import('../src/app/galgame-defaults.js');
  startGalgameDefaults();
}

describe('startGalgameDefaults — setup wizard opt-out', () => {
  beforeEach(() => { delete globalThis.__galgame_init_lock__; });
  afterEach(() => {
    for (const [name, desc] of Object.entries(saved)) {
      if (desc) Object.defineProperty(globalThis, name, desc); else delete globalThis[name];
      delete saved[name];
    }
  });

  it('MUTATION TARGET — a converged install, which the seed skips, still gets the opt-out', async () => {
    const local = memoryStore({ [SEED_FLAG_KEY]: '999' });
    await startWith(local);
    expect(local.getItem(OPTOUT_KEY)).toBe('1');
    expect(local.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('a first install gets the opt-out and the seed, with galgame not started yet', async () => {
    const local = memoryStore();
    await startWith(local);
    expect(local.getItem(OPTOUT_KEY)).toBe('1');
    expect(JSON.parse(local.getItem(SETTINGS_KEY)).bgImageSource).toBe('chatu8');
  });

  it('an opt-out that cannot be written is warned about and the seed still runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const local = memoryStore({}, { failOn: OPTOUT_KEY });
    await startWith(local);
    expect(local.getItem(OPTOUT_KEY)).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[1]).includes('setup wizard opt-out'))).toBe(true);
    expect(JSON.parse(local.getItem(SETTINGS_KEY)).bgImageSource).toBe('chatu8');
    warn.mockRestore();
  });
});
