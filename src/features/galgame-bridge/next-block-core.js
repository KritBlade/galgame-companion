// galgame-companion · next-block-core — does this genre HAVE a manual advance, what does its chip
// look like, what is the flag now, and what sets it. v0.3
//
// WHY THIS FILE EXISTS (L6). next-block.js reaches topWindow, walks iframes and installs a
// MutationObserver, so no test can open it — and the defect that created this file lived exactly
// there: the chip's existence was decided ONCE at boot, when the engine had not loaded yet, so every
// session resolved to the default profile and School's control never appeared (live 2026-08-19).
// The decision is small and pure, so it belongs here where a test can hold it; the bridge is left
// with only the parts that genuinely need a document.
//
// THE RULE THIS FILE ENCODES: a control exists iff the genre profile names a BINDABLE PATH for it.
// Not "iff the profile has an advanceControl key" — a profile carrying a control with no usable path
// would render a checkbox that writes nowhere, which reads to a player as a dead button rather than
// as a missing feature. Null means the same thing in both directions: render nothing.

import { escapeHtml } from './html-escape-core.js';

export const WRAP_CLASS = 'school-nextblock';
export const CB_CLASS = 'school-nextblock-cb';
export const LABEL_CLASS = 'school-nextblock-label';
// Which path the rendered chip is currently driving. Stamped on the element so a chip left over from
// another genre can be RECOGNISED as stale rather than assumed current — the same latching mistake
// this module already made once, one layer down.
export const PATH_ATTR = 'data-advance-path';

// Wording for a genre that names a path but no words. Generic on purpose — a genre that advances
// something other than a time block must not inherit another genre's vocabulary.
const DEFAULT_LABEL = 'Next';
const DEFAULT_TITLE = 'Advance to the next segment — uncheck to cancel (until you send a message)';

/**
 * The usable advance control for a genre profile, or null when this genre has none.
 *
 * Callers must treat this as a LIVE reading, not a fact to cache: the engine that decides the genre
 * loads asynchronously, so the honest answer changes from null to a control partway through a
 * session. Every caller in the bridge re-asks.
 *
 * @param {?object} genre a genre profile (see src/genre/), or null/undefined when none resolved yet
 * @returns {?{bindPath: string, label: string, title: string}}
 */
export function advanceControlFor(genre) {
  const control = genre && genre.advanceControl;
  if (!control) return null;
  const bindPath = String(control.bindPath == null ? '' : control.bindPath).trim();
  if (!bindPath) return null;   // a control that binds nothing is not a control
  const label = String(control.label == null ? '' : control.label).trim() || DEFAULT_LABEL;
  const title = String(control.title == null ? '' : control.title).trim() || DEFAULT_TITLE;
  return { bindPath, label, title };
}

/**
 * The chip's markup for one control.
 *
 * A <label> (not a <div>) so a click ANYWHERE on the chip — the word included — natively forwards to
 * the checkbox. As a bare <div> only the 16px box was clickable and the word read as dead.
 * @param {{bindPath: string, label: string, title: string}} control from advanceControlFor
 * @returns {string}
 */
export function chipHtml(control) {
  const title = escapeHtml(control.title);
  return `<label class="${WRAP_CLASS}" ${PATH_ATTR}="${escapeHtml(control.bindPath)}" title="${title}">` +
    `<span class="${LABEL_CLASS}">${escapeHtml(control.label)}</span>` +
    `<input type="checkbox" class="${CB_CLASS}" aria-label="${title}" />` +
    `</label>`;
}

/**
 * The flag's live value, read off a stat_data object at the control's path — a [value, label] pair
 * unwrapped, the same truthiness the game's own checkbox draws with. false for no state or no member.
 *
 * @param {?object} statData
 * @param {string} bindPath dotted, from advanceControlFor
 * @returns {boolean}
 */
export function flagFromStatData(statData, bindPath) {
  let cur = statData;
  for (const seg of String(bindPath || '').split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = cur[seg];
  }
  const raw = Array.isArray(cur) && cur.length >= 2 && typeof cur[1] === 'string' ? cur[0] : cur;
  return Boolean(raw);
}

// mvu-helper's published menu-action wire: the dispatcher runs the verb in the StatusMenu Engine,
// applies its patches through MVU, and replies to the sender with `<type>-result`.
export const MENU_ACTION_MESSAGE = 'mvu-statusmenu-action';

/**
 * The action that sets the flag — `setValue`, the verb the game's own checkbox posts, so the engine
 * decides what the member becomes (its label, its type) exactly as it does for a click in the menu.
 *
 * @returns {{type: string, requestId: string, action: string, args: {path: string, value: boolean, scopePath: string}}}
 */
export function flagActionRequest(bindPath, want, requestId) {
  return { type: MENU_ACTION_MESSAGE, requestId: String(requestId), action: 'setValue', args: { path: String(bindPath), value: Boolean(want), scopePath: '' } };
}
