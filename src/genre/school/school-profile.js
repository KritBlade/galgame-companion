// galgame-companion · genre/school — School's profile: the paths and words only School owns. v0.1
//
// Everything a School-specific control needs to know lives HERE and nowhere else in this companion.
// The features that draw these controls (galgame-bridge next-block, meter-panel) are genre-agnostic:
// they read whatever profile is live and render what it declares, so a path named below is the whole
// contract between this game and the stage. The clock half is the plain one every genre shares
// (School v4's game-time model made World.Date/Time the one display clock); what makes School a
// distinct profile is the manual block advance and the intimacy meters.

export const SCHOOL = Object.freeze({
  name: 'school',
  clockDate: Object.freeze(['Date']),
  clockWeekday: Object.freeze(['Weekday']),
  clockTime: Object.freeze(['Time']),
  advanceControl: Object.freeze({
    bindPath: 'PendingState.BlockDone',
    label: 'Next',
    title: 'Advance one time block — uncheck to cancel (until you send a message)',
  }),
  // Live bars over the stage, shown ONLY while an H scene is latched (PendingState.IntimacyActive):
  // outside one every meter sits at its resting value and the bars would only cover the artwork.
  // His side is an energy BUDGET — Energy_curr against Energy_max; each sex act drains it, and at 0
  // he must rest (School models no climax gauge for him: his release is the narrator's to write, his
  // energy is the only hard limit the engine keeps). Her side is the three meters the engine moves
  // per act; the gauge reaching 100 is what fires her climax.
  meterPanel: Object.freeze({
    showWhen: 'PendingState.IntimacyActive',
    player: Object.freeze({
      root: 'Mainchar',
      label: 'You',
      bars: Object.freeze([
        Object.freeze({ key: 'energy', label: 'Energy', path: 'Energy_curr', maxPath: 'Energy_max', color: '#60a5fa' }),
      ]),
    }),
    cast: Object.freeze({
      root: 'Classmate',
      presentPath: 'Is_present',
      namePath: 'Name',
      bars: Object.freeze([
        Object.freeze({ key: 'energy', label: 'Energy', path: 'Energy', max: 100, color: '#60a5fa' }),
        Object.freeze({ key: 'arousal', label: 'Arousal', path: 'Arousal', max: 100, color: '#f472b6' }),
        Object.freeze({ key: 'climax', label: 'Climax', path: 'ClimaxGauge', max: 100, color: '#fbbf24' }),
      ]),
    }),
  }),
});
