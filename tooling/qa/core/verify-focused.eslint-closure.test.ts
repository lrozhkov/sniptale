import { expect, it, vi } from 'vitest';

import { collectFocusedLintLane, requiresFullEslintClosure } from './verify-focused.execution.mjs';

it.each(['eslint.config.js', 'package.json', 'package-lock.json'])(
  'expands ESLint to the repository for %s',
  (file) => {
    expect(requiresFullEslintClosure([file])).toBe(true);
  }
);

it('keeps unrelated diffs on focused ESLint', () => {
  expect(requiresFullEslintClosure(['apps/extension/src/content/view.ts'])).toBe(false);
});

it('runs every ESLint rule over the repository for a lint-authority change', async () => {
  const eslintRunner = vi.fn(async () => ({ failed: false, output: '' }));

  const result = await collectFocusedLintLane(
    {
      codeFiles: [],
      jsLikeFiles: ['eslint.config.js'],
      qualityCodeFiles: [],
      qualityJsLikeFiles: ['eslint.config.js'],
      shouldRunFullEslint: true,
    },
    { eslintRunner }
  );

  expect(eslintRunner).toHaveBeenCalledWith({ files: ['.'], rulePrefix: null, strict: true });
  expect(result.eslintStep).toMatchObject({ detail: 'full config closure', status: 'ok' });
});
