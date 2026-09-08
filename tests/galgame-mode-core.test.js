// galgame-mode-core unit tests — INSTALLED is not ON. v0.1
//
// The bug this file exists for: the choice inject fired on `topWindow.galgame` alone, which is true
// whenever galgame is loaded, so a chat with galgame mode OFF still got a choice block on every reply
// (live 2026-09-08). The decision now reads galgame's own per-character flag, held still here.
import { describe, it, expect } from 'vitest';
import { isGalgameModeFlagOn, GALGAME_MODE_FLAG_PATH } from '../src/features/galgame-bridge/galgame-mode-core.js';

describe('isGalgameModeFlagOn', () => {
  it('ON only for the literal true galgame writes', () => {
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: { runtime: { enabled: true } } })).toBe(true);
  });

  it('OFF when galgame recorded the exit', () => {
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: { runtime: { enabled: false } } })).toBe(false);
  });

  it('OFF when the flag was never written — a card galgame has not been toggled on', () => {
    expect(isGalgameModeFlagOn({})).toBe(false);
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: {} })).toBe(false);
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: { runtime: {} } })).toBe(false);
  });

  it('OFF for anything that is not a boolean true — no truthy coercion', () => {
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: { runtime: { enabled: 'true' } } })).toBe(false);
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: { runtime: { enabled: 1 } } })).toBe(false);
  });

  it('OFF for an unreadable store, never a throw', () => {
    expect(isGalgameModeFlagOn(null)).toBe(false);
    expect(isGalgameModeFlagOn(undefined)).toBe(false);
    expect(isGalgameModeFlagOn('galgame_ui_plugin')).toBe(false);
    expect(isGalgameModeFlagOn({ galgame_ui_plugin: 'yes' })).toBe(false);
  });

  it('names the path it reads, so a log can say where the answer came from', () => {
    expect(GALGAME_MODE_FLAG_PATH).toBe('galgame_ui_plugin.runtime.enabled');
  });
});
