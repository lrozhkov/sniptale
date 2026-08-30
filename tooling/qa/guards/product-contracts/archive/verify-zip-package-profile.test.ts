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

it('accepts a real canonical profile call with aliased imports', () => {
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
  expect(collectZipPackageProfileViolations([file])).toEqual([]);
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
