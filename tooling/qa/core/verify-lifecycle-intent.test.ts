import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectLifecycleIntentViolations,
  runLifecycleIntentCheck,
} from './verify-lifecycle-intent.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-lifecycle-intent-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags reconnect timers without explicit disconnect intent guards', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/runtime/transport.ts',
    [
      'export function reconnectPreviewTransport() {',
      '  setTimeout(() => retryConnection(), 100);',
      '}',
    ].join('\n')
  );

  expect(collectLifecycleIntentViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'lifecycle-intent',
      file: expect.stringContaining('apps/extension/src/content/runtime/transport.ts'),
    }),
  ]);
});

it('allows reconnect timers that track explicit disconnect intent', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/runtime/transport.ts',
    [
      'export function reconnectPreviewTransport(disconnectRequested) {',
      '  if (disconnectRequested) {',
      '    return;',
      '  }',
      '  setTimeout(() => retryConnection(), 100);',
      '}',
    ].join('\n')
  );

  expect(collectLifecycleIntentViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runLifecycleIntentCheck({
    scope: 'repo-wide',
    collectFiles: () => ['tooling/qa/core/verify-lifecycle-intent.mjs'],
  });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
