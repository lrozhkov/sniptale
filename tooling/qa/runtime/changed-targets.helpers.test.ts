import { describe, expect, it } from 'vitest';

import { createChangedFileTargets, parseChangedLineMap } from './changed-targets.helpers.mjs';

function buildLongLine(length: number) {
  const prefix = "const value = '";
  const suffix = "';";

  return `${prefix}${'x'.repeat(Math.max(0, length - prefix.length - suffix.length))}${suffix}`;
}

describe('parseChangedLineMap', () => {
  it('parses staged diff hunks into post-image line numbers', () => {
    const diffText = [
      'diff --git a/src/example.ts b/src/example.ts',
      'index 1111111..2222222 100644',
      '--- a/src/example.ts',
      '+++ b/src/example.ts',
      '@@ -1 +1 @@',
      "-const value = 'short';",
      `+${buildLongLine(121)}`,
      '@@ -4,0 +5,2 @@',
      "+const first = 'a';",
      "+const second = 'b';",
      '',
    ].join('\n');

    const changedLines = parseChangedLineMap(diffText);

    expect([...(changedLines.get('src/example.ts') ?? [])]).toEqual([1, 5, 6]);
  });
});

function verifiesMergedTargets() {
  const stagedDiffText = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -2 +2 @@',
    "-const staged = 'old';",
    `+${buildLongLine(121)}`,
    '',
  ].join('\n');
  const unstagedDiffText = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -7,0 +8 @@',
    `+${buildLongLine(125)}`,
    '',
  ].join('\n');

  const targets = createChangedFileTargets({
    addedFiles: ['src/staged-new.ts'],
    deletedFiles: ['src/deleted.ts'],
    stagedDiffText,
    unstagedDiffText,
    untrackedFiles: ['src/new-file.ts'],
  });

  expect(targets.addedFiles).toEqual(['src/new-file.ts', 'src/staged-new.ts']);
  expect(targets.changedFiles).toEqual([
    'src/deleted.ts',
    'src/example.ts',
    'src/new-file.ts',
    'src/staged-new.ts',
  ]);
  expect(targets.deletedFiles).toEqual(['src/deleted.ts']);
  expect([...(targets.changedLineMap.get('src/example.ts') ?? [])]).toEqual([2, 8]);
  expect(targets.untrackedFiles.has('src/new-file.ts')).toBe(true);
}

function verifiesRenameTargets() {
  const targets = createChangedFileTargets({
    addedFiles: ['src/new-owner.ts'],
    deletedFiles: ['src/old-owner.ts'],
    renamedFiles: ['src/new-owner.ts'],
    renamedSources: ['src/old-owner.ts'],
  });

  expect(targets.addedFiles).toEqual([]);
  expect(targets.deletedFiles).toEqual([]);
  expect(targets.changedFiles).toEqual(['src/new-owner.ts']);
  expect([...(targets.changedLineMap.get('src/new-owner.ts') ?? [])]).toEqual([]);
}

describe('createChangedFileTargets', () => {
  it('merges staged, unstaged, and untracked targets into one change set', verifiesMergedTargets);
  it('tracks rename destinations without treating them as added files', verifiesRenameTargets);
});
