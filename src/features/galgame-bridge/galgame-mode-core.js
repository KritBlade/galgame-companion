// galgame-companion · galgame-bridge/galgame-mode-core — is galgame MODE on for this character? v0.1
//
// PURE: no host imports (tested by tests/galgame-mode-core.test.js). The caller reads the character
// variables and passes them in.
//
// INSTALLED is not ON. `topWindow.galgame` exists from the moment galgame loads and stays for the
// session, mode on or off — it is the extension's export object, not its state. galgame keeps the
// per-character mode in a CHARACTER VARIABLE that its own enter/exit buttons write through
// Tavern-Helper (galgame src/core/settings.js, CHAR_ENABLED_VAR_PATH): `galgame_ui_plugin.runtime.enabled`.
// Reading that is the only way to tell "the player is in galgame mode" from "galgame is on the page".
// Gating the choice inject on presence alone asked for a choice block on every reply of a chat that
// never showed one (live 2026-09-08).
//
// A literal `true` is ON. Anything else — the flag missing (a card galgame has never been toggled on),
// `false`, a non-boolean — is OFF, and so is an unreadable store. No fallback to ON.

/** The character-variable path galgame writes its mode to, for logs. */
export const GALGAME_MODE_FLAG_PATH = 'galgame_ui_plugin.runtime.enabled';

/**
 * @param {*} characterVariables the current character's variable object (TH `getVariables({type:'character'})`)
 * @returns {boolean} true only when galgame has recorded mode ON for this character
 */
export function isGalgameModeFlagOn(characterVariables) {
  if (!characterVariables || typeof characterVariables !== 'object') return false;
  const plugin = characterVariables.galgame_ui_plugin;
  if (!plugin || typeof plugin !== 'object') return false;
  const runtime = plugin.runtime;
  if (!runtime || typeof runtime !== 'object') return false;
  return runtime.enabled === true;
}
