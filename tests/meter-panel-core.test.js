// meter-panel-core unit tests — what the live meter panel draws, and when it draws nothing. v0.1
//
// The rules this file holds still: the profile's gate decides whether a panel exists at all; only
// PRESENT roster members get a group; a field the game did not provide is drawn as empty AND
// reported, never silently; and the markup escapes the one string the narrator wrote (a name).
import { describe, it, expect } from 'vitest';
import { meterPanelModel, modelSignature, panelHtml, PANEL_CLASS, SIGNATURE_ATTR } from '../src/features/galgame-bridge/meter-panel-core.js';
import { SCHOOL } from '../src/genre/genre-profile-core.js';

// A School-shaped state, MVU tuples included, with the H latch ON.
function schoolState(overrides = {}) {
  return {
    PendingState: { IntimacyActive: [true, 'Intimacy Active'] },
    Mainchar: { Energy_curr: [64, 'Current Energy'], Energy_max: [100, 'Max Energy'] },
    Classmate: {
      Mitsuki: { Name: ['Mitsuki Tachibana', 'Name'], Is_present: [true, 'Present'], Energy: [80, 'Energy'], Arousal: [55, 'Arousal'], ClimaxGauge: [30, 'Orgasm Meter'] },
      Kasumi: { Name: ['Kasumi Hino', 'Name'], Is_present: [false, 'Present'], Energy: [100, 'Energy'], Arousal: [0, 'Arousal'], ClimaxGauge: [0, 'Orgasm Meter'] },
    },
    ...overrides,
  };
}

describe('meterPanelModel — the gate', () => {
  it('draws nothing while the gate path is not literally true', () => {
    expect(meterPanelModel(schoolState({ PendingState: { IntimacyActive: [false, 'x'] } }), SCHOOL.meterPanel)).toBeNull();
    expect(meterPanelModel(schoolState({ PendingState: {} }), SCHOOL.meterPanel)).toBeNull();
    expect(meterPanelModel(schoolState({ PendingState: { IntimacyActive: ['true', 'x'] } }), SCHOOL.meterPanel)).toBeNull();
  });

  it('draws once the gate reads true — School: the H latch', () => {
    const model = meterPanelModel(schoolState(), SCHOOL.meterPanel);
    expect(model).not.toBeNull();
    expect(model.player.bars.map((b) => b.key)).toEqual(['energy']);
    expect(model.cast.map((m) => m.key)).toEqual(['Mitsuki']);
  });

  it('a profile with no gate path always draws', () => {
    const spec = { showWhen: '', player: { root: 'Mainchar', label: 'You', bars: [{ key: 'e', label: 'E', path: 'Energy_curr', max: 100, color: '#fff' }] }, cast: null };
    expect(meterPanelModel(schoolState({ PendingState: {} }), spec)).not.toBeNull();
  });

  it('no spec, no state, or nothing to draw is null', () => {
    expect(meterPanelModel(schoolState(), null)).toBeNull();
    expect(meterPanelModel(null, SCHOOL.meterPanel)).toBeNull();
    expect(meterPanelModel({ PendingState: { IntimacyActive: [true, ''] } }, SCHOOL.meterPanel, () => {})).toBeNull();
  });
});

describe('meterPanelModel — the readings', () => {
  it('reads his energy against his own max, and her three meters against 100', () => {
    const model = meterPanelModel(schoolState(), SCHOOL.meterPanel);
    expect(model.player.label).toBe('You');
    expect(model.player.bars[0]).toMatchObject({ label: 'Energy', value: 64, max: 100, pct: 64, color: '#60a5fa' });
    const her = model.cast[0];
    expect(her.name).toBe('Mitsuki Tachibana');
    expect(her.bars.map((b) => [b.label, b.value, b.pct])).toEqual([['Energy', 80, 80], ['Arousal', 55, 55], ['Climax', 30, 30]]);
  });

  it('only PRESENT members get a group, in roster order, and a blank name falls to the key', () => {
    const state = schoolState();
    state.Classmate.Kasumi.Is_present = [true, 'Present'];
    state.Classmate.Kasumi.Name = ['  ', 'Name'];
    const model = meterPanelModel(state, SCHOOL.meterPanel);
    expect(model.cast.map((m) => m.name)).toEqual(['Mitsuki Tachibana', 'Kasumi']);
  });

  it('clamps a reading to the bar — over-full and negative values never break the track', () => {
    const state = schoolState();
    state.Mainchar.Energy_curr = [140, 'x'];
    state.Classmate.Mitsuki.Arousal = [-5, 'x'];
    const model = meterPanelModel(state, SCHOOL.meterPanel);
    expect(model.player.bars[0].pct).toBe(100);
    expect(model.cast[0].bars[1].pct).toBe(0);
  });

  it('a field the game did not provide draws as 0 AND is reported by path — never silent', () => {
    const state = schoolState();
    delete state.Classmate.Mitsuki.ClimaxGauge;
    delete state.Mainchar.Energy_max;
    const said = [];
    const model = meterPanelModel(state, SCHOOL.meterPanel, (m) => said.push(m));
    expect(model.cast[0].bars[2]).toMatchObject({ value: 0, pct: 0 });
    expect(model.player.bars[0]).toMatchObject({ value: 64, max: 100 });
    expect(said.some((m) => m.includes('Classmate.Mitsuki.ClimaxGauge') && m.includes('absent'))).toBe(true);
    expect(said.some((m) => m.includes('Mainchar.Energy_max'))).toBe(true);
  });

  it('a colour that is not a colour is refused, not written into a style attribute', () => {
    const spec = { showWhen: '', player: { root: 'Mainchar', label: 'You', bars: [{ key: 'e', label: 'E', path: 'Energy_curr', max: 100, color: 'red;background:url(x)' }] } };
    const model = meterPanelModel(schoolState(), spec);
    expect(model.player.bars[0].color).toBe('#9ca3af');
  });
});

describe('modelSignature / panelHtml', () => {
  it('the signature moves with a value and holds still otherwise', () => {
    const a = modelSignature(meterPanelModel(schoolState(), SCHOOL.meterPanel));
    const b = modelSignature(meterPanelModel(schoolState(), SCHOOL.meterPanel));
    const moved = schoolState(); moved.Classmate.Mitsuki.ClimaxGauge = [31, 'x'];
    const c = modelSignature(meterPanelModel(moved, SCHOOL.meterPanel));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('the markup carries the signature, one group per side, and escapes the narrator-written name', () => {
    const state = schoolState();
    state.Classmate.Mitsuki.Name = ['<b onmouseover="x">Mitsuki</b>', 'Name'];
    const model = meterPanelModel(state, SCHOOL.meterPanel);
    const html = panelHtml(model);
    expect(html.startsWith(`<div class="${PANEL_CLASS}" ${SIGNATURE_ATTR}="`)).toBe(true);
    expect(html).not.toContain('<b onmouseover');
    expect(html).toContain('&lt;b onmouseover=&quot;x&quot;&gt;Mitsuki');
    expect(html.match(/companion-meter-group/g)).toHaveLength(2);
    expect(html).toContain('width:64%;background:#60a5fa');
    expect(html).toContain('30/100');
  });
});
