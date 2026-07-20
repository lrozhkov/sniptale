import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectHistoryDetachedSnapshotViolations,
  runHistoryDetachedSnapshotCheck,
} from './verify-history-detached-snapshots.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-history-detached-snapshots-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags direct snapshot references stored in history arrays and objects', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/project/mutation/history/step/history.ts',
    [
      'export function pushScenarioStepHistory(step, currentStep) {',
      '  return {',
      '    past: [step],',
      '    future: [currentStep],',
      '    restoredStep: step,',
      '  };',
      '}',
    ].join('\n')
  );

  expect(collectHistoryDetachedSnapshotViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'history-detached-snapshots',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/project/mutation/history/step/history.ts'
      ),
    }),
    expect.objectContaining({
      rule: 'history-detached-snapshots',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/project/mutation/history/step/history.ts'
      ),
    }),
    expect.objectContaining({
      rule: 'history-detached-snapshots',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/project/mutation/history/step/history.ts'
      ),
    }),
  ]);
});

it('allows clone-wrapped snapshot history values', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/project/mutation/history/project/helpers.ts',
    [
      'export function buildProjectHistorySnapshot(project, step) {',
      '  return {',
      '    project: cloneHistorySnapshot(project),',
      '    past: [cloneHistorySnapshot(step)],',
      '    restoredStep: cloneHistorySnapshot(step),',
      '  };',
      '}',
    ].join('\n')
  );

  expect(collectHistoryDetachedSnapshotViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runHistoryDetachedSnapshotCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
