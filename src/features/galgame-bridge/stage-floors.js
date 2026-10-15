// galgame-companion · galgame-bridge/stage-floors — which floor galgame's stage shows, and which floor is
// the newest AI reply. v0.1
//
// galgame shows one floor at a time and stamps its id on the stage (`.gal-game-container[data-mes-id]`).
// Its NEXT and its stage repaint both treat the last rendered non-user row of #chat as the newest reply
// (`$mes.nextAll('.mes[is_user!="true"]')`, upstream interaction.js and process-message.js), so the
// newest AI floor is read off those same rows, never off the chat array.
//
// Exported through the barrel: the meter panel reads the displayed floor, image-regen compares both to
// decide who repaints a regenerated backdrop, and the styled-card dismiss asks whether NEXT still has a
// later reply to move to.

import { DOC } from '../../env.js';

const STAGE_SEL = '#gal-global-overlay .gal-game-container';
const AI_ROWS_SEL = '#chat > .mes:not([is_user="true"])';

function floorNumber(raw) {
  if (raw == null || raw === '') return -1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/** The floor galgame is showing (stamped on its stage as data-mes-id), or -1 when it has not stamped one. */
export function displayedFloor() {
  const stage = DOC.querySelector(STAGE_SEL);
  return floorNumber(stage && stage.getAttribute('data-mes-id'));
}

/** The newest AI floor among the rendered chat rows, or -1 when there is none. */
export function lastAiFloor() {
  const rows = DOC.querySelectorAll(AI_ROWS_SEL);
  return rows.length ? floorNumber(rows[rows.length - 1].getAttribute('mesid')) : -1;
}
