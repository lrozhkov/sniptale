import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectBroadPublicSurfaceViolations } from './verify-interface-surfaces.mjs';

const tempDirs: string[] = [];

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

it('flags exported controller hooks that return spread bags', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/export/controller.ts',
    [
      'export function usePopupExportController() {',
      '  const state = useStateOwner();',
      '  const actions = useRuntimeOwner();',
      '  return {',
      '    ...state,',
      '    ...actions,',
      '  };',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBroadPublicSurfaceViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/popup/shell/export/controller.ts'),
      rule: 'broad-public-surface-return',
    }),
  ]);
});

it('flags exported state types composed from multiple role owners', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/export/session/types.ts',
    [
      'type Preferences = { a: boolean };',
      'type Session = { b: boolean };',
      'type Selection = { c: boolean };',
      'type Derived = { d: boolean };',
      'export type PopupExportState = Preferences & Session & Selection & Derived;',
      '',
    ].join('\n')
  );

  expect(collectBroadPublicSurfaceViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/popup/shell/export/session/types.ts'),
      rule: 'broad-public-surface-type',
    }),
  ]);
});

it('ignores small role-specific public hooks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/export/selection.ts',
    [
      'export function usePopupExportSelection() {',
      '  return {',
      '    selected: true,',
      '    setSelected() {},',
      '  };',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBroadPublicSurfaceViolations([file])).toEqual([]);
});

it('allows an inherited broad hook that did not grow', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);
  const source = [
    'export function usePopupExportController() {',
    '  return { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 };',
    '}',
    '',
  ].join('\n');
  const file = writeFile(root, 'apps/extension/src/popup/shell/export/controller.ts', source);

  expect(collectBroadPublicSurfaceViolations([file], { getPreviousSource: () => source })).toEqual(
    []
  );
});

it('flags a widened inherited broad hook', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);
  const previous = [
    'export function usePopupExportController() {',
    '  return { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 };',
    '}',
    '',
  ].join('\n');
  const current = previous.replace('j: 10', 'j: 10, k: 11');
  const file = writeFile(root, 'apps/extension/src/popup/shell/export/controller.ts', current);

  expect(
    collectBroadPublicSurfaceViolations([file], { getPreviousSource: () => previous })
  ).toEqual([expect.objectContaining({ rule: 'broad-public-surface-return' })]);
});

it('ignores test-support controller fixtures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-broad-public-'));
  tempDirs.push(root);
  const file = writeFile(
    root,
    'apps/extension/src/editor/controller.test-support.ts',
    'export function createEditorController() { return { ...a, ...b }; }\n'
  );

  expect(collectBroadPublicSurfaceViolations([file])).toEqual([]);
});
