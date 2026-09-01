import { expect, it } from 'vitest';

import { serializeNodeModuleProfile } from './node-fragmentation-reporter.mjs';

it('serializes deterministic per-module overhead and import timing evidence', () => {
  const module = {
    moduleId: '/workspace/apps/extension/src/owner/example.test.ts',
    state: () => 'passed',
    children: { allTests: () => [1, 2][Symbol.iterator]() },
    diagnostic: () => ({
      collectDuration: 11,
      duration: 3,
      environmentSetupDuration: 2,
      importDurations: {
        '/workspace/apps/extension/src/owner/production.ts': {
          importer: '/workspace/apps/extension/src/owner/example.test.ts',
          selfTime: 5,
          totalTime: 7,
        },
      },
      prepareDuration: 4,
      setupDuration: 6,
    }),
  };

  expect(
    serializeNodeModuleProfile(
      module,
      { queuedAtMs: 1, collectedAtMs: 10, startedAtMs: 11, endedAtMs: 15 },
      '/workspace'
    )
  ).toEqual({
    file: 'apps/extension/src/owner/example.test.ts',
    importDurations: [
      {
        importer: 'apps/extension/src/owner/example.test.ts',
        moduleId: 'apps/extension/src/owner/production.ts',
        selfTime: 5,
        totalTime: 7,
      },
    ],
    state: 'passed',
    testCaseCount: 2,
    timing: {
      collectMs: 11,
      collectedAtMs: 10,
      endedAtMs: 15,
      environmentSetupMs: 2,
      prepareMs: 4,
      queuedAtMs: 1,
      setupMs: 6,
      startedAtMs: 11,
      testsAndHooksMs: 3,
    },
  });
});
