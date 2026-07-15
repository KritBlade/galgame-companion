// galgame-companion · style — small CSS overrides injected into the parent document. v0.1
// Only cosmetic nudges that a dictionary swap can't express. Keep tiny; anything galgame
// renames simply stops matching (graceful).

import { DOC, log } from './env.js';

const STYLE_ID = 'school-companion-style';

const CSS = `
/* Fullscreen toggle: icon-only. The EN label ("Fullscreen") outgrows the Chinese 全屏 and
   overlaps the status pills; the icon is self-explanatory. Covers both states (全屏/退出) —
   a dict blank can't, because 退出 is also the mobile menu's Exit label. */
.gal-fullscreen-btn span { display: none !important; }
`;

export function injectStyle() {
  if (!DOC || !DOC.head) return setTimeout(injectStyle, 200);
  if (DOC.getElementById(STYLE_ID)) return;
  const el = DOC.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  DOC.head.appendChild(el);
  log.info('style injected');
}
