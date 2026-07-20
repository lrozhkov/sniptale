import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectHistoryTransactionLifecycleViolations } from './verify-history-transaction-lifecycle.mjs';

const tempDirs: string[] = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-history-transaction-lifecycle-'));
  tempDirs.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags effect-driven transaction owners without cancel cleanup', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/components/use-step-badge-popover.ts',
    [
      'import { useEffect } from "react";',
      'import { pagePreparationHistory } from "../logic/page-preparation-history";',
      'export function useDemo(frameId, isOpen) {',
      '  useEffect(() => {',
      '    if (isOpen) {',
      '      pagePreparationHistory.beginTransaction(`step-badge:${frameId}`);',
      '    } else {',
      '      pagePreparationHistory.commitTransaction(`step-badge:${frameId}`);',
      '    }',
      '  }, [frameId, isOpen]);',
      '}',
      '',
    ].join('\n')
  );

  expect(collectHistoryTransactionLifecycleViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'history-transaction-lifecycle',
      file: expect.stringContaining(
        'apps/extension/src/content/components/use-step-badge-popover.ts'
      ),
    }),
  ]);
});

it('allows effect-driven transaction owners with commit and cancel cleanup', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/components/use-step-badge-popover.ts',
    [
      'import { useEffect } from "react";',
      'import { pagePreparationHistory } from "../logic/page-preparation-history";',
      'export function useDemo(frameId, isOpen) {',
      '  useEffect(() => {',
      '    if (isOpen) {',
      '      pagePreparationHistory.beginTransaction(`step-badge:${frameId}`);',
      '    } else {',
      '      pagePreparationHistory.commitTransaction(`step-badge:${frameId}`);',
      '    }',
      '  }, [frameId, isOpen]);',
      '  useEffect(() => {',
      '    return () => {',
      '      pagePreparationHistory.cancelTransaction(`step-badge:${frameId}`);',
      '    };',
      '  }, [frameId]);',
      '}',
      '',
    ].join('\n')
  );

  expect(collectHistoryTransactionLifecycleViolations([file])).toEqual([]);
});

it('ignores non-effect transactional flows such as runtime batch commits', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/ai/pick/controller-submit.ts',
    [
      'import { pagePreparationHistory } from "../logic/page-preparation-history";',
      'export function applyChanges() {',
      '  pagePreparationHistory.beginTransaction("ai-apply:1");',
      '  pagePreparationHistory.commitTransaction("ai-apply:1");',
      '}',
      '',
    ].join('\n')
  );

  expect(collectHistoryTransactionLifecycleViolations([file])).toEqual([]);
});
