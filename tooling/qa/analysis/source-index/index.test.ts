import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { materializeSourceIndex } from './index.mjs';

const roots: string[] = [];

function write(root: string, relativePath: string, value: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value);
}

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-source-index-'));
  roots.push(root);
  write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { module: 'ESNext', moduleResolution: 'bundler', target: 'ES2020' },
      include: ['src'],
    })
  );
  write(root, 'src/value.ts', 'export const value = 1;\n');
  write(root, 'src/consumer.ts', "import { value } from './value';\nvoid value;\n");
  return root;
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

it('reuses unchanged records and updates only content-digest misses', () => {
  const root = createRoot();
  const cachePath = path.join(root, '.tmp/index.json');
  const tsConfigFilePath = path.join(root, 'tsconfig.json');

  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 2,
  });
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'reused',
    parsedFileCount: 0,
    reusedFileCount: 2,
  });

  write(root, 'src/value.ts', 'export const value = 2;\n');
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'updated',
    parsedFileCount: 1,
    reusedFileCount: 1,
  });
});

it('rebuilds after corrupt cache data or a source-inventory change', () => {
  const root = createRoot();
  const cachePath = path.join(root, '.tmp/index.json');
  const tsConfigFilePath = path.join(root, 'tsconfig.json');
  materializeSourceIndex({ cachePath, tsConfigFilePath });

  fs.writeFileSync(cachePath, '{broken');
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 2,
  });

  write(root, 'src/next.ts', 'export type Next = string;\n');
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 3,
  });
});

it('rebuilds instead of trusting valid JSON with corrupted derived records', () => {
  const root = createRoot();
  const cachePath = path.join(root, '.tmp/index.json');
  const tsConfigFilePath = path.join(root, 'tsconfig.json');
  materializeSourceIndex({ cachePath, tsConfigFilePath });

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const valueRecord = cache.records.find(
    (record: { file: string }) => record.file === 'src/value.ts'
  );
  valueRecord.exports = [];
  fs.writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);

  const rebuilt = materializeSourceIndex({ cachePath, tsConfigFilePath });
  expect(rebuilt.stats).toMatchObject({ cacheStatus: 'rebuilt', parsedFileCount: 2 });
  expect(rebuilt.records.find(({ file }) => file === 'src/value.ts')?.exports).toEqual([
    { exportName: 'value', kind: 'VariableDeclaration' },
  ]);
});

it.each([
  ['an unknown schema', (cache: Record<string, unknown>) => (cache.schemaVersion = 999)],
  ['a partial record population', (cache: any) => cache.records.pop()],
  [
    'an unknown record field',
    (cache: any) => {
      cache.records[0].unexpected = true;
    },
  ],
])('rebuilds after %s', (_label, mutate) => {
  const root = createRoot();
  const cachePath = path.join(root, '.tmp/index.json');
  const tsConfigFilePath = path.join(root, 'tsconfig.json');
  materializeSourceIndex({ cachePath, tsConfigFilePath });
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  mutate(cache);
  fs.writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);

  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 2,
  });
});

it('rebuilds after config drift and after delete/rename inventory drift', () => {
  const root = createRoot();
  const cachePath = path.join(root, '.tmp/index.json');
  const tsConfigFilePath = path.join(root, 'tsconfig.json');
  materializeSourceIndex({ cachePath, tsConfigFilePath });

  write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        noUncheckedIndexedAccess: true,
        target: 'ES2020',
      },
      include: ['src'],
    })
  );
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 2,
  });

  fs.renameSync(path.join(root, 'src/value.ts'), path.join(root, 'src/renamed.ts'));
  expect(materializeSourceIndex({ cachePath, tsConfigFilePath }).stats).toMatchObject({
    cacheStatus: 'rebuilt',
    parsedFileCount: 2,
  });
  expect(fs.readFileSync(cachePath, 'utf8')).not.toContain('src/value.ts');
});

it('indexes local export lists without treating them as module edges', () => {
  const root = createRoot();
  write(root, 'src/local.ts', 'const local = 1;\nexport { local };\n');

  const index = materializeSourceIndex({
    cachePath: path.join(root, '.tmp/index.json'),
    tsConfigFilePath: path.join(root, 'tsconfig.json'),
  });

  expect(index.records.find(({ file }) => file === 'src/local.ts')).toMatchObject({
    exports: [{ exportName: 'local', kind: 'VariableDeclaration' }],
    usages: [],
  });
});
