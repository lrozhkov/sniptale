import { expect, it } from 'vitest';
import path from 'node:path';

import { writeRuntimeTopology } from './test-support';
import { collectExactBaselineViolations } from './helpers.mjs';
import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./check.mjs')>('./check.mjs', import.meta.url)
  );
}

it('rejects same-count architecture debt substitution by exact occurrence', () => {
  const violations = [
    { rule: 'owner-debt', file: 'owner/a.ts', line: 10, message: 'retained debt' },
    { rule: 'owner-debt', file: 'owner/c.ts', line: 30, message: 'substituted debt' },
  ];
  expect(
    collectExactBaselineViolations(
      violations,
      {
        'owner-debt': [
          { file: 'owner/a.ts', line: 10 },
          { file: 'owner/b.ts', line: 20 },
        ],
      },
      (rule, data) => `${rule}: added=${data.added.join(',')}; removed=${data.removed.join(',')}`
    )
  ).toEqual([
    expect.objectContaining({
      rule: 'owner-debt',
      message: 'owner-debt: added=owner/c.ts:30; removed=owner/b.ts:20',
    }),
  ]);
});

it('rejects stale and growing architecture occurrence scopes while preserving zero baselines', () => {
  const message = (rule: string, data: { added: string[]; removed: string[] }) =>
    `${rule}: added=${data.added.length}; removed=${data.removed.length}`;

  expect(
    collectExactBaselineViolations(
      [{ rule: 'owner-debt', file: 'owner/a.ts', line: 10, message: 'live debt' }],
      {
        'owner-debt': [
          { file: 'owner/a.ts', line: 10 },
          { file: 'owner/b.ts', line: 20 },
        ],
      },
      message
    )
  ).toEqual([expect.objectContaining({ message: 'owner-debt: added=0; removed=1' })]);

  expect(
    collectExactBaselineViolations(
      [{ rule: 'zero-owner-debt', file: 'owner/new.ts', line: 1, message: 'new debt' }],
      { 'zero-owner-debt': [] },
      message
    )
  ).toEqual([expect.objectContaining({ message: 'zero-owner-debt: added=1; removed=0' })]);
});

it('rejects a registered SCC after its complete disappearance', async () => {
  const root = createTempRoot('architecture-guardrails-stale-scc-');
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/parser/index.ts', 'export const parser = 1;\n');
  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      [path.join(root, 'apps/extension/src/content/parser/index.ts')],
      {
        registry: [
          {
            id: 'content-parser__content-platform',
            owners: ['apps/extension/src/content/parser', 'apps/extension/src/content/platform'],
            edges: [['apps/extension/src/content/parser', 'apps/extension/src/content/platform']],
          },
        ],
        root,
      }
    )
  ).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('content-parser__content-platform'),
      rule: 'second-level-scc-stale',
    }),
  ]);
});
