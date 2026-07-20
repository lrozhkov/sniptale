import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

it('keeps oxlint scoped to JS-like files and skips empty scopes', async () => {
  const module = await import('./verify-oxlint.mjs');

  expect(
    module.collectOxlintFiles([
      'tooling/qa/core/verify-oxlint.mjs',
      'docs/readme.md',
      '.tmp/generated.ts',
    ])
  ).toEqual(['tooling/qa/core/verify-oxlint.mjs']);
  expect(module.runOxlint({ files: [] }).step).toEqual(
    expect.objectContaining({
      label: 'Oxlint',
      status: 'skipped',
    })
  );
});

it('runs strict oxlint shape and hook limits as errors', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];

  module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(calls[0]?.[1]).toEqual(
    expect.arrayContaining([
      '--react-plugin',
      '--vitest-plugin',
      '--jsx-a11y-plugin',
      '-D',
      'max-lines',
      '-D',
      'max-lines-per-function',
      '-D',
      'exhaustive-deps',
      '-D',
      'vitest/no-focused-tests',
      '-D',
      'vitest/no-disabled-tests',
      '-D',
      'jsx-a11y/aria-props',
      '-D',
      'react/jsx-no-target-blank',
      '--format',
      'unix',
      'tooling/qa/core/verify-oxlint.mjs',
      '--quiet',
    ])
  );
});

it('can run oxlint without size rules for import-only focused files', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];

  module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    sizeRules: false,
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(calls[0]?.[1]).toEqual(expect.not.arrayContaining(['max-lines']));
  expect(calls[0]?.[1]).toEqual(expect.not.arrayContaining(['max-lines-per-function']));
  expect(calls[0]?.[1]).toEqual(
    expect.arrayContaining([
      '--react-plugin',
      '--vitest-plugin',
      '--jsx-a11y-plugin',
      '--format',
      'unix',
      'tooling/qa/core/verify-oxlint.mjs',
      '--quiet',
    ])
  );
});

it('expands oxlint directories for release scans', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];

  module.runOxlint({
    files: ['tooling/qa/core'],
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(calls[0]?.[1]).toEqual(expect.arrayContaining(['tooling/qa/core/verify-oxlint.mjs']));
});

it('uses only current canonical default oxlint roots', async () => {
  const module = await import('./verify-oxlint.mjs');

  expect(module.DEFAULT_OXLINT_ROOTS).toContain('apps/extension/build');
  expect(module.DEFAULT_OXLINT_ROOTS).not.toContain('scripts');
  expect(
    module.DEFAULT_OXLINT_ROOTS.every((root) =>
      fs.statSync(path.join(process.cwd(), root)).isDirectory()
    )
  ).toBe(true);
});
