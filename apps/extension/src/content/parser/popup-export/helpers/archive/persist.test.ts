import { expect, it, vi } from 'vitest';
import type { ExportResult } from '@sniptale/runtime-contracts/export';

const fallbackMock = vi.hoisted(() => vi.fn());

vi.mock('./fallback', () => ({
  fallbackToDirectDownload: fallbackMock,
}));

import { persistPopupExportArchive } from './persist';

function createExportResult(overrides: Partial<ExportResult> = {}): ExportResult {
  return {
    errors: [],
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: true,
    ...overrides,
  };
}

it('keeps the persist coordinator thin and returns early without an archive', async () => {
  await expect(persistPopupExportArchive(createExportResult({ filename: '' }))).resolves.toEqual(
    []
  );
  expect(fallbackMock).not.toHaveBeenCalled();
});

it('persists content popup archives through direct download', async () => {
  const result = createExportResult({
    blob: new Blob(['zip'], { type: 'application/zip' }),
    filename: 'popup-export.zip',
  });

  fallbackMock.mockResolvedValueOnce(['fallback']);

  await expect(persistPopupExportArchive(result)).resolves.toEqual(['fallback']);
  expect(fallbackMock).toHaveBeenCalledWith(result);
});
