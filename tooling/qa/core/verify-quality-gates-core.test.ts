import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

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
    'eslint.config.js',
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

it('passes verify-prettier for formatted files and fails for unformatted files', async () => {
  const root = createTempRoot('verify-prettier-');
  writeFile(root, 'good.ts', 'export const value = 1;\n');
  writeFile(root, 'bad.ts', 'export   const value=1;\n');
  writeFile(root, 'README.md', '#Title\n\nA paragraph that should not be formatter-owned.\n');

  const module = await withCwd(root, async () =>
    importFresh<typeof import('./verify-prettier.mjs')>('./verify-prettier.mjs')
  );

  expect((await module.runPrettierCheck(['good.ts'])).failures).toEqual([]);
  expect((await module.runPrettierCheck(['bad.ts'])).failures).toEqual(['bad.ts']);
  expect(await module.runPrettierCheck(['README.md'])).toEqual({
    checkedFiles: [],
    failures: [],
  });
});

it('keeps markdown documents outside standalone prettier scope', () => {
  expect(fs.readFileSync('.prettierignore', 'utf8')).toContain('*.md');
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
    const module = await importFresh<typeof import('../guards/quality/verify-line-length.mjs')>(
      '../guards/quality/verify-line-length.mjs',
      import.meta.url
    );
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
    const module = await importFresh<typeof import('../guards/quality/verify-line-length.mjs')>(
      '../guards/quality/verify-line-length.mjs',
      import.meta.url
    );
    return module.runLineLengthCheck({ scope: 'workspace' });
  });

  expect(result).toMatchObject({
    skipped: true,
    files: [],
    violations: [],
  });
});

it('flags unsafe security sinks and allows sanitized HTML usage', async () => {
  const root = createTempRoot('verify-security-');
  writeFile(root, 'src/unsafe.tsx', ['element.inner', 'HTML = value;\n'].join(''));
  writeFile(
    root,
    'packages/platform/src/security/sanitizers/html.ts',
    [
      'export function writeSanitizedInnerHtml(element, sanitizeHtmlFragment, html) {',
      '  element.innerHTML = sanitizeHtmlFragment(html);',
      '}',
      '',
    ].join('\n')
  );

  const module = await withCwd(root, async () =>
    importFresh<typeof import('../guards/security/verify-security.mjs')>(
      '../guards/security/verify-security.mjs',
      import.meta.url
    )
  );
  expect(module.collectSecurityViolations(['src/unsafe.tsx']).violations).toEqual([
    expect.objectContaining({
      rule: 'security-inner-html',
      file: 'src/unsafe.tsx',
    }),
  ]);
  expect(
    module.collectSecurityViolations(['packages/platform/src/security/sanitizers/html.ts'])
      .violations
  ).toEqual([]);
});

it('ignores test fixtures when collecting security sink violations', async () => {
  const root = createTempRoot('verify-security-tests-');
  writeFile(root, 'src/shared/example.test.ts', 'element.innerHTML = value;\n');

  const module = await withCwd(root, async () =>
    importFresh<typeof import('../guards/security/verify-security.mjs')>(
      '../guards/security/verify-security.mjs',
      import.meta.url
    )
  );

  expect(module.collectSecurityViolations(['src/shared/example.test.ts']).violations).toEqual([]);
});

it('blocks unsafe regex warnings in the security ESLint lane', async () => {
  const module = await import('../guards/security/verify-security.mjs');
  const calls: unknown[] = [];
  const result = await module.runSecurityCheck(['tooling/qa/core/verify-oxlint.mjs'], {
    lintRunner: async (options: unknown) => {
      calls.push(options);
      return {
        failed: calls.length === 2,
        warningCount: calls.length === 2 ? 1 : 0,
        errorCount: 0,
        output: calls.length === 2 ? 'unsafe regex warning' : '',
        results: [],
      };
    },
  });

  expect(calls).toEqual([
    expect.objectContaining({ quiet: true, rulePrefix: 'security/' }),
    expect.objectContaining({
      rulePrefix: 'security/detect-unsafe-regex',
      strict: true,
    }),
  ]);
  expect(result.eslintResult).toEqual(expect.objectContaining({ failed: true, warningCount: 1 }));
});

it('reuses precomputed security findings for covered files', async () => {
  const module = await import('../guards/security/verify-security.mjs');
  const relativeFile = 'tooling/qa/core/verify-oxlint.mjs';
  const lintRunner = vi.fn(async () => {
    throw new Error('covered files must not be linted again');
  });

  const result = await module.runSecurityCheck([relativeFile], {
    eslintResults: [
      {
        errorCount: 0,
        fatalErrorCount: 0,
        filePath: path.join(process.cwd(), relativeFile),
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [
          {
            column: 1,
            line: 1,
            message: 'unsafe regex warning',
            ruleId: 'security/detect-unsafe-regex',
            severity: 1,
          },
        ],
        suppressedMessages: [],
        warningCount: 1,
      },
    ],
    lintRunner,
  });

  expect(lintRunner).not.toHaveBeenCalled();
  expect(result.eslintResult).toEqual(expect.objectContaining({ failed: true, warningCount: 1 }));
});

it('lints only security files missing from shared ESLint results', async () => {
  const module = await import('../guards/security/verify-security.mjs');
  const missingFile = 'tooling/qa/core/verify-oxlint.mjs';
  const lintRunner = vi.fn(async () => ({
    errorCount: 0,
    failed: false,
    output: '',
    results: [],
    warningCount: 0,
  }));

  await module.runSecurityCheck([missingFile], {
    eslintResults: [
      {
        filePath: path.join(process.cwd(), 'apps/extension/src/example.ts'),
        messages: [],
      },
    ],
    lintRunner,
  });

  expect(lintRunner).toHaveBeenCalledTimes(2);
  expect(lintRunner).toHaveBeenNthCalledWith(1, expect.objectContaining({ files: [missingFile] }));
  expect(lintRunner).toHaveBeenNthCalledWith(2, expect.objectContaining({ files: [missingFile] }));
});
