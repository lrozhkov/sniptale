import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectPersistenceOwnershipViolations, runPersistenceOwnershipCheck } from './check.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-persistence-ownership-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('allows cohesive object writes instead of enforcing a spread-based architecture metric', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/settings/sections/capture/saving/actions/index.ts',
    'browserStorage.local.set({ ...settings, showSidebar: true });\n'
  );

  expect(collectPersistenceOwnershipViolations([file])).toEqual([]);
});

it('allows field-specific writes without object spreads', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/example.ts',
    'browserStorage.local.set({ showSidebar: true });\n'
  );

  expect(collectPersistenceOwnershipViolations([file])).toEqual([]);
});

it('flags direct chrome storage access outside StateManager storage adapters', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/background/example.ts',
    "export async function loadRaw() { return chrome.storage.local.get('key'); }\n"
  );

  expect(collectPersistenceOwnershipViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'storage-entrypoint-owner-bypass',
    }),
  ]);
});

it('allows direct chrome storage access inside the browser storage adapter seam', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/browser-storage/index.ts',
    'export function getArea() { return chrome.storage.local; }\n'
  );

  expect(collectPersistenceOwnershipViolations([file])).toEqual([]);
});

it('allows direct chrome storage access inside exact browser-storage authority roles', () => {
  const root = createTempRoot();
  const adapter = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/browser-storage/area-adapter.ts',
    'export function getArea() { return chrome.storage.local; }\n'
  );
  const barrier = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/mutation-barrier.ts',
    'export function getCoordinationArea() { return chrome.storage.local; }\n'
  );
  const sibling = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/browser-storage/helpers.ts',
    'export function getArea() { return chrome.storage.local; }\n'
  );

  expect(collectPersistenceOwnershipViolations([adapter, barrier])).toEqual([]);
  expect(collectPersistenceOwnershipViolations([sibling])).toEqual([
    expect.objectContaining({ rule: 'storage-entrypoint-owner-bypass' }),
  ]);
});

it('blocks singleton imports outside exact persistence owners', () => {
  const root = createTempRoot();
  const business = writeFile(
    root,
    'apps/extension/src/background/feature/state.ts',
    "import { stateManager } from '../../composition/persistence/state-manager';\n"
  );
  const owner = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    "import { stateManager } from '../../state-manager';\n"
  );

  expect(collectPersistenceOwnershipViolations([business])).toEqual([
    expect.objectContaining({ rule: 'state-manager-singleton-owner-bypass' }),
  ]);
  expect(collectPersistenceOwnershipViolations([owner])).toEqual([]);
});

it('tracks aliased StateManager singleton imports by imported binding', () => {
  const root = createTempRoot();
  const business = writeFile(
    root,
    'apps/extension/src/background/feature/state.ts',
    "import { stateManager as persistence } from '../../composition/persistence/state-manager';\n"
  );

  expect(collectPersistenceOwnershipViolations([business])).toEqual([
    expect.objectContaining({ rule: 'state-manager-singleton-owner-bypass' }),
  ]);
});

it('allows IndexedDB only in the exact video preview cache database owner', () => {
  const root = createTempRoot();
  const owner = writeFile(
    root,
    'apps/extension/src/composition/persistence/video-preview-cache/database.ts',
    "export function openCache() { return indexedDB.open('sniptale-video-preview-cache'); }\n"
  );
  const sibling = writeFile(
    root,
    'apps/extension/src/composition/persistence/video-preview-cache/helpers.ts',
    "export function openCache() { return indexedDB.open('sniptale-video-preview-cache'); }\n"
  );

  expect(collectPersistenceOwnershipViolations([owner])).toEqual([]);
  expect(collectPersistenceOwnershipViolations([sibling])).toEqual([
    expect.objectContaining({ rule: 'indexed-db-entrypoint-owner-bypass' }),
  ]);
});

it('does not treat an unrelated local save function name as persistence authority', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/db/example.ts',
    ['export function save(project) { return saveVideoProject(project); }'].join('\n')
  );

  expect(collectPersistenceOwnershipViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runPersistenceOwnershipCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
}, 120_000);
