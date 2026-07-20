import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectExportArtifactBoundaryViolations,
  runExportArtifactBoundaryCheck,
} from './verify-export-artifact-boundaries.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-export-artifact-boundaries-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags raw export package builder inputs in export-manager production code', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/service/example.ts',
    [
      'export async function buildRawPackage(treeData: unknown, files: Map<string, Blob>) {',
      '  return buildExportPagePackage({ treeData, files, extraAssets: [] });',
      '}',
    ].join('\n')
  );

  expect(collectExportArtifactBoundaryViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining(
        'apps/extension/src/content/parser/export-manager/service/example.ts'
      ),
      rule: 'export-artifact-boundaries',
    }),
  ]);
});

it('flags raw archive blob package inputs in export-manager production code', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/archive/example.ts',
    [
      'export async function zipRawPackage() {',
      "  return createExportArchiveBlob({ archiveBaseName: 'raw', entries: [] });",
      '}',
    ].join('\n')
  );

  expect(collectExportArtifactBoundaryViolations([file])).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('createExportArchiveBlob must receive'),
      rule: 'export-artifact-boundaries',
    }),
  ]);
});

it('allows validated artifact inputs to package and archive builders', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/service/example.ts',
    [
      'export async function buildValidated(exportArtifact: ExportArtifact) {',
      '  const pagePackage = await buildExportPagePackage(exportArtifact);',
      '  return createExportArchiveBlob(pagePackage);',
      '}',
    ].join('\n')
  );

  expect(collectExportArtifactBoundaryViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runExportArtifactBoundaryCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
