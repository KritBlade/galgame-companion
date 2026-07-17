// galgame-companion test config — mirrors mvu-helper's vitest setup (pure *-core.js modules only;
// TH/browser wiring is exercised live via Chrome MCP, not unit tests). v0.1
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: true,
    reporters: ['verbose'],
    testTimeout: 10000,
  },
});
