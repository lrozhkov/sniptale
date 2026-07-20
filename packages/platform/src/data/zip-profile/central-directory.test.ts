import { expect, it } from 'vitest';

import { inspectZipCentralDirectory, ZipCentralDirectoryError } from './central-directory';
import { createZip, createZip64 } from './central-directory.test-support';

const DEFAULT_OPTIONS = {
  maxArchiveBytes: 1024 * 1024,
  maxCompressionRatio: 1000,
  maxEntryBytes: 1024,
  maxFileCount: 10,
  maxTotalInflatedBytes: 4096,
};

it('inspects regular files and signed data descriptors without inflating', () => {
  const archive = createZip([
    { data: [1, 2, 3], name: 'manifest.json' },
    { data: [4, 5], descriptor: true, name: 'effects/demo.json' },
    { data: [], name: 'assets/' },
  ]);

  const profile = inspectZipCentralDirectory(archive, DEFAULT_OPTIONS);

  expect(profile).toEqual(
    expect.objectContaining({
      regularFileCount: 2,
      totalCompressedBytes: 5,
      totalUncompressedBytes: 5,
      zip64: false,
    })
  );
  expect(profile.entries.map(({ name }) => name)).toEqual([
    'manifest.json',
    'effects/demo.json',
    'assets/',
  ]);
});

it('rejects suspicious compression ratios from central metadata before inflation', () => {
  expectZipError(
    () =>
      inspectZipCentralDirectory(
        createZip([{ compressedSize: 1, data: [1], name: 'bomb', uncompressedSize: 1001 }]),
        DEFAULT_OPTIONS
      ),
    'limit-exceeded'
  );
  expectZipError(
    () =>
      inspectZipCentralDirectory(
        createZip([{ compressedSize: 0, data: [], name: 'zero', uncompressedSize: 1 }]),
        DEFAULT_OPTIONS
      ),
    'limit-exceeded'
  );
});

it.each([
  {
    code: 'entry-collision',
    entries: [
      { data: [1], name: 'Effects/demo.json' },
      { data: [2], name: 'effects/DEMO.json' },
    ],
  },
  {
    code: 'entry-unsupported',
    entries: [{ data: [1], flags: 1, name: 'manifest.json' }],
  },
  {
    code: 'entry-special',
    entries: [
      {
        data: [1],
        externalAttributes: (0o120777 << 16) >>> 0,
        name: 'assets/link',
        versionMadeBy: (3 << 8) | 20,
      },
    ],
  },
])('rejects $code metadata before body access', ({ code, entries }) => {
  expectZipError(() => inspectZipCentralDirectory(createZip(entries), DEFAULT_OPTIONS), code);
});

it('delegates canonical path policy before inflation', () => {
  expectZipError(
    () =>
      inspectZipCentralDirectory(createZip([{ data: [1], name: '../escape' }]), {
        ...DEFAULT_OPTIONS,
        assertPath(path) {
          if (path.includes('..')) throw new ZipCentralDirectoryError('archive-invalid', 'path');
        },
      }),
    'archive-invalid'
  );
});

it('enforces archive, file, entry, and aggregate inflated limits', () => {
  const archive = createZip([
    { data: [1, 2], name: 'one' },
    { data: [3, 4], name: 'two' },
  ]);

  expectZipError(
    () => inspectZipCentralDirectory(archive, { ...DEFAULT_OPTIONS, maxArchiveBytes: 1 }),
    'limit-exceeded'
  );
  expectZipError(
    () => inspectZipCentralDirectory(archive, { ...DEFAULT_OPTIONS, maxFileCount: 1 }),
    'limit-exceeded'
  );
  expectZipError(
    () => inspectZipCentralDirectory(archive, { ...DEFAULT_OPTIONS, maxEntryBytes: 1 }),
    'limit-exceeded'
  );
  expectZipError(
    () =>
      inspectZipCentralDirectory(archive, {
        ...DEFAULT_OPTIONS,
        maxTotalInflatedBytes: 3,
      }),
    'limit-exceeded'
  );
});

it('rejects truncated archives and local/central header disagreement', () => {
  expectZipError(
    () => inspectZipCentralDirectory(new Uint8Array([1, 2, 3]), DEFAULT_OPTIONS),
    'archive-invalid'
  );

  const archive = createZip([{ data: [1], name: 'manifest.json' }]);
  archive[8] = 8;
  expectZipError(() => inspectZipCentralDirectory(archive, DEFAULT_OPTIONS), 'archive-invalid');
});

it('reads single-disk ZIP64 sizes and offsets through the canonical extra field', () => {
  const profile = inspectZipCentralDirectory(createZip64(), DEFAULT_OPTIONS);

  expect(profile.zip64).toBe(true);
  expect(profile.regularFileCount).toBe(1);
  expect(profile.entries[0]).toEqual(
    expect.objectContaining({
      compressedSize: 1,
      localHeaderOffset: 0,
      name: 'manifest.json',
      uncompressedSize: 1,
    })
  );
});
function expectZipError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('Expected ZIP inspection to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ZipCentralDirectoryError);
    expect((error as ZipCentralDirectoryError).code).toBe(code);
  }
}
