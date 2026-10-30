import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config';

process.env['SNIPTALE_EXTENSION_BUILD_DIR'] ??= '.tmp/e2e-builds/test';

const runId =
  process.env['SNIPTALE_PREVIEW_PERFORMANCE_RUN_ID'] ??
  `${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`;
if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(runId)) throw new Error('Invalid performance run identity');
process.env['SNIPTALE_PREVIEW_PERFORMANCE_RUN_ID'] = runId;
const runDirectory = `.tmp/preview-performance/runs/${runId}`;

/** Explicit opt-in: ordinary E2E discovery must never execute performance measurements. */
export default defineConfig({
  ...base,
  metadata: {
    ...base.metadata,
    extensionBuildDir: process.env['SNIPTALE_EXTENSION_BUILD_DIR'],
    optionalPerformance: true,
  },
  testDir: '.',
  testMatch: 'preview-performance*.spec.ts',
  testIgnore: [],
  outputDir: `../../../${runDirectory}/results`,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['./support/preview-performance-report.ts'],
    ['html', { open: 'never', outputFolder: `${runDirectory}/report` }],
  ],
  use: { ...base.use, trace: 'off', video: 'off', screenshot: 'only-on-failure' },
});
