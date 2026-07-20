import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectReturnedObjectSurfaceAdvisories,
  collectReturnedObjectSurfaceViolations,
  runReturnedObjectSurfaceAdvisoryCheck,
  runReturnedObjectSurfaceCheck,
} from './verify-interface-surfaces.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createReturnedBagSource() {
  return [
    'export function useScenarioEditorViewState() {',
    '  return {',
    ...Array.from({ length: 21 }, (_, index) => `    field${index}: ${index},`),
    '  };',
    '}',
    '',
  ].join('\n');
}

function createInternalReturnedBagSource() {
  return [
    'function buildScenarioEditorState() {',
    '  return {',
    ...Array.from({ length: 21 }, (_, index) => `    field${index}: ${index},`),
    '  };',
    '}',
    '',
    'export const value = buildScenarioEditorState();',
    '',
  ].join('\n');
}

function createNonSurfaceBagSource() {
  return [
    'export function createScenarioExportItem() {',
    '  return {',
    ...Array.from({ length: 21 }, (_, index) => `    field${index}: ${index},`),
    '  };',
    '}',
    '',
  ].join('\n');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('reports newly introduced broad returned controller bags in advisory mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts',
    createReturnedBagSource()
  );

  expect(
    collectReturnedObjectSurfaceAdvisories([file], {
      getPreviousSource: () => null,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'returned-object-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts'
      ),
    }),
  ]);
});

it('reports existing returned controller bags in repo-wide mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts',
    createReturnedBagSource()
  );

  expect(runReturnedObjectSurfaceCheck({ files: [file], scope: 'repo-wide' }).violations).toEqual([
    expect.objectContaining({
      rule: 'returned-object-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts'
      ),
    }),
  ]);
});

it('ignores stable returned controller bags that did not grow in the current diff', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const source = createReturnedBagSource();
  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts',
    source
  );

  expect(
    collectReturnedObjectSurfaceAdvisories([file], {
      getPreviousSource: () => source,
    })
  ).toEqual([]);
});

it('blocks broad returned controller bags in changed-file mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts',
    createReturnedBagSource()
  );

  expect(
    collectReturnedObjectSurfaceViolations([file], {
      getPreviousSource: () => null,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'returned-object-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts'
      ),
    }),
  ]);
});

it('ignores non-exported returned bags so the blocker stays public-surface scoped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/scenario-editor/useScenarioEditorViewState.ts',
    createInternalReturnedBagSource()
  );

  expect(
    collectReturnedObjectSurfaceViolations([file], {
      getPreviousSource: () => null,
    })
  ).toEqual([]);
});

it('ignores broad returned objects that are not controller/state surface builders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/gallery/library/items/adapters.ts',
    createNonSurfaceBagSource()
  );

  expect(
    collectReturnedObjectSurfaceViolations([file], {
      getPreviousSource: () => null,
    })
  ).toEqual([]);
  expect(
    runReturnedObjectSurfaceAdvisoryCheck({ files: [file], scope: 'repo-wide' }).advisories
  ).toEqual([]);
});
