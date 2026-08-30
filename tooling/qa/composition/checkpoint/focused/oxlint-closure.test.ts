import { expect, it } from 'vitest';

import { requiresFullOxlintClosure } from './execution.mjs';

it.each([
  '.oxlintrc.json',
  '.oxlintrc.strict.json',
  'package.json',
  'package-lock.json',
  'tooling/qa/guards/quality/verify-oxlint.mjs',
])('expands Oxlint to the repository for %s', (file) => {
  expect(requiresFullOxlintClosure([file])).toBe(true);
});

it('keeps unrelated diffs on focused Oxlint', () => {
  expect(requiresFullOxlintClosure(['apps/extension/src/content/view.ts'])).toBe(false);
});
