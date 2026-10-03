// galgame-companion · format-rule-trim — trims galgame's format rule before it reaches the prompt (what is cut
// and why: format-rule-trim-core.js).
//
// ST fires WORLDINFO_ENTRIES_LOADED on every prompt build, before it picks which entries go in. The
// entries it passes are fresh copies made for that build, so editing `content` here changes this prompt
// only — galgame's saved worldbook is never written, and galgame rewriting that entry (chat switch,
// character change, image events) cannot undo it.
//
// The log speaks only when the result CHANGES: the event fires on every generation and dry run, and the
// result flips at most when galgame mode or galgame's TTS setting does.

import { log } from '../../env.js';
import { isGalgameFormatEntry, trimFormatRule, GALGAME_FORMAT_ENTRY } from './format-rule-trim-core.js';

let lastReport = null;

function report({ isTts, cut, missing }) {
  const key = isTts ? 'tts' : cut.join(',') + '|' + missing.join(',');
  if (key === lastReport) return;
  lastReport = key;
  if (isTts) { log.info(`format-rule-trim: ${GALGAME_FORMAT_ENTRY} is galgame's TTS rule — left as galgame wrote it`); return; }
  if (cut.length) log.info(`format-rule-trim: cut ${cut.join(', ')} from ${GALGAME_FORMAT_ENTRY} — the preset sets the reply length`);
  if (missing.length) log.warn(`format-rule-trim: ${GALGAME_FORMAT_ENTRY} no longer carries the ${missing.join(' or the ')} this trim recognizes — galgame reworded its rule, so whatever replaced it reaches the prompt and may shorten replies again`);
}

function onEntriesLoaded(lores) {
  if (!lores || typeof lores !== 'object') return;
  for (const list of [lores.globalLore, lores.characterLore, lores.chatLore, lores.personaLore]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isGalgameFormatEntry(entry)) continue;
      const result = trimFormatRule(entry.content);
      entry.content = result.content;
      report(result);
    }
  }
}

export function startFormatRuleTrim() {
  const te = window.tavern_events || {};
  if (typeof window.eventOn !== 'function' || !te.WORLDINFO_ENTRIES_LOADED) {
    log.warn('format-rule-trim: eventOn / tavern_events.WORLDINFO_ENTRIES_LOADED are not on this window — galgame\'s format rule reaches the prompt untrimmed and shortens replies');
    return;
  }
  try { window.eventOn(te.WORLDINFO_ENTRIES_LOADED, onEntriesLoaded); }
  catch (e) { log.warn('format-rule-trim: eventOn(WORLDINFO_ENTRIES_LOADED) failed — galgame\'s format rule reaches the prompt untrimmed and shortens replies:', e); return; }
  log.info('format-rule-trim active (galgame\'s paragraph cap and sample reply are cut from its format rule; a TTS rule is left whole)');
}
