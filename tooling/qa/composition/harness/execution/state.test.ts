import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

it('accepts a fresh release-harness state for the same harness files', async () => {
  const root = createTempRoot('harness-state-fresh-');
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const value = 1;\n');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./state.mjs')>(
      '../composition/harness/execution/state.mjs'
    );
    const context = {
      harnessTargetFiles: ['tooling/qa/core/example.test.ts'],
    };
    expect(() => module.createHarnessState({ context, success: true })).toThrow(/producer run ID/u);
    module.writeHarnessState(
      module.createHarnessState({
        context,
        success: true,
        producerRunId: 'harness-run-1',
      })
    );

    expect(() => module.assertFreshHarnessState(context, 'qa:checkpoint')).not.toThrow();

    writeFile(root, 'tooling/qa/unchanged-owner.mjs', 'export const authority = 1;\n');
    expect(() => module.assertFreshHarnessState(context, 'qa:checkpoint')).toThrow(
      /controlDigest changed/u
    );
  });
});

it('rejects a stale release-harness state when harness files changed', async () => {
  const root = createTempRoot('harness-state-stale-');
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const value = 1;\n');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./state.mjs')>(
      '../composition/harness/execution/state.mjs'
    );
    const context = {
      harnessTargetFiles: ['tooling/qa/core/example.test.ts'],
    };
    module.writeHarnessState(
      module.createHarnessState({
        context,
        success: true,
        producerRunId: 'harness-run-2',
      })
    );

    writeFile(root, 'tooling/qa/core/example.test.ts', 'export const value = 2;\n');

    expect(() => module.assertFreshHarnessState(context, 'qa:checkpoint')).toThrow(
      /qa:release-harness/u
    );
  });
});
