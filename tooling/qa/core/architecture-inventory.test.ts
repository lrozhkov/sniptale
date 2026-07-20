import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile, writeJson } from './test-helpers';

async function loadInventory(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./architecture-inventory.mjs')>(
      './architecture-inventory.mjs',
      import.meta.url
    )
  );
}

function writeInventoryFixture(root: string) {
  writeJson(root, 'package.json', { name: 'architecture-inventory-temp', type: 'module' });
  writeFile(root, 'apps/extension/src/background/runtime/service.ts', 'const jobs = new Map();\n');
  writeFile(
    root,
    'apps/extension/src/background/runtime/typed.ts',
    'let tab: chrome.tabs.Tab | null = null;\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/feature.ts',
    [
      "import { sendRuntimeMessage } from '../platform/runtime-messaging';",
      'export function run() {',
      '  return sendRuntimeMessage({ type: "PING" });',
      '}',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/content/retired.ts',
    "import { Button } from '../../../../src/shared/ui';\n"
  );
  writeFile(root, 'packages/platform/src/browser/runtime.ts', 'export const runtimeInfo = {};\n');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/state-manager/index.ts',
    'export const stateManager = {};\n'
  );
  writeFile(
    root,
    'packages/foundation/src/capabilities/token.ts',
    'export function resetTokenForTests() {}\n'
  );
  writeFile(root, 'packages/foundation/src/capabilities/token.test.ts', 'new Map();\n');
}

function expectInventoryMetrics(inventory) {
  expect(inventory.topLevelRoots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: 'apps/extension/src/background', files: 2 }),
      expect.objectContaining({ path: 'apps/extension/src/content', files: 2 }),
      expect.objectContaining({ path: 'packages/foundation', files: 1 }),
      expect.objectContaining({ path: 'packages/platform', files: 1 }),
    ])
  );
  expect(inventory.largestSharedOwners).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: 'packages/foundation' }),
      expect.objectContaining({ path: 'packages/platform' }),
    ])
  );
}

function expectInventorySignals(inventory) {
  expect(inventory.usageSignals.sendRuntimeMessage).toEqual([
    expect.objectContaining({ file: 'apps/extension/src/content/feature.ts', count: 2 }),
  ]);
  expect(inventory.usageSignals.stateManager).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/composition/persistence/infrastructure/state-manager/index.ts',
      count: 1,
    }),
  ]);
  expect(inventory.defaultRuntimeMessagingImports).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/content/feature.ts',
      importName: 'sendRuntimeMessage',
    }),
  ]);
  expect(inventory.authorityStateSignals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'apps/extension/src/background/runtime/service.ts',
        reasons: ['top-level-map-or-set', 'mutation-queue-name'],
      }),
      expect.objectContaining({
        file: 'packages/foundation/src/capabilities/token.ts',
        reasons: ['capability-path', 'reset-for-tests'],
      }),
    ])
  );
  expect(inventory.policyState).toEqual({ descriptorCount: 0, exists: false, ids: [] });
}

it('reports src root metrics, shared owners, usage signals, and authority state signals', async () => {
  const root = createTempRoot('architecture-inventory-');
  writeInventoryFixture(root);

  const module = await loadInventory(root);
  const inventory = module.collectArchitectureInventory([
    'apps/extension/src/background/runtime/service.ts',
    'apps/extension/src/background/runtime/typed.ts',
    'apps/extension/src/content/feature.ts',
    'apps/extension/src/content/retired.ts',
    'packages/platform/src/browser/runtime.ts',
    'apps/extension/src/composition/persistence/infrastructure/state-manager/index.ts',
    'packages/foundation/src/capabilities/token.ts',
    'packages/foundation/src/capabilities/token.test.ts',
  ]);

  expectInventoryMetrics(inventory);
  expectInventorySignals(inventory);
  expect(inventory.directBrowserCalls).toEqual([]);
  expect(inventory.retiredBroadFacadeImports).toEqual([]);
});

it('prints a short human-readable inventory summary', async () => {
  const root = createTempRoot('architecture-inventory-summary-');
  writeInventoryFixture(root);

  const module = await loadInventory(root);
  const inventory = module.collectArchitectureInventory([
    'apps/extension/src/background/runtime/service.ts',
  ]);

  expect(module.formatArchitectureInventorySummary(inventory)).toContain(
    'Architecture inventory: 1 production src file(s) scanned.'
  );
  expect(module.formatArchitectureInventorySummary(inventory)).toContain(
    'Policy-state inventory: 0 descriptor(s) declared.'
  );
  expect(module.formatArchitectureInventorySummary(inventory)).toContain(
    'Default runtime messaging import inventory: 0 reported item(s).'
  );
});

it('reports new shared files with residency categories and diff counts', async () => {
  const root = createTempRoot('architecture-inventory-diff-');
  writeInventoryFixture(root);
  writeFile(root, 'src/shared/ui/new-control.ts', 'export const control = 1;\n');
  writeFile(root, 'src/shared/unknown/new-domain.ts', 'export const domain = 1;\n');

  const module = await loadInventory(root);
  const inventory = module.collectArchitectureInventory(
    [
      'apps/extension/src/content/retired.ts',
      'src/shared/ui/new-control.ts',
      'src/shared/unknown/new-domain.ts',
    ],
    {
      changedTargets: {
        addedFiles: ['src/shared/ui/new-control.ts'],
        changedFiles: ['apps/extension/src/content/retired.ts', 'src/shared/ui/new-control.ts'],
        deletedFiles: ['src/shared/old-owner.ts'],
        untrackedFiles: new Set(['src/shared/unknown/new-domain.ts']),
      },
    }
  );

  expect(inventory.diff).toEqual(
    expect.objectContaining({
      added: expect.objectContaining({ retiredBroadFacadeImports: 0 }),
      removed: {},
    })
  );
});

it('reports missing policy-state ids only after the registry exists', async () => {
  const root = createTempRoot('architecture-inventory-policy-state-');
  writeInventoryFixture(root);
  writeFile(
    root,
    'apps/extension/src/background/routing-contracts/policy-state/registry.ts',
    "export const registry = [{ id: 'content-action-runtime-tokens' }];\n"
  );

  const module = await loadInventory(root);
  const inventory = module.collectArchitectureInventory([
    'packages/foundation/src/capabilities/token.ts',
    'apps/extension/src/background/routing-contracts/policy-state/registry.ts',
  ]);

  expect(inventory.authorityStateSignals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'packages/foundation/src/capabilities/token.ts',
        reasons: ['capability-path', 'reset-for-tests', 'missing-policy-state-id'],
      }),
    ])
  );
  expect(inventory.policyState).toEqual({
    descriptorCount: 1,
    exists: true,
    ids: ['content-action-runtime-tokens'],
  });
});
