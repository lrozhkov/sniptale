import { describe, expect, it } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';

import { createTempRoot, initGitRepo, runGit, withCwd, writeFile } from '../core/test-helpers';

describe('resolveScopedTargetFiles', () => {
  it('returns changed code files for workspace scope', async () => {
    const root = createTempRoot('qa-target-files-');
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-target-files-temp"}\n');
    writeFile(root, 'src/example.ts', 'export const stable = 1;\n');
    runGit(root, 'add', 'package.json', 'src/example.ts');
    runGit(root, 'commit', '-m', 'init');
    writeFile(root, 'src/example.ts', 'export const next = 2;\n');

    const result = await withCwd(root, async () => {
      const module = await import('./target-files.helpers.mjs');
      return module.resolveScopedTargetFiles();
    });

    expect(result.relativeFiles).toEqual(['src/example.ts']);
    expect(result.skipped).toBe(false);
  });

  it('does not fall back to workspace scope when explicit files filter out', async () => {
    const root = createTempRoot('qa-target-files-explicit-');
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-target-files-temp"}\n');
    writeFile(root, 'src/example.ts', 'export const stable = 1;\n');
    runGit(root, 'add', 'package.json', 'src/example.ts');
    runGit(root, 'commit', '-m', 'init');
    writeFile(root, 'src/example.ts', 'export const next = 2;\n');

    const result = await withCwd(root, async () => {
      const module = await import('./target-files.helpers.mjs');
      return module.resolveScopedTargetFiles({
        files: ['README.md'],
        collectFiles: () => [],
      });
    });

    expect(result.skipped).toBe(true);
    expect(result.relativeFiles).toEqual([]);
    expect(result.files).toEqual([]);
  });
});

it('does not route deleted code files to source-reading checks', async () => {
  const root = createTempRoot('qa-target-files-deleted-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"qa-target-files-temp"}\n');
  writeFile(root, 'src/deleted.ts', 'export const removed = true;\n');
  runGit(root, 'add', 'package.json', 'src/deleted.ts');
  runGit(root, 'commit', '-m', 'init');
  fs.rmSync(path.join(root, 'src/deleted.ts'));

  const result = await withCwd(root, async () => {
    const module = await import('./target-files.helpers.mjs');
    return module.resolveScopedTargetFiles();
  });

  expect(result.relativeFiles).toEqual([]);
  expect(result.files).toEqual([]);
  expect(result.skipped).toBe(true);
});
