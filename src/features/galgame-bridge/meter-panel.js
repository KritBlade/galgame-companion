// galgame-companion · meter-panel — the genre profile's live bars, drawn over galgame's stage. v0.2
//
// GENRE-GATED, like next-block. Which bars exist, what they read and when the panel shows at all
// come from the active genre profile (src/genre/<name>/ — School declares its intimacy meters there);
// a genre that declares none renders nothing. The decision itself is pure and lives in
// meter-panel-core.js; this file only knows which floor to read, when to redraw and where to put it.
//
// THE GENRE IS NOT KNOWABLE AT BOOT (next-block.js says why in full): the engine that names the genre
// loads on chat load, long after this script. So nothing here latches the genre — every redraw
// re-asks, and a panel a previous genre left behind is removed on the next one.
//
// WHICH FLOOR. galgame shows one floor at a time and stamps its id on the stage (data-mes-id); the
// bars read the newest stat_data AT OR BELOW that floor, so a player reading back through the chat
// sees the meters as they stood, and a reply still streaming (no stat_data yet) shows the floor
// before it until the resolver saves. No stamp → the newest floor.
//
// WHEN. State moves when a reply lands and the resolver saves (MESSAGE_UPDATED and friends), when MVU
// finishes a variable pass, and when galgame moves to another floor or rebuilds its stage (a body
// mutation). Every trigger funnels into one rAF-batched redraw that fingerprints what it would draw
// and touches the DOM only when a value actually moved.
//
// DISPLAY ONLY. The stage advances on click; the panel is pointer-events:none (style.js) so it can
// never eat one.

import { DOC, log } from '../../env.js';
import { activeGenre } from '../../genre/index.js';
import { latestStatData } from './live-stat-data.js';
import { meterPanelModel, panelHtml, PANEL_CLASS, SIGNATURE_ATTR } from './meter-panel-core.js';

const OVERLAY_SEL = '#gal-global-overlay';
const STAGE_SEL = '#gal-global-overlay .gal-game-container';
// MVU's own "a variable pass finished" event name (MagVarUpdate variable_def.ts, emitted through
// Tavern-Helper's event bus so it reaches this iframe). A literal because Mvu.events is not attached
// to the top window yet when this starts.
const MVU_UPDATE_ENDED = 'mag_variable_update_ended';

// The floor galgame is showing (stamped on its stage as data-mes-id), or -1 when it has not stamped one.
// Exported through the barrel: image-regen asks the same question of the same stamp.
export function displayedFloor() {
  const stage = DOC.querySelector(STAGE_SEL);
  const raw = stage && stage.getAttribute('data-mes-id');
  if (raw == null || raw === '') return -1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

// A field the game did not provide is said once per session, not once per redraw — the redraw runs
// on every stage mutation, and the same missing path would otherwise fill the console.
const reported = new Set();
function reportOnce(message) {
  if (reported.has(message)) return;
  reported.add(message);
  log.warn('meter-panel: ' + message);
}

let shown = false;

function redraw() {
  const overlay = DOC.querySelector(OVERLAY_SEL);
  if (!overlay) return;
  const spec = activeGenre().meterPanel;
  const existing = overlay.querySelector(`.${PANEL_CLASS}`);
  if (!spec) {
    if (existing) { existing.remove(); log.info('meter-panel: this genre declares no meters — panel removed'); }
    shown = false;
    return;
  }
  const from = displayedFloor();
  const found = latestStatData(from >= 0 ? { from } : {});
  const model = found ? meterPanelModel(found.statData, spec, reportOnce) : null;
  if (!model) {
    if (existing) existing.remove();
    if (shown) { shown = false; log.info(`meter-panel: hidden — ${spec.showWhen || 'nothing'} no longer reads true`); }
    return;
  }
  const html = panelHtml(model);
  const signature = /data-meter-signature="([^"]*)"/.exec(html);
  if (existing && signature && existing.getAttribute(SIGNATURE_ATTR) === signature[1]) return;
  if (existing) existing.outerHTML = html;
  else overlay.insertAdjacentHTML('beforeend', html);
  if (!shown) {
    shown = true;
    log.info(`meter-panel: shown for genre "${activeGenre().name}" (${spec.showWhen} reads true on floor ${found.floor}) — ` +
      `${model.player ? 1 : 0} player group, ${model.cast.length} cast group(s)`);
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    try { redraw(); } catch (e) { log.error('meter-panel: redraw failed:', e); }
  });
}

export function startMeterPanel() {
  if (!DOC || !DOC.body) return setTimeout(startMeterPanel, 200);

  // State-change triggers. The stage mutation below already covers most of them, but a resolver save
  // that repaints nothing galgame owns would otherwise go unseen until the next stage rebuild.
  const te = window.tavern_events || {};
  const names = [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED, te.MESSAGE_SWIPED, te.MESSAGE_EDITED, te.MESSAGE_DELETED, te.CHAT_CHANGED, MVU_UPDATE_ENDED];
  if (typeof window.eventOn === 'function') {
    for (const name of names) {
      if (!name) continue;
      try { window.eventOn(name, schedule); }
      catch (e) { log.warn(`meter-panel: eventOn(${name}) failed — that trigger will not redraw the bars:`, e); }
    }
  } else {
    log.warn('meter-panel: eventOn is not on this window — the bars redraw only on stage rebuilds');
  }

  // galgame rebuilds its stage on chat change and moves data-mes-id as the player reads; both are
  // body mutations. rAF-batched like next-block's watcher.
  const observer = new MutationObserver(schedule);
  observer.observe(DOC.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mes-id'] });

  schedule();
  log.info('meter-panel watching (the bars appear once a genre declaring meters is loaded and its gate reads true)');
}
