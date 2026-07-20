import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { resolveGitDir } from './git-object-store.mjs';
import { createTempRoot } from './test-helpers';

it('resolves a direct git directory', () => {
  const root = createTempRoot('git-object-store-directory-');
  fs.mkdirSync(path.join(root, '.git'));

  expect(resolveGitDir(root)).toBe(path.join(root, '.git'));
});

it('resolves git indirection through the same opened file descriptor', () => {
  const root = createTempRoot('git-object-store-indirection-');
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: .git-worktree\n');

  expect(resolveGitDir(root)).toBe(path.join(root, '.git-worktree'));
});

it('rejects malformed git indirection', () => {
  const root = createTempRoot('git-object-store-malformed-');
  fs.writeFileSync(path.join(root, '.git'), 'not-a-gitdir\n');

  expect(() => resolveGitDir(root)).toThrow('Unsupported .git indirection format');
});
