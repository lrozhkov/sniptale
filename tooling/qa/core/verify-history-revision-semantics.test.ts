import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectHistoryRevisionSemanticsViolations } from './verify-history-revision-semantics.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-history-revision-semantics-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags Date.now in history seams', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/scenario-editor-controller.project-history.ts',
    'export function stampRevision() { return Date.now(); }\n'
  );

  expect(collectHistoryRevisionSemanticsViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'history-revision-semantics',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/scenario-editor-controller.project-history.ts'
      ),
    }),
  ]);
});

it('ignores Date.now outside history seams', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/scenario-editor-controller.helpers.ts',
    'export function stampUpdatedAt() { return Date.now(); }\n'
  );

  expect(collectHistoryRevisionSemanticsViolations([file])).toEqual([]);
});
