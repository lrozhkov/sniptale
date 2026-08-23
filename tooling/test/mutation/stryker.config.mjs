import { mutationProfiles } from './profiles.mjs';

const profileName = process.env['SNIPTALE_MUTATION_PROFILE'];
const resultFile = process.env['SNIPTALE_MUTATION_RESULT_FILE'];
const profile = mutationProfiles[profileName];

if (!profile || !resultFile) {
  throw new Error('Mutation runner must provide a known profile and result file');
}

export default {
  concurrency: 4,
  coverageAnalysis: 'perTest',
  disableTypeChecks: '{apps,packages}/**/*.{ts,tsx}',
  ignorePatterns: ['.tmp/**', '.playwright-browsers/**', 'dist*/**'],
  jsonReporter: { fileName: resultFile },
  mutate: profile.mutate,
  reporters: ['clear-text', 'json'],
  tempDirName: '.tmp/stryker',
  testRunner: 'vitest',
  thresholds: { break: null, high: 80, low: 60 },
  timeoutMS: 15_000,
  vitest: { configFile: 'tooling/test/mutation/vitest.config.ts', related: false },
};
