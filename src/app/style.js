// galgame-companion · style — small CSS overrides injected into the parent document. v0.3
// Only cosmetic nudges that a dictionary swap can't express. Keep tiny; anything galgame
// renames simply stops matching (graceful).

import { DOC, log } from '../env.js';

const STYLE_ID = 'school-companion-style';

const CSS = `
/* Fullscreen toggle: icon-only. The EN label ("Fullscreen") outgrows the Chinese 全屏 and
   overlaps the status pills; the icon is self-explanatory. Covers both states (全屏/退出) —
   a dict blank can't, because 退出 is also the mobile menu's Exit label. */
.gal-fullscreen-btn span { display: none !important; }

/* School Menu button — upper-left corner (proven live 2026-07-18): galgame's bottom toolbar is a
   fixed-width, flex-nowrap row already filled to the panel edge by LOG…NEXT, and it sits inside
   .gal-text-panel (overflow:hidden) — appending our button there clipped it, and reclaiming room
   fought galgame's own buttons. Instead toolbar.js injects it as a DIRECT child of the overlay
   (which is already position:relative — its own top-right status pills anchor to it the same way),
   and we pin it to the top-left corner: out of every crowded row, no clipping at any dialogue scale,
   mirrors galgame's top-right pills. Keyed on our own class → cannot touch galgame's layout. */
#gal-global-overlay .school-corner-btn { position: absolute; top: 12px; left: 14px; z-index: 30; }

/* Next-Block control (next-block.js) — the engine's manual time-block advance (World_Calc.BlockDone),
   surfaced on the overlay under the fullscreen button so it works with the stat-menu hidden. Ticking
   OUR checkbox drives the real (hidden) stat-menu checkbox. Small dark chip to read over the artwork. */
#gal-global-overlay .school-nextblock {
  position: absolute; top: 56px; right: 15px; z-index: 30;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 4px 9px; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.72rem; font-weight: 700; line-height: 1; user-select: none;
}
#gal-global-overlay .school-nextblock-cb {
  width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #29b6f6;
}

/* Image-viewer button (image-viewer.js) — stacked under the Next control (fullscreen · Next · 🖼), same dark chip
   look. Opens a near-full-viewport lightbox of galgame's current backdrop. Kept in our top-right control column,
   NOT galgame's absolutely-positioned right gutter (that would be fragile to couple to). */
#gal-global-overlay .school-imgview-btn {
  position: absolute; top: 104px; right: 15px; z-index: 30;
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  padding: 0; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.95rem; line-height: 1;
}

/* Regenerate-image button (image-regen.js) — stacked under the 🖼 image-viewer. Clicks mvu-helper's own
   .auto-img-regen for the current backdrop. Spins while "triggered". */
#gal-global-overlay .school-imgregen-btn {
  position: absolute; top: 142px; right: 15px; z-index: 30;
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  padding: 0; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.95rem; line-height: 1;
}
#gal-global-overlay .school-imgregen-btn.is-spinning i { animation: school-spin 0.9s linear infinite; }
@keyframes school-spin { to { transform: rotate(360deg); } }

/* Right-gutter buttons un-clip (galgame upstream bug, proven live 2026-07-18): galgame's right-edge
   column — sprite-toggle (👁) + the location/time status-popup triggers — is positioned right:-40px,
   hung into the gutter past the dialog panel, but clipped by .gal-game-container(overflow:hidden). At
   galgame's default ~120% dialogue-box scale that gutter is only ~17px, so the 40px hang overflows
   ~20px and the buttons are cut off (they survive only at ~100% scale / mobile reflow — an untested
   default-desktop combo). We can't per-side-unclip, and overflow:visible would leak sprites/CG on
   cards that use them; instead trim the (centred) dialog column ~88px to widen the gutter enough for
   the buttons at the seeded scale. Tuned for the default scale; at a much larger dialogue-box scale
   the top-right pills still show location/time. Can't edit galgame (CDN-imported untouched). */
#gal-global-overlay .gal-dialog-layer { width: calc(100% - 88px) !important; }

/* Overlay anti-collapse (galgame upstream structural quirk, proven live 2026-07-16):
   galgame appends #gal-global-overlay as a flex child of ST's #chat (display:flex;
   flex-direction:column) and gives it inline flex-shrink:1 + min-height:0. Immersive mode
   (沉浸模式 / hideNonLastFloors) works by display:none-ing every sibling .mes row, so the
   overlay is the ONLY flex item and keeps its full height. With immersive OFF the message
   floors stay as flex items; flex-shrink:1 + min-height:0 then lets the overlay be squeezed
   to 0px — entering galgame mode activates an INVISIBLE overlay (toast fires, no UI shows).
   We can't edit galgame (imported untouched from CDN); pin the ACTIVE overlay's size so it
   survives the flex squeeze and displays inline (below the chat) even with immersive off.
   Keyed on .active — only present while the overlay is meant to be shown. */
#gal-global-overlay.active { flex-shrink: 0 !important; min-height: 70vh !important; }
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
