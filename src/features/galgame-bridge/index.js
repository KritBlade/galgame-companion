// features/galgame-bridge — feeds galgame's own UI from stat_data: the location/time pills and
// the Story-choices sheet through the AutoCardUpdaterAPI shim, plus the controls drawn over the
// stage from the genre profile — the manual Next-Block advance and the live meter panel.
// Internal chain: next-block -> location-time-bridge -> choices; meter-panel -> live-stat-data.
export { startChoices } from './choices.js';
export { startLocationTimeBridge } from './location-time-bridge.js';
export { startNextBlock } from './next-block.js';
export { startMeterPanel, displayedFloor } from './meter-panel.js';
// The one reader of live state — the menu host pushes it to its contained StatusMenu frame.
export { latestStatData } from './live-stat-data.js';
