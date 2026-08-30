import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectParserSnapshotPurityViolations,
  runParserSnapshotPurityCheck,
} from './verify-parser-snapshot-purity.mjs';

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

it.each([
  'document',
  'document["querySelector"]("#root")',
  'globalThis.document',
  'globalThis.document.querySelector("#root")',
  'window',
  'window.document["querySelectorAll"]("a")',
  'window.getComputedStyle',
  'self.navigator.userAgent',
  'location["href"]',
  'globalThis.location.pathname',
  'window.location.origin',
])('flags normalized live-global access: %s', (expression) => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parse-page.ts',
    `export function demo() { return ${expression}; }\n`
  );

  expect(collectParserSnapshotPurityViolations([file])).toHaveLength(1);
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

it.each([
  'const liveDocument = globalThis.document; return () => liveDocument.querySelector("main")',
  'const { document: liveDocument } = globalThis; return () => liveDocument.body',
  'const { ["document"]: liveDocument } = globalThis; return () => liveDocument.body',
  'const liveWindow = window; return () => liveWindow.location.href',
])('flags live-global aliases captured by nested closures: %s', (body) => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parse-page.ts',
    `export function demo() { ${body}; }\n`
  );

  expect(collectParserSnapshotPurityViolations([file])).toHaveLength(1);
});

it('ignores comments and strings and respects local bindings and allowed timers', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parse-page.ts',
    [
      '// document.querySelector("main")',
      'const description = "window.location.href";',
      'export function demo(document: Document) {',
      '  const window = { location: { href: "snapshot" } };',
      '  window.setTimeout;',
      '  globalThis.setTimeout(() => undefined, 0);',
      '  return document.querySelector("main") ?? description;',
      '}',
      '',
    ].join('\n')
  );

  expect(collectParserSnapshotPurityViolations([file])).toEqual([]);
});

it('allows only the canonical ambient diagnostics source owner', () => {
  const root = createTempRoot();
  const owner = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/diagnostics/source.ts',
    'export function ambient() { return window.document; }\n'
  );
  const adjacent = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/diagnostics/source-copy.ts',
    'export function ambient() { return window.document; }\n'
  );

  expect(collectParserSnapshotPurityViolations([owner])).toEqual([]);
  expect(collectParserSnapshotPurityViolations([adjacent])).toHaveLength(1);
});

it('does not retain former DOM-driver or modal owner exemptions', () => {
  const root = createTempRoot();
  const files = [
    writeFile(
      root,
      'apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts',
      'export function demo() { return document.querySelectorAll("a"); }\n'
    ),
    writeFile(
      root,
      'apps/extension/src/content/parser/export-manager/files/modal-utils.ts',
      'export function demo() { return document.querySelector(".popupContent"); }\n'
    ),
  ];

  expect(collectParserSnapshotPurityViolations(files)).toHaveLength(2);
});

it('does not retain the retired flat modal owner exemption', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
    'export function demo() { return document.querySelector(".popupContent"); }\n'
  );

  expect(collectParserSnapshotPurityViolations([file])).toHaveLength(1);
});

it('expands an owner implementation change to the live parser closure', () => {
  const ownerPath = path.resolve(import.meta.dirname, 'verify-parser-snapshot-purity.mjs');
  const result = runParserSnapshotPurityCheck({ files: [ownerPath] });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(1);
  expect(result.files).toContain(
    'apps/extension/src/content/parser/export-manager/files/modal-utils.ts'
  );
});
