import fs from 'node:fs';

import { expect, it } from 'vitest';

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

it('reports oversized files through verify-ai-limits', async () => {
  const root = createQualityTempRoot('verify-ai-limits-');
  writeFile(root, 'tooling/qa/oversized.ts', `${'const value = 1;\n'.repeat(301)}`);

  const module = await withCwd(root, async () =>
    importFresh<typeof import('./verify-ai-limits.mjs')>('./verify-ai-limits.mjs')
  );

  expect(module.runAiLimitCheck({ files: ['tooling/qa/oversized.ts'] }).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'max-file-lines',
        file: 'tooling/qa/oversized.ts',
      }),
    ])
  );
});

it('reports token-heavy files through verify-ai-limits', async () => {
  const root = createQualityTempRoot('verify-ai-limits-');
  writeFile(
    root,
    'packages/foundation/src/heavy.ts',
    `export const payload = [${'"value",'.repeat(2500)}];\n`
  );

  const module = await withCwd(root, async () =>
    importFresh<typeof import('./verify-ai-limits.mjs')>('./verify-ai-limits.mjs')
  );

  expect(
    module.runAiLimitCheck({ files: ['packages/foundation/src/heavy.ts'] }).violations
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'max-file-tokens',
        file: 'packages/foundation/src/heavy.ts',
      }),
    ])
  );
});

it('includes normalized video-editor authority paths in token budget checks', async () => {
  const root = createQualityTempRoot('verify-video-editor-token-budget-');
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state/heavy.ts',
    `export const payload = [${'"value",'.repeat(2500)}];\n`
  );

  const module = await withCwd(root, async () =>
    importFresh<typeof import('./verify-ai-limits.mjs')>('./verify-ai-limits.mjs')
  );

  expect(
    module.runAiLimitCheck({
      files: ['apps/extension/src/video-editor/project/state/heavy.ts'],
    }).violations
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'max-file-tokens',
        file: 'apps/extension/src/video-editor/project/state/heavy.ts',
      }),
    ])
  );
});

it('includes normalized editor authority paths in token budget checks', async () => {
  const root = createQualityTempRoot('verify-editor-token-budget-');
  writeFile(
    root,
    'apps/extension/src/editor/controller/core/heavy.ts',
    `export const payload = [${'"value",'.repeat(2500)}];\n`
  );

  const module = await withCwd(root, async () =>
    importFresh<typeof import('./verify-ai-limits.mjs')>('./verify-ai-limits.mjs')
  );

  expect(
    module.runAiLimitCheck({
      files: ['apps/extension/src/editor/controller/core/heavy.ts'],
    }).violations
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'max-file-tokens',
        file: 'apps/extension/src/editor/controller/core/heavy.ts',
      }),
    ])
  );
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
