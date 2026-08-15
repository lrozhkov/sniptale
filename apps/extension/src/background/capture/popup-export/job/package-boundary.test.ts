import { describe, expect, it, vi } from 'vitest';

import type { ExportPagePackage } from '@sniptale/runtime-contracts/export';
import {
  addPopupExportPackageResourceUsage,
  assertPopupExportAggregateResourceUsage,
  assertPopupExportPackageResourceUsage,
  MAX_POPUP_EXPORT_ENTRY_PATH_DEPTH,
  parsePopupExportPagePackageAtBoundary,
} from './package-boundary';

function createPagePackage(
  entries: ExportPagePackage['entries'],
  archiveBaseName = 'page'
): ExportPagePackage {
  return {
    archiveBaseName,
    entries,
    errors: [],
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
  };
}

describe('popup export package boundary', () => {
  it('normalizes a valid package and requires exactly one content representation', () => {
    expect(
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([
          { mimeType: 'application/json', path: 'logs/page.json', textContent: '{}' },
          { binaryBase64: 'ZmFrZQ==', path: 'image.png' },
        ])
      )
    ).toEqual({
      pagePackage: createPagePackage([
        { mimeType: 'application/json', path: 'logs/page.json', textContent: '{}' },
        { binaryBase64: 'ZmFrZQ==', path: 'image.png' },
      ]),
      usage: { decodedBytes: 6, directoryNodes: 2, entries: 2 },
    });

    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([{ binaryBase64: 'ZmFrZQ==', path: 'page.json', textContent: '{}' }])
      )
    ).toThrow('exactly one content representation');
    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([{ path: 'page.json' } as ExportPagePackage['entries'][number]])
      )
    ).toThrow('exactly one content representation');
  });

  it.each([
    '../evil.txt',
    '/absolute.txt',
    'C:/absolute.txt',
    'dir\\evil.txt',
    'dir//evil.txt',
    'dir/./evil.txt',
    'dir/\u0000evil.txt',
    ' trailing.txt',
  ])('rejects unsafe entry path %j', (path) => {
    expect(() =>
      parsePopupExportPagePackageAtBoundary(createPagePackage([{ path, textContent: '' }]))
    ).toThrow('Unsafe popup export package entry path');
  });

  it('rejects unsafe base names, duplicate paths, and excessive path depth', () => {
    expect(() =>
      parsePopupExportPagePackageAtBoundary(createPagePackage([], '../archive'))
    ).toThrow('Unsafe popup export package archive base name');
    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([
          { path: 'same.txt', textContent: 'one' },
          { path: 'same.txt', textContent: 'two' },
        ])
      )
    ).toThrow('Duplicate popup export package entry path');
    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([
          {
            path: `${Array.from({ length: MAX_POPUP_EXPORT_ENTRY_PATH_DEPTH }, () => 'dir').join('/')}/file.txt`,
            textContent: '',
          },
        ])
      )
    ).toThrow('Unsafe popup export package entry path');
  });

  it('requires canonical base64 and enforces the per-entry decoded limit', () => {
    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([{ binaryBase64: 'Zg=', path: 'image.png' }])
      )
    ).toThrow('Invalid popup export package base64 entry');

    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    const oversizedText = 'x'.repeat(64 * 1024 * 1024 + 1);
    expect(() =>
      parsePopupExportPagePackageAtBoundary(
        createPagePackage([{ path: 'oversized.txt', textContent: oversizedText }])
      )
    ).toThrow('entry exceeds');
    expect(encode).not.toHaveBeenCalled();
    encode.mockRestore();
  });

  it('enforces package entry and decoded-byte limits', () => {
    expect(() =>
      assertPopupExportPackageResourceUsage({
        decodedBytes: 0,
        directoryNodes: 0,
        entries: 2_001,
      })
    ).toThrow('exceeds 2000 entries');
    expect(() =>
      assertPopupExportPackageResourceUsage({
        decodedBytes: 250 * 1024 * 1024 + 1,
        directoryNodes: 0,
        entries: 1,
      })
    ).toThrow('exceeds 262144000 bytes');
  });

  it('enforces aggregate bytes, entries, and directory-node limits', () => {
    const current = { decodedBytes: 100, directoryNodes: 10, entries: 5 };
    expect(
      addPopupExportPackageResourceUsage(current, {
        decodedBytes: 200,
        directoryNodes: 20,
        entries: 6,
      })
    ).toEqual({ decodedBytes: 300, directoryNodes: 30, entries: 11 });
    expect(() =>
      assertPopupExportAggregateResourceUsage({
        decodedBytes: 250 * 1024 * 1024 + 1,
        directoryNodes: 0,
        entries: 0,
      })
    ).toThrow('decoded bytes');
    expect(() =>
      assertPopupExportAggregateResourceUsage({
        decodedBytes: 0,
        directoryNodes: 0,
        entries: 10_001,
      })
    ).toThrow('10000 entries');
    expect(() =>
      assertPopupExportAggregateResourceUsage({
        decodedBytes: 0,
        directoryNodes: 20_001,
        entries: 0,
      })
    ).toThrow('20000 directory nodes');
  });
});
