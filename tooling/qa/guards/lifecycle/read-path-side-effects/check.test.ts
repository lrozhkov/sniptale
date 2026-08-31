import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectReadPathSideEffectViolations, runReadPathSideEffectCheck } from './check.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-read-path-side-effects-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags read-style functions that trigger sync/write helpers', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/media-library/index.library.ts',
    [
      'export async function listMediaLibrary() {',
      '  await syncLegacyMediaLibrary();',
      '  return [];',
      '}',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'read-path-side-effects',
      file: expect.stringContaining(
        'apps/extension/src/composition/persistence/media-library/index.library.ts'
      ),
    }),
  ]);
});

it('flags read-style functions that call same-file helper writers', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/prompt-templates-storage.ts',
    [
      'async function initializeDefaultTemplates() {',
      '  await browserStorage.local.set({ templates: [] });',
      '}',
      'export async function getPromptTemplates() {',
      '  return initializeDefaultTemplates();',
      '}',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'read-path-side-effects',
      file: expect.stringContaining(
        'apps/extension/src/composition/persistence/storage/prompt-templates-storage.ts'
      ),
    }),
  ]);
});

it('tracks same-file writer aliases', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/aliases.ts',
    [
      'async function saveDefaults() { await browserStorage.local.set({ value: true }); }',
      'const persist = saveDefaults;',
      'export async function loadDefaults() { return persist(); }',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([
    expect.objectContaining({ rule: 'read-path-side-effects' }),
  ]);
});

it('does not execute an uninvoked nested writer closure', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/nested.ts',
    [
      'export async function getSettings() {',
      '  const saveLater = async () => browserStorage.local.set({ value: true });',
      '  return browserStorage.local.get(["settings"]);',
      '}',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([]);
});

it('does not treat arbitrary state setters as persistence writes', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/features/media-hub/read.ts',
    'export function loadSelection(setOpen) { setOpen(true); return []; }\n'
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([]);
});

it('flags resolve and ensure read-like seams that repair persisted state', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/preference-service/example.ts',
    [
      'async function cleanupLegacyPreference() {',
      "  await browserStorage.local.remove('legacy');",
      '}',
      'export async function resolveStoredPreference() {',
      '  await cleanupLegacyPreference();',
      "  return 'ok';",
      '}',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'read-path-side-effects',
      file: expect.stringContaining(
        'apps/extension/src/composition/persistence/infrastructure/preference-service/example.ts'
      ),
    }),
  ]);
});

it('allows pure read-style functions in targeted seams', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/example.ts',
    [
      'export async function getSettings() {',
      '  return browserStorage.local.get(["settings"]);',
      '}',
    ].join('\n')
  );

  expect(collectReadPathSideEffectViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runReadPathSideEffectCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
