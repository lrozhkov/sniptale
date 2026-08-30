import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
} from '../../../../test-support/test-helpers';
import {
  collectInstanceOwnershipInventoryViolations,
  INSTANCE_OWNERSHIP_INVENTORY,
  loadInstanceOwnershipInventory,
} from './inventory-owner.mjs';

type OwnershipWave = { id: string; files: string[]; rule: string };

function inventory(waves: OwnershipWave[]) {
  return `${JSON.stringify({ schemaVersion: 1, waves }, null, 2)}\n`;
}

function wave(files: string[], rule = 'facade-default-owner', id = `wave-${rule}`): OwnershipWave {
  return { id, files, rule };
}

function validateInventory({
  allowFacadeAdditions = false,
  current,
  head = current,
  liveFiles = [],
}: {
  current: string;
  allowFacadeAdditions?: boolean;
  head?: string | null;
  liveFiles?: string[];
}) {
  const root = createTempRoot('instance-ownership-inventory-');
  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, current);
  liveFiles.forEach((file) => writeFile(root, file, 'export {};\n'));
  return collectInstanceOwnershipInventoryViolations({
    allowFacadeAdditions,
    root,
    headSourceResolver: () => head,
  });
}

it('loads validated inert JSON before deriving ownership sets', () => {
  const root = createTempRoot('instance-ownership-loader-');
  const source = inventory([wave(['owner.ts'])]);
  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, source);
  writeFile(root, 'owner.ts', 'export {};\n');

  expect(loadInstanceOwnershipInventory({ root })).toMatchObject({
    waves: [wave(['owner.ts'])],
    facadeFiles: new Set(['owner.ts']),
    stateFiles: new Set(),
  });

  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, '{ invalid json');
  expect(() => loadInstanceOwnershipInventory({ root })).toThrow('valid inert JSON');
});

it('resolves the default inventory independently of the caller working directory', async () => {
  const expected = loadInstanceOwnershipInventory();
  const unrelatedRoot = createTempRoot('instance-ownership-cwd-');

  await withCwd(unrelatedRoot, async () => {
    const freshOwner = await importFresh<typeof import('./inventory-owner.mjs')>(
      '../guards/architecture/ownership/instance-ownership/inventory-owner.mjs'
    );
    expect(freshOwner.loadInstanceOwnershipInventory()).toEqual(expected);
  });
});

it('accepts a retired target removal while preserving the remaining census', () => {
  const retained = 'apps/extension/src/content/runtime/index.ts';
  const retired = 'apps/extension/src/content/runtime/retired.ts';
  expect(
    validateInventory({
      current: inventory([wave([retained])]),
      head: inventory([wave([retained, retired])]),
      liveFiles: [retained],
    })
  ).toEqual([]);
});

it('accepts a one-for-one retired path replacement inside the same ownership wave', () => {
  const retired = 'apps/extension/src/offscreen/recording/start/helpers.ts';
  const successor = 'apps/extension/src/offscreen/recording/start/session.ts';

  expect(
    validateInventory({
      current: inventory([wave([successor], 'no-top-level-mutable-runtime-state')]),
      head: inventory([wave([retired], 'no-top-level-mutable-runtime-state')]),
      liveFiles: [successor],
    })
  ).toEqual([]);
});

it('requires harness verification when a retired target moves across owner directories', () => {
  const retired = 'apps/extension/src/offscreen/recording/start/helpers.ts';
  const successor = 'apps/extension/src/offscreen/runtime/session.ts';

  expect(
    validateInventory({
      current: inventory([wave([successor], 'no-top-level-mutable-runtime-state')]),
      head: inventory([wave([retired], 'no-top-level-mutable-runtime-state')]),
      liveFiles: [successor],
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-addition-requires-harness' }]);
});

it('accepts the reviewed generic offscreen lifecycle owner move', () => {
  const retired = 'apps/extension/src/background/media/video/runtime/offscreen-manager.ts';
  const successor = 'apps/extension/src/background/offscreen-document/service.ts';

  expect(
    validateInventory({
      current: inventory([wave([successor], 'facade-default-owner', 'background-runtime-facades')]),
      head: inventory([wave([retired], 'facade-default-owner', 'background-runtime-facades')]),
      liveFiles: [successor],
    })
  ).toEqual([]);
});

it('rejects a retired target replacement whose successor is not live', () => {
  const retired = 'apps/extension/src/offscreen/recording/start/helpers.ts';
  const missingSuccessor = 'apps/extension/src/offscreen/recording/start/missing.ts';

  expect(
    validateInventory({
      current: inventory([wave([missingSuccessor], 'no-top-level-mutable-runtime-state')]),
      head: inventory([wave([retired], 'no-top-level-mutable-runtime-state')]),
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-stale-target' }]);
});

it('accepts moving an unchanged target between ownership waves', () => {
  const target = 'apps/extension/src/offscreen/recording/start/session.ts';

  expect(
    validateInventory({
      current: inventory([wave([target], 'no-top-level-mutable-runtime-state', 'current-wave')]),
      head: inventory([wave([target], 'no-top-level-mutable-runtime-state', 'head-wave')]),
      liveFiles: [target],
    })
  ).toEqual([]);
});

it('rejects live target removal and census collapse', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  const violations = validateInventory({
    current: inventory([]),
    head: inventory([wave([target])]),
    liveFiles: [target],
  });

  expect(violations.map((item) => item.rule)).toEqual([
    'instance-ownership-inventory-collapse',
    'instance-ownership-inventory-live-removal',
  ]);
});

it('accepts reclassifying a live target under another ownership rule', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  const violations = validateInventory({
    current: inventory([wave([target], 'no-top-level-mutable-runtime-state')]),
    head: inventory([wave([target])]),
    liveFiles: [target],
  });

  expect(violations).toEqual([]);
});

it('rejects a package selector that has no live exported source', () => {
  const target = '@sniptale/ui/product-feedback/toast-service';
  const violations = validateInventory({
    current: inventory([wave([target], 'no-top-level-mutable-runtime-state')]),
    head: inventory([wave([target])]),
  });

  expect(violations.map((item) => item.rule)).toEqual([
    'instance-ownership-inventory-stale-target',
  ]);
});

it('resolves a package export selector to its canonical live source path', () => {
  const root = createTempRoot('instance-ownership-package-export-');
  const selector = '@sniptale/ui/product-feedback/toast-service';
  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, inventory([wave([selector])]));
  writeFile(
    root,
    'packages/ui/package.json',
    JSON.stringify({
      name: '@sniptale/ui',
      exports: { './product-feedback/toast-service': './src/toast-service/index.ts' },
    })
  );
  writeFile(root, 'packages/ui/src/toast-service/index.ts', 'export {};\n');

  expect(loadInstanceOwnershipInventory({ root }).facadeFiles).toEqual(
    new Set(['packages/ui/src/toast-service/index.ts'])
  );
});

it('requires harness verification when another rule is added without reclassification', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  const violations = validateInventory({
    current: inventory([wave([target]), wave([target], 'no-top-level-mutable-runtime-state')]),
    head: inventory([wave([target])]),
    liveFiles: [target],
  });

  expect(violations).toMatchObject([
    { rule: 'instance-ownership-inventory-addition-requires-harness' },
  ]);
});

it('requires executable harness verification for every new ownership target', () => {
  const existing = 'apps/extension/src/content/runtime/index.ts';
  expect(
    validateInventory({
      current: inventory([wave([existing], 'no-top-level-mutable-runtime-state')]),
      head: inventory([]),
      liveFiles: [existing],
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-addition-requires-harness' }]);

  expect(
    validateInventory({
      current: inventory([wave(['@sniptale/does-not-exist'])]),
      head: inventory([]),
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-stale-target' }]);

  expect(
    validateInventory({
      current: inventory([wave(['missing.ts'])]),
      head: inventory([]),
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-stale-target' }]);
});

it('admits new facade targets only after their exhaustive harness proof is selected', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  expect(
    validateInventory({
      allowFacadeAdditions: true,
      current: inventory([wave([target])]),
      head: inventory([]),
      liveFiles: [target],
    })
  ).toEqual([]);
  expect(
    validateInventory({
      allowFacadeAdditions: true,
      current: inventory([wave([target], 'no-top-level-mutable-runtime-state')]),
      head: inventory([]),
      liveFiles: [target],
    })
  ).toMatchObject([{ rule: 'instance-ownership-inventory-addition-requires-harness' }]);
});

it('rejects invalid wave metadata', () => {
  const invalid = JSON.stringify({
    schemaVersion: 1,
    waves: [
      { id: 'duplicate', files: ['owner.ts', 'owner.ts'], rule: 'facade-default-owner' },
      { id: 'duplicate', files: [], rule: 'unsupported-rule' },
    ],
  });
  expect(validateInventory({ current: invalid, head: invalid }).map((item) => item.rule)).toEqual([
    'instance-ownership-inventory-duplicate-target',
    'instance-ownership-inventory-wave-shape',
  ]);
});
