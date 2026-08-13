// galgame-companion · background-manager — recency sort + bulk select/delete over galgame's own
// Background Manager pane. v0.1
//
// WHY THIS IS THE COMPANION'S BUG AND NOT galgame's (L7 — fix it where it hurts). galgame lists the
// library in IndexedDB key order, i.e. alphabetically by scene name, and that reads perfectly well
// for the hand-named scenes the panel was built for ("classroom", "rooftop"). The companion is what
// fills the library with MACHINE names — `{uid}_scene_{n}_{hash}` (beat-shaper §2.1), minted unique
// per generation precisely so a swipe or a re-roll can never overwrite the image it replaced. Sorted
// alphabetically those names are noise: the picture you generated ten seconds ago lands in an
// arbitrary row, and there are dozens of them. The naming is ours, so the ordering it ruins is ours
// to repair — here, over galgame's untouched panel, not by editing galgame.
//
// Two additions, both purely DOM-level over markup galgame already rendered:
//   · NEWEST FIRST — reorder the existing card nodes by each record's `lastModified`, read from the
//     library (the panel never renders that field). The card NODES are moved, never rebuilt, so
//     galgame's own click / delete / transfer handlers stay bound to them.
//   · SELECT MODE — the same unique-per-generation naming means culling is a routine chore, and
//     galgame offers one confirm dialog and one re-render PER background. Select mode gives the
//     grid checkboxes, select-all, and a single confirm + single transaction for the whole batch.
//
// Everything keys off galgame class names, so an upstream rename degrades to "the patch does not
// apply" rather than to broken chrome. New classes here use the `companion-` prefix — NOT the older
// `school-` one, which is a genre name inside a genre-blind module (see env.js SCRIPT_NAME).

import { DOC, topWindow, log, warnToast } from '../../env.js';
import { readBackgroundStamps, deleteBackgroundKeys } from './background-store.js';
import { sortSceneNamesByRecency, restatedCount } from './background-manager-core.js';

// ── galgame selectors (re-verify on an upstream bump, GCP §10.4 §5) ──
const PANE_SEL = '.gal-tab-pane[data-pane="backgrounds"]';
const GRID_SEL = '.gal-bg-grid';
const CARD_SEL = '.gal-bg-card';
const HEADER_SEL = '.gal-pane-header';
const ACTIONS_SEL = '.gal-pane-actions';
const STAT_SEL = '.gal-pane-stat';
// galgame's own button look, borrowed so our control does not read as a foreign object in its row.
// Cosmetic only: if these are renamed upstream the button still works, it just looks unstyled.
const GAL_BTN_CLASS = 'gal-action-btn gal-pane-btn';

// ── our own markers ──
const READY_CLASS = 'companion-bg-ready';       // this pane has been patched (survives nothing — galgame rebuilds the pane)
const SELECTING_CLASS = 'companion-bg-selecting';
const PICKED_CLASS = 'companion-bg-picked';
const TOGGLE_CLASS = 'companion-bg-select-toggle';
const BAR_CLASS = 'companion-bg-selectbar';
const COUNT_CLASS = 'companion-bg-selected-count';

function cardsIn(pane) { return Array.from(pane.querySelectorAll(CARD_SEL)); }
function pickedIn(pane) { return cardsIn(pane).filter((card) => card.classList.contains(PICKED_CLASS)); }
function sceneOf(card) { return card.getAttribute('data-scene') || ''; }

// ── newest first ──────────────────────────────────────────────────────────────
async function sortByRecency(pane) {
  const grid = pane.querySelector(GRID_SEL);
  if (!grid) return; // empty library — galgame renders a placeholder instead of a grid
  const stamps = await readBackgroundStamps('Background Manager recency sort');
  if (!stamps) {
    // Ungated: the panel silently keeps galgame's alphabetical order, which looks like the patch
    // simply is not installed. The reason has to be sayable.
    log.warn('background-manager: the library timestamps could not be read — the panel keeps galgame\'s alphabetical order');
    return;
  }
  const cardByScene = new Map();
  for (const card of cardsIn(pane)) cardByScene.set(sceneOf(card), card);
  const order = sortSceneNamesByRecency(Array.from(cardByScene.keys()), stamps);
  const ordered = DOC.createDocumentFragment();
  let dated = 0;
  for (const scene of order) {
    const card = cardByScene.get(scene);
    if (!card) continue;
    const at = stamps.get(scene);
    if (Number.isFinite(at)) { card.title = new Date(at).toLocaleString(); dated++; }
    ordered.appendChild(card); // MOVES the node — its bound handlers come with it
  }
  grid.appendChild(ordered);
  log.image(`background-manager: ${order.length} background(s) sorted newest-first (${dated} carried a timestamp)`);
}

// ── select mode ───────────────────────────────────────────────────────────────
function refreshSelectedCount(pane) {
  const label = pane.querySelector('.' + COUNT_CLASS);
  if (label) label.textContent = `${pickedIn(pane).length} selected`;
}

function setSelecting(pane, on) {
  pane.classList.toggle(SELECTING_CLASS, on);
  if (!on) for (const card of pickedIn(pane)) card.classList.remove(PICKED_CLASS);
  const toggle = pane.querySelector('.' + TOGGLE_CLASS);
  if (toggle) {
    const text = toggle.querySelector('span');
    if (text) text.textContent = on ? 'Exit select' : 'Select';
  }
  refreshSelectedCount(pane);
}

// Keep the header's "N background(s) saved" honest after a delete. galgame refreshes that line by
// rebuilding the whole asset panel, and none of that is reachable from here.
function restateHeader(pane) {
  const stat = pane.querySelector(STAT_SEL);
  if (!stat) return;
  stat.textContent = restatedCount(stat.textContent, cardsIn(pane).length);
}

async function deleteSelected(pane) {
  const picked = pickedIn(pane);
  if (!picked.length) return;
  const scenes = picked.map(sceneOf).filter(Boolean);
  if (scenes.length !== picked.length) {
    // A card with no data-scene is a card we cannot delete by key. Refuse the whole batch rather
    // than delete a subset the user did not choose.
    log.warn(`background-manager: ${picked.length - scenes.length} selected card(s) carry no scene name — batch delete refused`);
    warnToast('Some selected backgrounds have no scene name; nothing was deleted.');
    return;
  }
  const ok = topWindow.confirm(
    `Delete ${scenes.length} background${scenes.length === 1 ? '' : 's'}? This cannot be undone.`,
  );
  if (!ok) return;

  const deleted = await deleteBackgroundKeys(scenes, 'Background Manager batch delete');
  if (!deleted) {
    // background-store already logged the cause. The player pressed a delete button and nothing
    // happened, so this one has to be visible outside the console.
    warnToast(`Could not delete ${scenes.length} background(s) — galgame's image library did not accept the change.`);
    return;
  }
  const gone = new Set(deleted);
  for (const card of picked) if (gone.has(sceneOf(card))) card.remove();
  restateHeader(pane);
  setSelecting(pane, false);
  log.image(`background-manager: deleted ${deleted.length} background(s) from the library`);
}

function buildSelectBar(pane) {
  const bar = DOC.createElement('div');
  bar.className = BAR_CLASS;

  const count = DOC.createElement('span');
  count.className = COUNT_CLASS;
  count.textContent = '0 selected';
  bar.appendChild(count);

  const button = (label, action, extra) => {
    const el = DOC.createElement('button');
    el.type = 'button';
    el.className = GAL_BTN_CLASS + (extra ? ' ' + extra : '');
    el.dataset.companionAction = action;
    el.textContent = label;
    bar.appendChild(el);
    return el;
  };
  button('Select all', 'all');
  button('Clear', 'none');
  button('Delete selected', 'delete', 'companion-bg-danger');
  button('Done', 'done');

  bar.addEventListener('click', (event) => {
    const pressed = event.target.closest('[data-companion-action]');
    if (!pressed) return;
    event.stopPropagation();
    switch (pressed.dataset.companionAction) {
      case 'all':
        for (const card of cardsIn(pane)) card.classList.add(PICKED_CLASS);
        refreshSelectedCount(pane);
        break;
      case 'none':
        for (const card of pickedIn(pane)) card.classList.remove(PICKED_CLASS);
        refreshSelectedCount(pane);
        break;
      case 'delete':
        deleteSelected(pane).catch((e) => log.warn('background-manager: batch delete rejected:', e));
        break;
      case 'done':
        setSelecting(pane, false);
        break;
      default:
        break;
    }
  });
  return bar;
}

function bindCardPicking(pane) {
  const grid = pane.querySelector(GRID_SEL);
  if (!grid) return;
  // CAPTURE phase, and stopPropagation, because galgame's lightbox is a jQuery handler delegated on
  // the modal (bubble phase): stopping the event on the way DOWN is what keeps a selection click
  // from also opening a full-screen preview of the picture. It equally blocks the card's own
  // delete/transfer buttons — which is why select mode hides them (style.js) rather than leaving two
  // controls on screen where one of them silently does nothing.
  grid.addEventListener('click', (event) => {
    if (!pane.classList.contains(SELECTING_CLASS)) return;
    const card = event.target.closest(CARD_SEL);
    if (!card || !grid.contains(card)) return;
    event.preventDefault();
    event.stopPropagation();
    card.classList.toggle(PICKED_CLASS);
    refreshSelectedCount(pane);
  }, true);
}

function patchPane(pane) {
  if (pane.classList.contains(READY_CLASS)) return;
  pane.classList.add(READY_CLASS); // BEFORE the await below — a second observer tick must not re-enter

  const actions = pane.querySelector(HEADER_SEL + ' ' + ACTIONS_SEL);
  if (actions) {
    const toggle = DOC.createElement('button');
    toggle.type = 'button';
    toggle.className = `${GAL_BTN_CLASS} ${TOGGLE_CLASS}`;
    toggle.innerHTML = '<i class="fa-solid fa-square-check"></i> <span>Select</span>';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setSelecting(pane, !pane.classList.contains(SELECTING_CLASS));
    });
    actions.insertBefore(toggle, actions.firstChild);
    const header = pane.querySelector(HEADER_SEL);
    if (header && header.parentNode) header.parentNode.insertBefore(buildSelectBar(pane), header.nextSibling);
  } else {
    // Sorting still applies; only the bulk controls are lost. Say which half is missing.
    log.warn(`background-manager: no "${ACTIONS_SEL}" in the backgrounds pane — select mode not injected (galgame markup drift?)`);
  }

  bindCardPicking(pane);
  sortByRecency(pane).catch((e) => log.warn('background-manager: recency sort rejected:', e));
}

export function startBackgroundManager() {
  if (!DOC || !DOC.body) return setTimeout(startBackgroundManager, 200);
  // galgame builds the asset panel fresh on every open (and rebuilds it after its own single delete
  // / transfer), so the pane we patched is thrown away and a new one arrives — hence a standing
  // observer rather than a one-shot patch. rAF-batched like the other companion observers.
  let scheduled = false;
  const patchAll = () => {
    for (const pane of DOC.querySelectorAll(`${PANE_SEL}:not(.${READY_CLASS})`)) patchPane(pane);
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; patchAll(); });
  });
  observer.observe(DOC.body, { childList: true, subtree: true });
  patchAll();
  log.image('background-manager active');
}
