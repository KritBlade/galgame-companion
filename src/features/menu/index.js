// features/menu — the toolbar Menu button and the modal it opens, incl. the StatusMenu
// popup (GCP capabilities 2 + 3). toolbar -> menu-modal -> status-menu is an internal chain.
export { startToolbar } from './toolbar.js';
// The StatusMenu's popups escape their iframe to the parent body; this keeps them on top of galgame
// and inside the native-fullscreen layer. Separate start because it must run whether the menu is
// opened from OUR Menu button or from galgame's own VIEW panel.
export { startStatusMenuPopupLayer } from './statusmenu-popup-layer.js';
