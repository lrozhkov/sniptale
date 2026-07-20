import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { toRelativePath } from '../../core/shared.mjs';
import {
  collectSuppressionDirectiveViolations,
  runSuppressionDirectiveCheck,
} from './verify-suppression-directives.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-suppression-directives-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function writeRuntimeSuppressionFixtures(root: string) {
  const contents = [
    'const stable = true;',
    '// eslint-disable-next-line max-lines-per-function',
    'export const next = 1;',
  ].join('\n');

  writeFile(root, 'apps/extension/src/runtime.ts', contents);
  writeFile(root, 'apps/extension/src/runtime.test.ts', contents);
  writeFile(root, 'tooling/test/harness/runtime.ts', contents);
}

it('flags new ESLint suppression directives on changed lines only', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.ts',
    ['const stable = true;', '/* eslint-disable max-lines-per-function */', 'const next = 1;'].join(
      '\n'
    )
  );
  const relativeFile = toRelativePath(file);

  expect(
    collectSuppressionDirectiveViolations([file], {
      changedLineMap: new Map([[relativeFile, new Set([2])]]),
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'eslint-suppression-directive',
      file: relativeFile,
      line: 2,
    }),
  ]);
});

it('ignores untouched legacy suppression lines when another line changed', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.ts',
    [
      '// eslint-disable-next-line react-hooks/exhaustive-deps',
      'const stable = true;',
      'const next = 1;',
    ].join('\n')
  );
  const relativeFile = toRelativePath(file);

  expect(
    collectSuppressionDirectiveViolations([file], {
      changedLineMap: new Map([[relativeFile, new Set([3])]]),
    })
  ).toEqual([]);
});

it('flags TypeScript suppression directives in untracked files', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.ts',
    ['const value = true;', '// @ts-expect-error temporary escape hatch', 'useValue(value);'].join(
      '\n'
    )
  );
  const relativeFile = toRelativePath(file);

  expect(
    collectSuppressionDirectiveViolations([file], {
      untrackedFiles: new Set([relativeFile]),
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'typescript-suppression-directive',
      file: relativeFile,
      line: 2,
    }),
  ]);
});

it('flags legacy production suppressions while ignoring tests and test harness files', async () => {
  const root = createTempRoot();

  writeRuntimeSuppressionFixtures(root);

  const previous = process.cwd();
  process.chdir(root);
  try {
    vi.resetModules();
    const module = await import('./verify-suppression-directives.mjs');
    const result = module.runSuppressionDirectiveCheck({
      scope: 'production',
    });

    expect(result.files).toEqual(['apps/extension/src/runtime.ts']);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'apps/extension/src/runtime.ts',
        line: 2,
        rule: 'eslint-suppression-directive',
      }),
    ]);
  } finally {
    process.chdir(previous);
  }
});

it('ignores explicit test files in focused/manual file mode', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.test.ts',
    [
      'const stable = true;',
      '// eslint-disable-next-line max-lines-per-function',
      'export const next = 1;',
    ].join('\n')
  );

  expect(runSuppressionDirectiveCheck({ files: [file] })).toEqual({
    files: [],
    violations: [],
  });
});
