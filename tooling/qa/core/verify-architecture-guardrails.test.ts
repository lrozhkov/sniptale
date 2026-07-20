import { expect, it } from 'vitest';
import path from 'node:path';

import { writeRuntimeTopology } from './verify-architecture-guardrails.test-support';
import { collectExactBaselineViolations } from './architecture-guardrails.helpers.mjs';
import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./verify-architecture-guardrails.mjs')>(
      './verify-architecture-guardrails.mjs',
      import.meta.url
    )
  );
}

function writeRuntimeImportFixture(root: string) {
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/logic/tool.ts', 'export const tool = 1;\n');
  writeFile(
    root,
    'apps/extension/src/content/public/preparation-surface/index.ts',
    'export const surface = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/screenshot/types.ts',
    'export const screenshot = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/background/route.ts',
    "import { tool } from '../content/logic/tool';\n"
  );
  writeFile(
    root,
    'apps/extension/src/web-snapshot-viewer/preparation/runtime/index.tsx',
    "import { surface } from '../../../content/public/preparation-surface';\n"
  );
  writeFile(
    root,
    'apps/extension/src/web-snapshot-viewer/viewer/frame-navigation.ts',
    "import { tool } from '../../content/logic/tool';\n"
  );
  writeFile(
    root,
    'apps/extension/src/web-snapshot-viewer/preparation/capture/adapter.ts',
    "import { screenshot } from '../../../content/overlay/screenshot/types';\n"
  );
  writeFile(
    root,
    'apps/extension/src/content/public/preparation-surface/reverse.ts',
    "import { frame } from '../../../web-snapshot-viewer/viewer/frame-navigation';\n"
  );
}

it('blocks direct runtime-to-runtime imports except viewer preparation public surface reuse', async () => {
  const root = createTempRoot('architecture-guardrails-runtime-');
  writeRuntimeImportFixture(root);

  const module = await loadModule(root);

  expect(
    module.collectRuntimeCrossImportViolations(['apps/extension/src/background/route.ts'], { root })
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/background/route.ts',
      rule: 'runtime-cross-import',
    }),
  ]);
  expect(
    module.collectRuntimeCrossImportViolations(
      ['apps/extension/src/web-snapshot-viewer/preparation/runtime/index.tsx'],
      { root }
    )
  ).toEqual([]);
  expect(
    module.collectRuntimeCrossImportViolations(
      ['apps/extension/src/web-snapshot-viewer/viewer/frame-navigation.ts'],
      { root }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/web-snapshot-viewer/viewer/frame-navigation.ts',
      rule: 'runtime-cross-import',
    }),
  ]);
});

it('blocks viewer deep content imports and reverse imports from the public content surface', async () => {
  const root = createTempRoot('architecture-guardrails-runtime-');
  writeRuntimeImportFixture(root);

  const module = await loadModule(root);

  expect(
    module.collectRuntimeCrossImportViolations(
      ['apps/extension/src/web-snapshot-viewer/preparation/capture/adapter.ts'],
      { root }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/web-snapshot-viewer/preparation/capture/adapter.ts',
      rule: 'runtime-cross-import',
    }),
  ]);
  expect(
    module.collectRuntimeCrossImportViolations(
      ['apps/extension/src/content/public/preparation-surface/reverse.ts'],
      { root }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/content/public/preparation-surface/reverse.ts',
      rule: 'runtime-cross-import',
    }),
  ]);
});

it('catches legacy parser calls and output-specific parser branches', async () => {
  const root = createTempRoot('architecture-guardrails-parser-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/profile.ts',
    [
      'export function parse(mode) {',
      '  parseLegacyDomTree(document);',
      "  if (mode === 'markdownExport') return {};",
      '}',
    ].join('\n')
  );

  const module = await loadModule(root);

  expect(
    module.collectParserOwnershipViolations(
      [path.join(root, 'apps/extension/src/content/parser/pipelines/profile.ts')],
      {
        baseline: { 'legacy-parser-caller': [], 'output-specific-parser-heuristic': [] },
      }
    )
  ).toEqual([
    expect.objectContaining({ rule: 'legacy-parser-caller' }),
    expect.objectContaining({ rule: 'output-specific-parser-heuristic' }),
  ]);
});

it('catches raw browser storage writes outside storage owners', async () => {
  const root = createTempRoot('architecture-guardrails-storage-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/content/logic/save.ts',
    'export function save(browserStorage) { return browserStorage.local.set({ a: 1 }); }\n'
  );

  const module = await loadModule(root);

  expect(
    module.collectRawStorageMutationViolations(
      [path.join(root, 'apps/extension/src/content/logic/save.ts')],
      {
        baseline: { 'raw-browser-storage-write': [] },
      }
    )
  ).toEqual([expect.objectContaining({ rule: 'raw-browser-storage-write' })]);
});

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
