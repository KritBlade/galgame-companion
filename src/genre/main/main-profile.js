// galgame-companion · genre/main — the ORDINARY game's profile. v0.1
//
// The profile every engine this companion has never heard of resolves to, and the one a card with no
// engine at all gets (genre-profile-core.js says why the default must be the plain one). A plain World
// clock, no manual advance, no live meters: nothing here is a game's invented field, so nothing here
// can be wrong for a game that simply has less than School.

export const MAIN = Object.freeze({
  name: 'main',
  clockDate: Object.freeze(['Date']),
  clockWeekday: Object.freeze(['Weekday']),
  clockTime: Object.freeze(['Time']),
  advanceControl: null,
  meterPanel: null,
});
