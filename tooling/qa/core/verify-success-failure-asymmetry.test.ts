import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectSuccessFailureAsymmetryViolations,
  runSuccessFailureAsymmetryCheck,
} from './verify-success-failure-asymmetry.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-success-failure-asymmetry-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags local state transitions that happen before awaited persistence without recovery', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/settings/controller.ts',
    [
      'export async function saveSettings(setOpen) {',
      '  setOpen(false);',
      '  await persistSettings();',
      '}',
    ].join('\n')
  );

  expect(collectSuccessFailureAsymmetryViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'success-failure-asymmetry',
      file: expect.stringContaining('apps/extension/src/settings/controller.ts'),
    }),
  ]);
});

it('allows flows with explicit rollback or failure handling', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/settings/controller.ts',
    [
      'export async function saveSettings(setOpen) {',
      '  setOpen(false);',
      '  try {',
      '    await persistSettings();',
      '  } catch (error) {',
      '    setOpen(true);',
      '    throw error;',
      '  }',
      '}',
    ].join('\n')
  );

  expect(collectSuccessFailureAsymmetryViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runSuccessFailureAsymmetryCheck({
    scope: 'repo-wide',
    collectFiles: () => ['tooling/qa/core/verify-success-failure-asymmetry.mjs'],
  });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
