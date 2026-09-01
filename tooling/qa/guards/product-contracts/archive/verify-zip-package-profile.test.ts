import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { collectZipPackageProfileViolations } from './verify-zip-package-profile.mjs';

const roots: string[] = [];
function fixture(source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-profile-owner-'));
  roots.push(root);
  const file = path.join(root, 'apps/extension/src/importer.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
}
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

it('blocks JSZip input loading without canonical inflation profiling', () => {
  const file = fixture(
    "import Archive from 'jszip';\nexport const load = (bytes) => Archive.loadAsync(bytes);\n"
  );
  expect(collectZipPackageProfileViolations([file])).toEqual([
    expect.objectContaining({ rule: 'zip-input-profile-ownership' }),
  ]);
});

it('rejects same-file post-load profiling because it cannot prove pre-load admission', () => {
  const file = fixture(
    [
      "import Archive from 'jszip';",
      "import { assertZipPackageInflationProfile as assertProfile } from '@sniptale/platform/data/zip-profile';",
      'export async function load(bytes) {',
      '  const zip = await Archive.loadAsync(bytes);',
      '  assertProfile(Object.values(zip.files), { maxEntryBytes: 1, maxFileCount: 1, maxInflatedBytes: 1 });',
      '}',
    ].join('\n')
  );
  expect(collectZipPackageProfileViolations([file])).toHaveLength(1);
});

it('accepts the canonical verified loader seam', () => {
  const file = fixture(
    [
      "import { loadVerifiedZip } from '@sniptale/platform/data/zip-profile/verified-loader';",
      'export const load = (bytes, options) => loadVerifiedZip(bytes, options);',
      '',
    ].join('\n')
  );
  expect(collectZipPackageProfileViolations([file])).toEqual([]);
});

it('blocks dynamically imported JSZip input loading outside the verified loader owner', () => {
  const file = fixture(
    "export async function load(bytes) { const { default: JSZip } = await import('jszip'); return JSZip.loadAsync(bytes); }\n"
  );
  expect(collectZipPackageProfileViolations([file])).toEqual([
    expect.objectContaining({ rule: 'zip-input-profile-ownership' }),
  ]);
});

it.each([
  "export async function load(bytes) { const module = await import('jszip'); return module.default.loadAsync(bytes); }\n",
  "export async function load(bytes) { return (await import('jszip')).default.loadAsync(bytes); }\n",
  "import * as module from 'jszip'; export const load = (bytes) => module.default.loadAsync(bytes);\n",
  "import { default as Archive } from 'jszip'; export const load = (bytes) => Archive.loadAsync(bytes);\n",
])('blocks JSZip module/default input-loading chains', (source) => {
  const file = fixture(source);
  expect(collectZipPackageProfileViolations([file])).toEqual([
    expect.objectContaining({ rule: 'zip-input-profile-ownership' }),
  ]);
});

it('does not accept an unused import or comment as profile proof', () => {
  const file = fixture(
    [
      "import JSZip from 'jszip';",
      "import { assertZipPackageInflationProfile } from '@sniptale/platform/data/zip-profile';",
      '// assertZipPackageInflationProfile will be added later',
      'export const load = (bytes) => JSZip.loadAsync(bytes);',
    ].join('\n')
  );
  expect(collectZipPackageProfileViolations([file])).toHaveLength(1);
});

it('leaves ZIP generation contracts with their generation owners', () => {
  const file = fixture(
    "import JSZip from 'jszip';\nexport const build = () => new JSZip().generateAsync({ type: 'blob' });\n"
  );
  expect(collectZipPackageProfileViolations([file])).toEqual([]);
});

it('leaves dynamically imported ZIP generation with its generation owner', () => {
  const file = fixture(
    "export async function build() { const { default: JSZip } = await import('jszip'); return new JSZip().generateAsync({ type: 'blob' }); }\n"
  );
  expect(collectZipPackageProfileViolations([file])).toEqual([]);
});
