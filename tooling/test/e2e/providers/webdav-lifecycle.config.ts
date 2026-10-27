import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// This suite requires the security-only control page, separate from ordinary DAV fixtures.
export default defineConfig({
  ...base,
  testMatch: ['webdav-lifecycle.spec.ts'],
  outputDir: path.resolve('.tmp/webdav-lifecycle-results'),
});
