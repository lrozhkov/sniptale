import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectDestructiveAsyncSwapViolations,
  runDestructiveAsyncSwapCheck,
} from './verify-destructive-async-swaps.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-destructive-async-swaps-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags teardown-before-await flows that rebuild after async work without recovery', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/hooks/runtime.ts',
    [
      'export async function replacePreview(closePreview, openPreview) {',
      '  closePreview();',
      '  await loadPreview();',
      '  openPreview();',
      '}',
    ].join('\n')
  );

  expect(collectDestructiveAsyncSwapViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'destructive-async-swaps',
      file: expect.stringContaining('apps/extension/src/content/hooks/runtime.ts'),
    }),
  ]);
});

it('allows stale-guarded or recovery-backed async swaps', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/hooks/runtime.ts',
    [
      'export async function replacePreviewSafely(closePreview, openPreview, restorePreview, requestId) {',
      '  closePreview();',
      '  try {',
      '    await loadPreview();',
      '    if (!isCurrent(requestId)) return;',
      '    openPreview();',
      '  } catch (error) {',
      '    restorePreview();',
      '    throw error;',
      '  }',
      '}',
    ].join('\n')
  );

  expect(collectDestructiveAsyncSwapViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runDestructiveAsyncSwapCheck({
    scope: 'repo-wide',
    collectFiles: () => ['tooling/qa/core/verify-destructive-async-swaps.mjs'],
  });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
