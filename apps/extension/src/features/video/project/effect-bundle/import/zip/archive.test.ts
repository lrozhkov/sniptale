import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { ZipCentralDirectoryError } from '@sniptale/platform/data/zip-profile/central-directory';
import {
  assertEffectBundleZipLimits,
  readZipEntry,
  mapArchiveError,
  isExecutableEntry,
} from './archive';

it.each(['STORE', 'DEFLATE'] as const)(
  'materializes %s entries with exact declared lengths and refuses mismatches',
  async (compression) => {
    const zip = new JSZip();
    zip.file('a/first.json', 'hello');
    const bytes = await zip.generateAsync({ type: 'uint8array', compression });
    const entry = assertEffectBundleZipLimits(bytes).entries.find(
      (entry) => entry.name === 'a/first.json'
    )!;
    expect(await readZipEntry(bytes, entry)).toEqual({
      ok: true,
      bytes: new TextEncoder().encode('hello'),
    });
    for (const uncompressedSize of [4, 6])
      expect(await readZipEntry(bytes, { ...entry, uncompressedSize })).toMatchObject({
        ok: false,
        primaryCode: 'BUNDLE_ENTRY_SIZE_MISMATCH',
      });
    if (compression === 'DEFLATE') {
      const corrupt = bytes.slice();
      corrupt.fill(255, entry.dataStartOffset, entry.dataStartOffset + entry.compressedSize);
      expect(await readZipEntry(corrupt, entry)).toMatchObject({
        ok: false,
        primaryCode: 'BUNDLE_ARCHIVE_INVALID',
      });
    }
  }
);
it('maps central-directory errors without losing typed bundle refusals', () => {
  for (const [code, expected] of [
    ['limit-exceeded', 'BUNDLE_LIMIT_EXCEEDED'],
    ['entry-collision', 'BUNDLE_ENTRY_COLLISION'],
    ['entry-special', 'BUNDLE_ENTRY_SPECIAL'],
    ['archive-invalid', 'BUNDLE_ARCHIVE_INVALID'],
  ] as const)
    expect(
      mapArchiveError(new ZipCentralDirectoryError(code, 'Invalid', 'a/first.json'))
    ).toMatchObject({ ok: false, primaryCode: expected });
  const refusal = { ok: false, primaryCode: 'BUNDLE_ENTRY_PATH_UNSAFE' };
  expect(mapArchiveError(refusal)).toBe(refusal);
  expect(mapArchiveError(new Error('Unknown'))).toMatchObject({
    primaryCode: 'BUNDLE_ARCHIVE_INVALID',
  });
  for (const path of ['script.js', 'renderers/model.json', 'recipes/a.json', 'module.wasm'])
    expect(isExecutableEntry(path)).toBe(true);
  expect(isExecutableEntry('a/first.json')).toBe(false);
});
