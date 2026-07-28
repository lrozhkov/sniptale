import { describe, expect, it, vi } from 'vitest';

import {
  MAX_BATCH_AGGREGATE_DECODED_BYTES,
  MAX_BATCH_ENTRY_PATH_DEPTH,
  parsePopupBatchPagePackageAtBoundary,
  wouldExceedPopupBatchAggregateBudget,
} from './batch-package-boundary';

function createPagePackage(
  entries: Array<{ binaryBase64?: string; path: string; textContent?: string }>
) {
  return {
    archiveBaseName: 'page',
    entries,
    errors: [],
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
  };
}

describe('popup batch aggregate budget', () => {
  it('accepts the exact decoded-input limit and rejects the next byte', () => {
    expect(wouldExceedPopupBatchAggregateBudget(MAX_BATCH_AGGREGATE_DECODED_BYTES - 1, 1)).toBe(
      false
    );
    expect(wouldExceedPopupBatchAggregateBudget(MAX_BATCH_AGGREGATE_DECODED_BYTES - 1, 2)).toBe(
      true
    );
  });
});

describe('popup batch package boundary', () => {
  it('requires exactly one normalized entry representation', () => {
    const hugeIgnoredBinary = 'AAAA'.repeat(22_369_622);

    expect(() =>
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([
          {
            binaryBase64: hugeIgnoredBinary,
            path: 'page.json',
            textContent: '{}',
          },
        ])
      )
    ).toThrow('exactly one content representation');

    expect(
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([{ path: 'page.json', textContent: '{}' }])
      ).entries
    ).toEqual([{ path: 'page.json', textContent: '{}' }]);
    expect(
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([{ binaryBase64: 'ZmFrZQ==', path: 'image.png' }])
      ).entries
    ).toEqual([{ binaryBase64: 'ZmFrZQ==', path: 'image.png' }]);
  });

  it('accepts the maximum entry path depth and rejects the next segment', () => {
    const maxDepthPath = [
      ...Array.from({ length: MAX_BATCH_ENTRY_PATH_DEPTH - 1 }, (_, index) => `dir-${index}`),
      'file.txt',
    ].join('/');
    const excessiveDepthPath = `extra/${maxDepthPath}`;

    expect(
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([{ path: maxDepthPath, textContent: '' }])
      ).entries[0]?.path
    ).toBe(maxDepthPath);
    expect(() =>
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([{ path: excessiveDepthPath, textContent: '' }])
      )
    ).toThrow('Unsafe popup export package entry path');
  });

  it('rejects oversized UTF-8 text without allocating an encoded copy', () => {
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    const oversizedText = 'x'.repeat(64 * 1024 * 1024 + 1);

    expect(() =>
      parsePopupBatchPagePackageAtBoundary(
        createPagePackage([{ path: 'oversized.txt', textContent: oversizedText }])
      )
    ).toThrow('entry exceeds');
    expect(encode).not.toHaveBeenCalled();
    encode.mockRestore();
  });
});
