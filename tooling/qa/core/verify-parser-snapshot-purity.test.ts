import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectParserSnapshotPurityViolations } from './verify-parser-snapshot-purity.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-parser-snapshot-purity-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags direct document access in parser pipelines', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parse-page.ts',
    'export function demo() { return document.querySelector("#root"); }\n'
  );

  expect(collectParserSnapshotPurityViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'parser-snapshot-purity',
      file: expect.stringContaining('apps/extension/src/content/parser/pipelines/parse-page.ts'),
    }),
  ]);
});

it('allows snapshot-only parser logic', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parse-page.ts',
    ['export function demo(snapshot) {', '  return snapshot.virtualRoot;', '}'].join('\n')
  );

  expect(collectParserSnapshotPurityViolations([file])).toEqual([]);
});

it('allows explicit export-manager DOM-driver boundary owners', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts',
    'export function demo() { return document.querySelectorAll("a"); }\n'
  );

  expect(collectParserSnapshotPurityViolations([file])).toEqual([]);
});

it('allows explicit export-manager modal boundary owners', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
    'export async function demo() { return document.querySelector(".popupContent"); }\n'
  );

  expect(collectParserSnapshotPurityViolations([file])).toEqual([]);
});
