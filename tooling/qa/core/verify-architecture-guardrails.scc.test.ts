import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile, writeJson } from './test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./verify-architecture-guardrails.mjs')>(
      './verify-architecture-guardrails.mjs',
      import.meta.url
    )
  );
}

function writeRuntimeTopology(root: string) {
  writeJson(root, 'tooling/qa/core/runtime-topology.data.json', [
    { id: 'content', root: 'apps/extension/src/content', docsMarkers: [], entrypointFiles: [] },
    { id: 'popup', root: 'apps/extension/src/popup', docsMarkers: [], entrypointFiles: [] },
  ]);
  writeJson(root, 'package.json', { name: 'architecture-guardrails-scc-temp', type: 'module' });
}

function contentOverlaySelectionRegistry() {
  return [
    {
      id: 'content-overlay-selection',
      owner: 'test',
      reason: 'test baseline',
      owners: ['apps/extension/src/content/overlay', 'apps/extension/src/content/selection'],
      edges: [
        ['apps/extension/src/content/overlay', 'apps/extension/src/content/selection'],
        ['apps/extension/src/content/selection', 'apps/extension/src/content/overlay'],
      ],
    },
  ];
}

it('measures second-level owner SCCs', async () => {
  const root = createTempRoot('architecture-guardrails-scc-');
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/overlay/a.ts', "import '../selection/b';\n");
  writeFile(root, 'apps/extension/src/content/selection/b.ts', "import '../overlay/a';\n");

  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      ['apps/extension/src/content/overlay/a.ts', 'apps/extension/src/content/selection/b.ts'],
      { registry: [], root }
    )
  ).toEqual([expect.objectContaining({ rule: 'second-level-scc' })]);
});

it('allows registered second-level owner SCCs', async () => {
  const root = createTempRoot('architecture-guardrails-scc-registered-');
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/overlay/a.ts', "import '../selection/b';\n");
  writeFile(root, 'apps/extension/src/content/selection/b.ts', "import '../overlay/a';\n");

  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      ['apps/extension/src/content/overlay/a.ts', 'apps/extension/src/content/selection/b.ts'],
      { registry: contentOverlaySelectionRegistry(), root }
    )
  ).toEqual([]);
});

it('blocks accidental second-level owner SCC expansion', async () => {
  const root = createTempRoot('architecture-guardrails-scc-expansion-');
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/overlay/a.ts', "import '../selection/b';\n");
  writeFile(root, 'apps/extension/src/content/selection/b.ts', "import '../parser/c';\n");
  writeFile(root, 'apps/extension/src/content/parser/c.ts', "import '../overlay/a';\n");

  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      [
        'apps/extension/src/content/overlay/a.ts',
        'apps/extension/src/content/selection/b.ts',
        'apps/extension/src/content/parser/c.ts',
      ],
      { registry: contentOverlaySelectionRegistry(), root }
    )
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'second-level-scc' }),
      expect.objectContaining({ rule: 'second-level-scc-stale' }),
    ])
  );
});

it('ignores test-only second-level owner SCCs', async () => {
  const root = createTempRoot('architecture-guardrails-scc-tests-');
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/popup/index.tsx', "import './app/root';\n");
  writeFile(root, 'apps/extension/src/popup/app/root.tsx', 'export const root = true;\n');
  writeFile(root, 'apps/extension/src/popup/app/entrypoint.test.tsx', "import '../index';\n");

  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      [
        'apps/extension/src/popup/index.tsx',
        'apps/extension/src/popup/app/root.tsx',
        'apps/extension/src/popup/app/entrypoint.test.tsx',
      ],
      { registry: [], root }
    )
  ).toEqual([]);
});

it('ignores content runtime composition edges in second-level owner SCCs', async () => {
  const root = createTempRoot('architecture-guardrails-scc-runtime-composition-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/content/runtime/entrypoint/bootstrap.tsx',
    "import '../../overlay/app';\n"
  );
  writeFile(root, 'apps/extension/src/content/overlay/app.ts', "import '../runtime/contracts';\n");
  writeFile(
    root,
    'apps/extension/src/content/runtime/contracts.ts',
    'export const runtimeContract = true;\n'
  );
  writeFile(root, 'apps/extension/src/content/runtime/feature.ts', "import '../overlay/app';\n");

  const module = await loadModule(root);

  expect(
    module.collectSecondLevelSccTrendViolations(
      [
        'apps/extension/src/content/runtime/entrypoint/bootstrap.tsx',
        'apps/extension/src/content/overlay/app.ts',
        'apps/extension/src/content/runtime/contracts.ts',
      ],
      { registry: [], root }
    )
  ).toEqual([]);
  expect(
    module.collectSecondLevelSccTrendViolations(
      [
        'apps/extension/src/content/runtime/feature.ts',
        'apps/extension/src/content/overlay/app.ts',
        'apps/extension/src/content/runtime/contracts.ts',
      ],
      { registry: [], root }
    )
  ).toEqual([expect.objectContaining({ rule: 'second-level-scc' })]);
});
