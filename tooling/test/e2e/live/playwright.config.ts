import { defineConfig } from '@playwright/test';
import base from '../../../../playwright.config';
import { getLiveProfile, readLiveCredential } from './configuration';

const local = process.env.SNIPTALE_LIVE_MODE === 'local-errors';
if (!local) {
  const profile = getLiveProfile();
  if (process.env.SNIPTALE_LIVE_LIST_ONLY !== '1') readLiveCredential();
  console.log(
    `Live provider: ${profile.id}; declared operations: ${Object.keys(profile.models).join(', ')}.`
  );
}
const runId = process.env.SNIPTALE_LIVE_RUN_ID ?? 'manual';
if (!/^(?:manual|[a-f0-9-]{36})$/u.test(runId)) throw new Error('Invalid live run identity.');
export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: [],
  testMatch: local
    ? 'local-errors.spec.ts'
    : [
        'scenario-text.spec.ts',
        'gallery-recognition.spec.ts',
        'montage-recognition.spec.ts',
        'gallery-speech.spec.ts',
      ],
  outputDir: `../../../../.tmp/live-e2e/${runId}/results`,
  reporter: [['line']],
  workers: 1,
  retries: 0,
  use: { ...base.use, trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 15000 },
});
