// galgame-companion · galgame-bridge/meter-panel-core — what the live meter panel shows. v0.1
//
// PURE (no host imports; tested by tests/meter-panel-core.test.js). The panel's whole decision is
// here: whether it is drawn at all, which roster members get a group, what each bar reads and how
// full it is, and the markup. meter-panel.js keeps only the parts that need a document — which floor
// to read, when to redraw, where to put it.
//
// GENRE-BLIND. Nothing here knows a field. The profile (src/genre/<name>/) declares the gate path,
// the roots, the bar paths, their scales and colours; this file walks paths it is handed. School's
// intimacy meters are one instance of the shape, not the contract.

import { mvuVal } from './location-time-core.js';
import { escapeHtml } from './html-escape-core.js';

export const PANEL_CLASS = 'companion-meters';
export const GROUP_CLASS = 'companion-meter-group';
export const TITLE_CLASS = 'companion-meter-title';
export const BAR_CLASS = 'companion-meter';
export const LABEL_CLASS = 'companion-meter-label';
export const VALUE_CLASS = 'companion-meter-value';
export const TRACK_CLASS = 'companion-meter-track';
export const FILL_CLASS = 'companion-meter-fill';
// What the drawn panel currently shows, stamped on it so a redraw can tell "same values" from "moved"
// without diffing the DOM — the stage rebuilds constantly, and most rebuilds change no meter.
export const SIGNATURE_ATTR = 'data-meter-signature';

// The only shapes a profile colour may take. A colour reaches an inline style attribute, so anything
// that is not plainly a colour is refused rather than trusted.
const RE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\))$/i;
const DEFAULT_COLOR = '#9ca3af';

// Walk a dotted path under `root`, unwrapping MVU's [value, label] tuple at the end. undefined when
// any segment is missing — the caller decides what an absent field means.
function readPath(root, path) {
  const segments = String(path == null ? '' : path).split('.').filter(Boolean);
  let node = root;
  for (const segment of segments) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[segment];
  }
  return mvuVal(node);
}

function finiteNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// One bar's reading. A missing or non-numeric value draws as 0 and a missing scale as 100, and each
// is REPORTED through onError so the host can say which path the game did not provide — a bar that
// silently sat at 0 would read as "she has no energy", not "this field does not exist".
function readBar(node, bar, where, onError) {
  const rawValue = readPath(node, bar.path);
  let value = finiteNumber(rawValue);
  if (value === null) {
    onError(`meter "${bar.label}": ${where}.${bar.path} is ${rawValue === undefined ? 'absent' : 'not a number'} — drawn as 0`);
    value = 0;
  }
  let max;
  if (bar.maxPath) {
    const rawMax = readPath(node, bar.maxPath);
    max = finiteNumber(rawMax);
    if (max === null || max <= 0) {
      onError(`meter "${bar.label}": ${where}.${bar.maxPath} is ${rawMax === undefined ? 'absent' : 'not a positive number'} — scale drawn as 100`);
      max = 100;
    }
  } else {
    max = finiteNumber(bar.max);
    if (max === null || max <= 0) {
      onError(`meter "${bar.label}": the profile declares no usable max — scale drawn as 100`);
      max = 100;
    }
  }
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const color = RE_COLOR.test(String(bar.color || '')) ? String(bar.color) : DEFAULT_COLOR;
  return { key: String(bar.key || bar.path), label: String(bar.label || bar.path), value, max, pct, color };
}

/**
 * The panel's content for one reading of state, or null when nothing is to be drawn — no profile
 * spec, no state, or the spec's gate path does not read `true`.
 *
 * @param {*} statData the live stat_data object
 * @param {?object} spec the genre profile's `meterPanel` (see genre-profile-core's MeterPanel typedef)
 * @param {(message: string) => void} [onError] told about every field the game did not provide
 * @returns {?{player: ?{label: string, bars: object[]}, cast: {key: string, name: string, bars: object[]}[]}}
 */
export function meterPanelModel(statData, spec, onError = () => {}) {
  if (!spec || !statData || typeof statData !== 'object') return null;
  if (spec.showWhen && readPath(statData, spec.showWhen) !== true) return null;

  let player = null;
  if (spec.player && spec.player.root) {
    const node = statData[spec.player.root];
    if (node && typeof node === 'object') {
      player = {
        label: String(spec.player.label || spec.player.root),
        bars: (spec.player.bars || []).map((bar) => readBar(node, bar, spec.player.root, onError)),
      };
    } else {
      onError(`meter panel: ${spec.player.root} is absent from stat_data — the player's bars are not drawn`);
    }
  }

  const cast = [];
  if (spec.cast && spec.cast.root) {
    const roster = statData[spec.cast.root];
    if (roster && typeof roster === 'object') {
      for (const key of Object.keys(roster)) {
        const member = roster[key];
        if (!member || typeof member !== 'object') continue;
        if (readPath(member, spec.cast.presentPath) !== true) continue;
        const rawName = readPath(member, spec.cast.namePath);
        const name = String(rawName == null ? '' : rawName).trim() || key;
        cast.push({ key, name, bars: (spec.cast.bars || []).map((bar) => readBar(member, bar, `${spec.cast.root}.${key}`, onError)) });
      }
    } else {
      onError(`meter panel: ${spec.cast.root} is absent from stat_data — no cast bars are drawn`);
    }
  }

  if (!player && !cast.length) return null;
  return { player, cast };
}

/**
 * A compact fingerprint of everything the panel would draw. Equal fingerprints mean the drawn panel
 * is already current.
 * @param {object} model from meterPanelModel
 * @returns {string}
 */
export function modelSignature(model) {
  const bars = (list) => list.map((b) => `${b.key}=${b.value}/${b.max}`).join(',');
  const groups = [];
  if (model.player) groups.push(`${model.player.label}:${bars(model.player.bars)}`);
  for (const member of model.cast) groups.push(`${member.key}:${member.name}:${bars(member.bars)}`);
  return groups.join('|');
}

function barHtml(bar) {
  return `<div class="${BAR_CLASS}" data-meter="${escapeHtml(bar.key)}">` +
    `<span class="${LABEL_CLASS}">${escapeHtml(bar.label)}</span>` +
    `<span class="${VALUE_CLASS}">${escapeHtml(bar.value)}/${escapeHtml(bar.max)}</span>` +
    `<div class="${TRACK_CLASS}"><div class="${FILL_CLASS}" style="width:${bar.pct}%;background:${escapeHtml(bar.color)}"></div></div>` +
    `</div>`;
}

function groupHtml(title, bars) {
  return `<div class="${GROUP_CLASS}"><div class="${TITLE_CLASS}">${escapeHtml(title)}</div>${bars.map(barHtml).join('')}</div>`;
}

/**
 * The panel's markup. Display only: the stage advances on click, so the host styles this
 * pointer-events:none and nothing here is interactive.
 * @param {object} model from meterPanelModel
 * @returns {string}
 */
export function panelHtml(model) {
  const groups = [];
  if (model.player) groups.push(groupHtml(model.player.label, model.player.bars));
  for (const member of model.cast) groups.push(groupHtml(member.name, member.bars));
  return `<div class="${PANEL_CLASS}" ${SIGNATURE_ATTR}="${escapeHtml(modelSignature(model))}">${groups.join('')}</div>`;
}
