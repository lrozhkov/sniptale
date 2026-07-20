import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../core/test-helpers';

async function runCheck(root: string, targetFiles: string[]) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-manual-mock-export-parity.mjs')>(
      './verify-manual-mock-export-parity.mjs',
      import.meta.url
    );
    return module.runManualMockExportParityCheck({ targetFiles });
  });
}

function writeSharedModule(root: string) {
  writeFile(
    root,
    'src/shared/example/index.ts',
    [
      'export function createExample() { return true; }',
      'export const readExample = () => true;',
      'export type Example = { id: string };',
      '',
    ].join('\n')
  );
}

it('fails object mocks that miss named exports from a changed module', async () => {
  const root = createTempRoot('manual-mock-parity-missing-');
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));\n"
  );

  const result = await runCheck(root, ['src/shared/example/index.ts']);

  expect(result.violations).toEqual([
    expect.objectContaining({
      file: 'src/feature/example.test.ts',
      message: expect.stringContaining('readExample'),
    }),
  ]);
  expect(result.violations[0]?.message).toContain('Example');
});

it('checks changed mock files even when the real module is unchanged', async () => {
  const root = createTempRoot('manual-mock-parity-changed-test-');
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: vi.fn(), readExample: vi.fn() }));\n"
  );

  const result = await runCheck(root, ['src/feature/example.test.ts']);

  expect(result.violations).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('Example'),
    }),
  ]);
});

it('passes complete object mocks', async () => {
  const root = createTempRoot('manual-mock-parity-complete-');
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    [
      "vi.mock('../shared/example', () => ({",
      '  createExample: vi.fn(),',
      '  readExample: vi.fn(),',
      '  Example: vi.fn(),',
      '}));',
      '',
    ].join('\n')
  );

  const result = await runCheck(root, ['src/shared/example/index.ts']);

  expect(result.violations).toEqual([]);
});

it('skips importOriginal partial mocks and dynamic factories', async () => {
  const root = createTempRoot('manual-mock-parity-partial-');
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    [
      "vi.mock('../shared/example', async (importOriginal) => {",
      '  const actual = await importOriginal();',
      '  return { ...actual, createExample: vi.fn() };',
      '});',
      "vi.mock('../shared/dynamic', () => createDynamicMock());",
      '',
    ].join('\n')
  );
  writeFile(root, 'src/shared/dynamic.ts', 'export const dynamicValue = 1;\n');

  const result = await runCheck(root, ['src/shared/example/index.ts', 'src/shared/dynamic.ts']);

  expect(result.violations).toEqual([]);
});

it('does not fail legacy mocks outside the changed module or changed mock scope', async () => {
  const root = createTempRoot('manual-mock-parity-scope-');
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));\n"
  );
  writeFile(root, 'src/feature/changed.ts', 'export const changed = true;\n');

  const result = await runCheck(root, ['src/feature/changed.ts']);

  expect(result.violations).toEqual([]);
});

it('does not rescan incomplete object mocks for import-only test diffs', async () => {
  const root = createTempRoot('manual-mock-parity-import-only-');
  initGitRepo(root);
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    [
      "import { VideoQuality } from '../shared/video-types';",
      "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));",
      'expect(VideoQuality).toBeTruthy();',
      '',
    ].join('\n')
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'src/feature/example.test.ts',
    [
      "import { VideoQuality } from '../shared/video-types/types';",
      "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));",
      'expect(VideoQuality).toBeTruthy();',
      '',
    ].join('\n')
  );

  const result = await runCheck(root, ['src/feature/example.test.ts']);

  expect(result.violations).toEqual([]);
});

it('does not rescan incomplete object mocks for import-only module diffs', async () => {
  const root = createTempRoot('manual-mock-parity-import-only-module-');
  initGitRepo(root);
  writeFile(
    root,
    'src/shared/example/index.ts',
    [
      "import { VideoQuality } from '../video-types';",
      'export function createExample() { return VideoQuality.HIGH; }',
      'export const readExample = () => true;',
      'export type Example = { id: string };',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'src/shared/example/index.ts',
    [
      "import { VideoQuality } from '../video-types/types';",
      'export function createExample() { return VideoQuality.HIGH; }',
      'export const readExample = () => true;',
      'export type Example = { id: string };',
      '',
    ].join('\n')
  );

  const result = await runCheck(root, ['src/shared/example/index.ts']);

  expect(result.violations).toEqual([]);
});

it('does not report an existing mock deficit when the missing export is renamed', async () => {
  const root = createTempRoot('manual-mock-parity-renamed-export-');
  initGitRepo(root);
  writeFile(
    root,
    'src/shared/example/index.ts',
    'export const createExample = true;\nexport const previousReader = true;\n'
  );
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: true }));\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'src/shared/example/index.ts',
    'export const createExample = true;\nexport const currentReader = true;\n'
  );

  const result = await runCheck(root, ['src/shared/example/index.ts']);

  expect(result.violations).toEqual([]);
});

it('reports only a net-new deficit when an export is added beside existing debt', async () => {
  const root = createTempRoot('manual-mock-parity-net-new-');
  initGitRepo(root);
  writeSharedModule(root);
  writeFile(
    root,
    'src/feature/example.test.ts',
    "vi.mock('../shared/example', () => ({ createExample: vi.fn() }));\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'src/shared/example/index.ts',
    [
      'export function createExample() { return true; }',
      'export const readExample = () => true;',
      'export type Example = { id: string };',
      'export const addedReader = () => true;',
      '',
    ].join('\n')
  );

  const result = await runCheck(root, ['src/shared/example/index.ts']);

  expect(result.violations).toEqual([
    expect.objectContaining({ message: expect.stringContaining('addedReader') }),
  ]);
});
