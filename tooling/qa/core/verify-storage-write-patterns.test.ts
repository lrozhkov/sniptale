import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectStorageWritePatternViolations,
  runStorageWritePatternCheck,
} from './verify-storage-write-patterns.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-storage-write-patterns-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags whole-object overwrite writes that spread existing state', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/settings/sections/save-presets/actions/index.ts',
    'browserStorage.local.set({ ...settings, showSidebar: true });\n'
  );

  expect(collectStorageWritePatternViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'storage-write-patterns',
      file: expect.stringContaining(
        'apps/extension/src/settings/sections/save-presets/actions/index.ts'
      ),
    }),
  ]);
});

it('allows field-specific writes without object spreads', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/example.ts',
    'browserStorage.local.set({ showSidebar: true });\n'
  );

  expect(collectStorageWritePatternViolations([file])).toEqual([]);
});

it('flags direct chrome storage access outside StateManager storage adapters', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/background/example.ts',
    "export async function loadRaw() { return chrome.storage.local.get('key'); }\n"
  );

  expect(collectStorageWritePatternViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'state-manager-authority-owner-bypass',
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

  expect(collectStorageWritePatternViolations([file])).toEqual([]);
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

  expect(collectStorageWritePatternViolations([adapter, barrier])).toEqual([]);
  expect(collectStorageWritePatternViolations([sibling])).toEqual([
    expect.objectContaining({ rule: 'state-manager-authority-owner-bypass' }),
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

  expect(collectStorageWritePatternViolations([owner])).toEqual([]);
  expect(collectStorageWritePatternViolations([sibling])).toEqual([
    expect.objectContaining({ rule: 'persistence-authority-owner-bypass' }),
  ]);
});

it('flags hot-path save functions that scan the full persistence state', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/db/example.ts',
    [
      'export async function saveExampleRecord() {',
      '  const db = await initDB();',
      "  const all = await db.getAll('records');",
      '  return all.length;',
      '}',
    ].join('\n')
  );

  expect(collectStorageWritePatternViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'storage-write-patterns',
      file: expect.stringContaining('apps/extension/src/composition/persistence/db/example.ts'),
      message: expect.stringContaining('scans full persistence state on the hot path'),
    }),
  ]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runStorageWritePatternCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
}, 60_000);
