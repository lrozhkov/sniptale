import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../test-support/test-helpers';

function createQualityTempRoot(prefix: string) {
  const root = createTempRoot(prefix);
  writeFile(
    root,
    'tooling/configs/qa/quality-baseline.json',
    '{"schemaVersion":1,"allowances":[]}\n'
  );
  return root;
}

it('keeps model text budgets out of active QA runtime and manifests', () => {
  function collectFiles(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) return collectFiles(file);
      return /\.test\.[cm]?[jt]sx?$/u.test(file) ? [] : [file];
    });
  }
  const files = [
    'package.json',
    'package-lock.json',
    '.oxlintrc.json',
    ...collectFiles('tooling/configs/qa'),
    ...collectFiles('tooling/qa'),
  ];
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  expect(source).not.toMatch(
    /maxLogicTokens|tokenHotspots|tokenHotspotCount|topTokenHotspots|hotspot-regression-tokens|max-file-tokens|isTokenBudgetFile|TOKEN_BUDGET|tiktoken|verify-ai-limits|verify-hotspot-regression/u
  );
  expect(fs.existsSync('tooling/qa/core/verify-ai-limits.mjs')).toBe(false);
  expect(fs.existsSync('tooling/qa/core/verify-hotspot-regression.mjs')).toBe(false);
});

it('keeps markdown documents outside standalone Oxfmt scope', () => {
  expect(fs.readFileSync('.oxfmtignore', 'utf8')).toContain('*.md');
});

it('flags only changed long lines in verify-line-length', async () => {
  const root = createQualityTempRoot('verify-line-length-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"verify-line-length-temp"}\n');
  writeFile(root, 'src/example.ts', 'export const shortValue = 1;\n');
  runGit(root, 'add', 'package.json', 'src/example.ts');
  runGit(root, 'commit', '-m', 'init');
  writeFile(root, 'src/example.ts', `export const value = "${'x'.repeat(130)}";\n`);

  const result = await withCwd(root, async () => {
    const module = await importFresh<
      typeof import('../../guards/quality/readability/line-length/check.mjs')
    >('../../guards/quality/readability/line-length/check.mjs', import.meta.url);
    return module.runLineLengthCheck({ scope: 'workspace' });
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'max-line-length',
      file: 'src/example.ts',
      line: 1,
    }),
  ]);
});

it('skips markdown documents in verify-line-length', async () => {
  const root = createQualityTempRoot('verify-line-length-docs-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"verify-line-length-docs-temp"}\n');
  writeFile(root, 'docs/notes.md', 'short note\n');
  runGit(root, 'add', 'package.json', 'docs/notes.md');
  runGit(root, 'commit', '-m', 'init');
  writeFile(root, 'docs/notes.md', `${'documentation prose '.repeat(20)}\n`);

  const result = await withCwd(root, async () => {
    const module = await importFresh<
      typeof import('../../guards/quality/readability/line-length/check.mjs')
    >('../../guards/quality/readability/line-length/check.mjs', import.meta.url);
    return module.runLineLengthCheck({ scope: 'workspace' });
  });

  expect(result).toMatchObject({
    skipped: true,
    files: [],
    violations: [],
  });
});
