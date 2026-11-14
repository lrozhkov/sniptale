import { defineConfig } from '@playwright/test';
import base from '../../../../playwright.config';

/** Free public catalog proof has no AI provider, profile, credential, or paid operation. */
export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: [],
  testMatch: 'vector-catalog.spec.ts',
  outputDir: '../../../../.tmp/vector-catalog-live/results',
  reporter: [['line']],
  workers: 1,
  retries: 0,
  use: { ...base.use, actionTimeout: 15_000 },
});
