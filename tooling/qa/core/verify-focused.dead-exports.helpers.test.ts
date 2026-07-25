import { expect, it, vi } from 'vitest';

import { collectFocusedGraphLane } from './verify-focused.execution.mjs';
import { runFocusedDeadExportsCheck } from './verify-focused.dead-exports.helpers.mjs';

it('keeps repo-wide findings when a changed consumer makes an unchanged provider dead', () => {
  const report = {
    unusedTypeExports: [],
    unusedValueExports: [
      {
        exportName: 'survivingProvider',
        file: 'apps/extension/src/content/provider.ts',
        kind: 'VariableDeclaration',
      },
    ],
  };
  const deadExportsRunner = vi.fn(() => report);

  expect(
    runFocusedDeadExportsCheck(['apps/extension/src/content/consumer.ts'], {
      deadExportsRunner,
    })
  ).toMatchObject({
    skipped: false,
    report,
    summary: { unusedTypeExportCount: 0, unusedValueExportCount: 1 },
  });
  expect(deadExportsRunner).toHaveBeenCalledOnce();
});

it('does not run the repo-wide query without a changed product TypeScript file', () => {
  const deadExportsRunner = vi.fn();

  expect(
    runFocusedDeadExportsCheck(['docs/tooling/wrapper-summary.md'], { deadExportsRunner })
  ).toMatchObject({ skipped: true });
  expect(deadExportsRunner).not.toHaveBeenCalled();
});

it('triggers the graph-lane query from import-only and deleted product TypeScript paths', async () => {
  const targetFiles = [
    'apps/extension/src/content/import-only-consumer.ts',
    'apps/extension/src/content/deleted-consumer.ts',
  ];
  const deadExportsRunner = vi.fn(() => ({
    report: { unusedTypeExports: [], unusedValueExports: [] },
    skipped: false,
    sourceIndexStats: null,
    summary: { unusedTypeExportCount: 0, unusedValueExportCount: 0 },
  }));

  const result = await collectFocusedGraphLane(
    {
      existingTargetFiles: [targetFiles[0]],
      targetFiles,
    },
    {
      deadExportsRunner,
      dependencyGraphRunner: async () => [],
    }
  );

  expect(deadExportsRunner).toHaveBeenCalledWith(targetFiles);
  expect(result.deadExportsStep).toMatchObject({ label: 'Dead exports', status: 'ok' });
});
