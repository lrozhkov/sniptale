import type JSZip from 'jszip';
import { expect, it, vi } from 'vitest';

import { assertZipEntryCanInflate, assertZipPackageInflationProfile } from './index';

function createEntry(args: {
  compressedSize?: number;
  dir?: boolean;
  name?: string;
  uncompressedSize?: number;
  unsafeOriginalName?: string;
}): JSZip.JSZipObject {
  return {
    _data:
      args.compressedSize === undefined || args.uncompressedSize === undefined
        ? undefined
        : {
            compressedSize: args.compressedSize,
            uncompressedSize: args.uncompressedSize,
          },
    async: vi.fn(),
    dir: args.dir ?? false,
    name: args.name ?? 'entry.bin',
    unsafeOriginalName: args.unsafeOriginalName,
  } as unknown as JSZip.JSZipObject;
}

it('reads central-directory inflation metadata without inflating entries', () => {
  const entry = createEntry({ compressedSize: 5, uncompressedSize: 9 });

  expect(assertZipEntryCanInflate(entry, 10, () => new Error('invalid profile'))).toBe(9);
  expect(entry.async).not.toHaveBeenCalled();
});

it('fails closed when entry metadata is unavailable or suspicious', () => {
  const missingMetadata = createEntry({});
  const zeroCompressed = createEntry({ compressedSize: 0, uncompressedSize: 1 });

  expect(() =>
    assertZipEntryCanInflate(missingMetadata, 1024, () => new Error('invalid profile'))
  ).toThrow('invalid profile');
  expect(() =>
    assertZipEntryCanInflate(zeroCompressed, 1024, () => new Error('invalid profile'))
  ).toThrow('invalid profile');
  expect(missingMetadata.async).not.toHaveBeenCalled();
  expect(zeroCompressed.async).not.toHaveBeenCalled();
});

it('enforces file count, path, entry, total, and ratio budgets without reading bodies', () => {
  const validEntry = createEntry({
    compressedSize: 10,
    name: 'assets/ok.bin',
    uncompressedSize: 20,
  });
  const oversizedEntry = createEntry({
    compressedSize: 20,
    name: 'assets/large.bin',
    uncompressedSize: 200,
  });

  expect(() =>
    assertZipPackageInflationProfile([validEntry, oversizedEntry], {
      assertPath: (path) => {
        if (!path.startsWith('assets/')) {
          throw new Error('unsafe path');
        }
      },
      createEntryError: (path) => new Error(`entry too large: ${path}`),
      createFileCountError: () => new Error('too many files'),
      createTotalError: () => new Error('total too large'),
      maxFileCount: 5,
      maxTotalBytes: 1000,
      resolveEntryMaxBytes: () => 100,
    })
  ).toThrow('entry too large: assets/large.bin');

  expect(validEntry.async).not.toHaveBeenCalled();
  expect(oversizedEntry.async).not.toHaveBeenCalled();
});
