import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { toRelativePath } from '../../analysis/repository/shared-paths.mjs';
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

it('detects every active ESLint suppression comment form without requiring leading whitespace', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.ts',
    [
      'run();// eslint-disable-line no-console',
      'run();/* eslint-disable */',
      '// eslint-disable-next-line no-console',
      'run();',
    ].join('\n')
  );
  const relativeFile = toRelativePath(file);

  expect(
    collectSuppressionDirectiveViolations([file], {
      untrackedFiles: new Set([relativeFile]),
    }).map(({ line, rule }) => ({ line, rule }))
  ).toEqual([
    { line: 1, rule: 'eslint-suppression-directive' },
    { line: 2, rule: 'eslint-suppression-directive' },
    { line: 3, rule: 'eslint-suppression-directive' },
  ]);
});

it('detects active TypeScript line directives including header nocheck', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/example.ts',
    [
      '// @ts-nocheck',
      '// @ts-ignore',
      'brokenCall();',
      '// @ts-expect-error deliberate fixture',
      'brokenCall();',
    ].join('\n')
  );
  const relativeFile = toRelativePath(file);

  expect(
    collectSuppressionDirectiveViolations([file], {
      untrackedFiles: new Set([relativeFile]),
    }).map(({ line, rule }) => ({ line, rule }))
  ).toEqual([
    { line: 1, rule: 'typescript-suppression-directive' },
    { line: 2, rule: 'typescript-suppression-directive' },
    { line: 4, rule: 'typescript-suppression-directive' },
  ]);
});

it('ignores directive text outside active JS/TS suppression comments', () => {
  const root = createTempRoot();
  const sourceFile = writeFile(
    root,
    'src/example.ts',
    [
      'const fixture = `// eslint-disable-next-line no-console`;',
      '/* @ts-nocheck */',
      'const stable = true;',
      '// @ts-nocheck',
      '// eslint-enable no-console',
      '// mentions @ts-ignore without activating it',
    ].join('\n')
  );
  const cssFile = writeFile(root, 'src/example.css', '/* eslint-disable color-no-invalid-hex */\n');
  const pythonFile = writeFile(root, 'src/example.py', '"// @ts-ignore"\n');

  expect(collectSuppressionDirectiveViolations([sourceFile, cssFile, pythonFile])).toEqual([]);
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

it('checks explicit production files in focused/manual mode', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/runtime.ts',
    '// eslint-disable-next-line no-console\nexport const value = 1;\n'
  );
  const previous = process.cwd();
  process.chdir(root);
  try {
    expect(runSuppressionDirectiveCheck({ files: [file] }).violations).toEqual([
      expect.objectContaining({ line: 1, rule: 'eslint-suppression-directive' }),
    ]);
  } finally {
    process.chdir(previous);
  }
});
