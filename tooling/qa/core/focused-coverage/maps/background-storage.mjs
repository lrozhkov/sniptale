export const BACKGROUND_STORAGE_OWNER_MAPPINGS = [
  {
    owner: 'background-storage-llm-request-history',
    productionPrefix: 'apps/extension/src/background/storage/llm/',
    reason: 'Metadata-only LLM history contracts, codecs, and storage are exercised owner-locally.',
    testFiles: ['apps/extension/src/background/storage/llm/request-history.test.ts'],
  },
  {
    owner: 'background-storage-page-access-tab-activation',
    productionFile: 'apps/extension/src/background/storage/page-access/tab-activation.ts',
    reason:
      'Temporary tab activation storage is covered by activation mutation and service suites.',
    testFiles: [
      'apps/extension/src/background/runtime/page-access/tab-activation.test.ts',
      'apps/extension/src/background/runtime/page-access/service.test.ts',
    ],
  },
  {
    owner: 'background-storage-diagnostics-active-sessions',
    productionPrefix: 'apps/extension/src/background/storage/diagnostics/',
    reason: 'Diagnostics session storage is covered by guard, write, and sanitization suites.',
    testFiles: [
      'apps/extension/src/background/storage/diagnostics/active-sessions.sanitization.test.ts',
      'apps/extension/src/background/storage/diagnostics/active-sessions.test.ts',
      'apps/extension/src/background/storage/diagnostics/active-sessions.write.test.ts',
      'apps/extension/src/background/storage/diagnostics/guards.test.ts',
    ],
  },
  {
    owner: 'background-storage-scenario-session',
    productionPrefix: 'apps/extension/src/background/storage/scenario/session/',
    reason: 'Scenario tab session storage is covered by owner-local guard and roundtrip suites.',
    testFiles: [
      'apps/extension/src/background/storage/scenario/session/guards.test.ts',
      'apps/extension/src/background/storage/scenario/session/index.test.ts',
    ],
  },
];
