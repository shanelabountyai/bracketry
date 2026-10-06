import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// D-20: runs only the pending engine suites, which the normal config never collects.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/unit/league-*.pending.ts'] },
});
