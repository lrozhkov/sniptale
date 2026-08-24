import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

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

it('uses the single checked-in Oxlint policy authority', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];

  module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(calls[0]?.[1]).toEqual([
    '--config',
    '.oxlintrc.json',
    '--deny-warnings',
    '--format',
    'unix',
    'tooling/qa/core/verify-oxlint.mjs',
  ]);

  const config = JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8')) as {
    options: { typeAware: boolean };
    rules: Record<string, string>;
  };
  expect(config.options.typeAware).toBe(true);
  expect(config.rules).toMatchObject({
    'jsx-a11y/aria-props': 'error',
    'vitest/no-focused-tests': 'error',
  });
  expect(config.rules).not.toHaveProperty('react/only-export-components');
});

it('binds strict security mode and scheduler CPU tokens to the same Oxlint process', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];
  module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    strictSecurity: true,
    threads: 6,
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  expect(calls[0]?.[1]).toEqual(
    expect.arrayContaining(['.oxlintrc.strict.json', '--threads=6', '--deny-warnings'])
  );
  expect(() =>
    module.runOxlint({ files: ['tooling/qa/core/verify-oxlint.mjs'], threads: 0 })
  ).toThrow('Oxlint threads must be a positive integer.');
});

it('keeps fix mode behind the canonical wrapper and enum guard', async () => {
  const module = await import('./verify-oxlint.mjs');
  const calls: unknown[][] = [];
  const contractEnumCollector = vi.fn(() => []);

  module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    fix: true,
    commandRunner: (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: '', stderr: '' };
    },
    contractEnumCollector,
  });

  expect(calls[0]?.[1]).toEqual(
    expect.arrayContaining(['--config', '.oxlintrc.json', '--fix', '--deny-warnings'])
  );
  expect(contractEnumCollector).toHaveBeenCalledOnce();
});

it('runs the TS6 contract enum guard over the same canonical target closure', async () => {
  const module = await import('./verify-oxlint.mjs');
  const contractEnumCollector = vi.fn(() => [
    {
      rule: 'contract-enum',
      file: 'tooling/qa/core/verify-oxlint.mjs',
      line: 1,
      column: 1,
      message: 'fixture violation',
    },
  ]);

  const result = module.runOxlint({
    files: ['tooling/qa/core/verify-oxlint.mjs'],
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' }),
    contractEnumCollector,
  });

  expect(contractEnumCollector).toHaveBeenCalledWith(['tooling/qa/core/verify-oxlint.mjs']);
  expect(result.step).toMatchObject({
    status: 'failed',
    exitCode: 1,
    stderr: expect.stringContaining('[contract-enum]'),
  });
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

it('keeps the canonical roots equal to the complete supported repository lint inventory', async () => {
  const module = await import('./verify-oxlint.mjs');
  const repoWideFiles = module.collectOxlintFiles(['.']);
  const canonicalFiles = module.collectOxlintFiles(module.DEFAULT_OXLINT_ROOTS);

  expect(module.REPO_WIDE_OXLINT_FILES).toEqual([
    '.dependency-cruiser.cjs',
    'apps/extension/postcss.config.js',
    'apps/extension/public/popup-theme-paint.js',
    'apps/extension/tailwind.config.js',
    'apps/extension/vite.config.ts',
    'playwright.config.ts',
    'vitest.config.ts',
  ]);
  expect(canonicalFiles).toEqual(repoWideFiles);
});

it('uses only current canonical default oxlint roots', async () => {
  const module = await import('./verify-oxlint.mjs');

  expect(module.DEFAULT_OXLINT_ROOTS).toContain('apps/extension/build');
  expect(module.DEFAULT_OXLINT_ROOTS).not.toContain('scripts');
  expect(
    module.DEFAULT_OXLINT_ROOTS.every((root) => fs.existsSync(path.join(process.cwd(), root)))
  ).toBe(true);
});
