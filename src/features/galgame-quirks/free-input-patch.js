// galgame-companion · free-input-patch — galgame's free-input pop-up: Enter writes a new line, and only
// the ✕ closes it.
//
// The decisions are free-input-patch-core.js; this file only attaches them. Both listeners are CAPTURE
// listeners on the document, so they run before galgame's own handlers, which sit on the textarea and
// on the modal element themselves: stopping propagation here means galgame never sees that event.
//   • keydown — a plain Enter never reaches galgame's send handler; no preventDefault, so the browser
//     inserts the new line as usual.
//   • click   — a click on the backdrop never reaches galgame's close handler (nor anything behind the
//     pop-up); clicks on the ✕, the Send button and the textarea have other targets and pass untouched.
// The text colour is fixed in app/style.js (#gal-free-input-modal .gal-input-field).

import { DOC, log } from '../../env.js';
import { isFreeInputNewline, isFreeInputBackdropClick } from './free-input-patch-core.js';

export function startFreeInputPatch() {
  if (!DOC) { log.warn('free-input-patch: no parent document — skipping'); return; }
  DOC.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!isFreeInputNewline({ key: e.key, targetId: target && target.id, ctrlKey: e.ctrlKey, metaKey: e.metaKey })) return;
    e.stopPropagation();
  }, true);
  DOC.addEventListener('click', (e) => {
    const target = e.target;
    if (!isFreeInputBackdropClick({ targetId: target && target.id })) return;
    e.stopPropagation();
  }, true);
  log.info('free-input-patch active (Enter = new line, Ctrl+Enter = send, only the ✕ closes)');
}
