// features/galgame-bridge — feeds galgame's own UI from stat_data through the
// AutoCardUpdaterAPI shim: location/time pills, the Story-choices sheet, and the manual
// Next-Block advance. Internal chain: next-block -> location-time-bridge -> choices.
export { startChoices } from './choices.js';
export { startLocationTimeBridge } from './location-time-bridge.js';
export { startNextBlock } from './next-block.js';
