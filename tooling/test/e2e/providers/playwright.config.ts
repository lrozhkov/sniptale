import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../../playwright.config';

// Docker-backed providers run only through this explicit configuration.
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'webdav.spec.ts',
  testIgnore: [],
  outputDir: path.resolve('.tmp/webdav-provider-results'),
  reporter: [['list']],
  retries: 0,
  workers: 1,
  timeout: 120_000,
  use: { ...base.use, trace: 'off', screenshot: 'off' },
});
