import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';
import {
  collectInstanceOwnershipInventoryViolations,
  INSTANCE_OWNERSHIP_INVENTORY,
  loadInstanceOwnershipInventory,
} from './verify-instance-ownership.inventory-owner.mjs';

type OwnershipWave = { id: string; files: string[]; rule: string };

function inventory(waves: OwnershipWave[]) {
  return `${JSON.stringify({ schemaVersion: 1, waves }, null, 2)}\n`;
}

function wave(files: string[], rule = 'facade-default-owner'): OwnershipWave {
  return { id: `wave-${rule}`, files, rule };
}

function validateInventory({
  current,
  head = current,
  liveFiles = [],
  legacyHead = null,
}: {
  current: string;
  head?: string | null;
  liveFiles?: string[];
  legacyHead?: string | null;
}) {
  const root = createTempRoot('instance-ownership-inventory-');
  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, current);
  liveFiles.forEach((file) => writeFile(root, file, 'export {};\n'));
  return collectInstanceOwnershipInventoryViolations({
    root,
    headSourceResolver: (file) => {
      if (file === INSTANCE_OWNERSHIP_INVENTORY) return head;
      return legacyHead;
    },
  });
}

it('loads validated inert JSON before deriving ownership sets', () => {
  const root = createTempRoot('instance-ownership-loader-');
  const source = inventory([wave(['owner.ts'])]);
  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, source);

  expect(loadInstanceOwnershipInventory({ root })).toEqual([wave(['owner.ts'])]);

  writeFile(root, INSTANCE_OWNERSHIP_INVENTORY, '{ invalid json');
  expect(() => loadInstanceOwnershipInventory({ root })).toThrow('valid inert JSON');
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

it('rejects changing the rule of a live protected target', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  const violations = validateInventory({
    current: inventory([wave([target], 'no-top-level-mutable-runtime-state')]),
    head: inventory([wave([target])]),
    liveFiles: [target],
  });

  expect(violations.map((item) => item.rule)).toEqual([
    'instance-ownership-inventory-live-removal',
    'instance-ownership-inventory-addition-requires-harness',
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
  ).toMatchObject([{ rule: 'instance-ownership-inventory-addition-requires-harness' }]);

  expect(
    validateInventory({
      current: inventory([wave(['missing.ts'])]),
      head: inventory([]),
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

it('reads the legacy HEAD census during the inert JSON migration', () => {
  const target = 'apps/extension/src/content/runtime/index.ts';
  const legacyHead = [
    `export const OWNERSHIP_WAVES = [{ id: 'legacy', files: ['${target}'], rule: 'facade-default-owner' }];`,
    'export const OWNERSHIP_FACADE_FILES = new Set();',
  ].join('\n');

  expect(
    validateInventory({
      current: inventory([wave([target])]),
      head: null,
      legacyHead,
      liveFiles: [target],
    })
  ).toEqual([]);
});
