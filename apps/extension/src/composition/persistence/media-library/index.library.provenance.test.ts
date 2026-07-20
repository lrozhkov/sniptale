import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const dbMocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal()),
  getWebSnapshotRecord: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(500);
  dbMocks.getMock.mockResolvedValue(createMediaEntry());
  dbMocks.initDBMock.mockResolvedValue({
    get: dbMocks.getMock,
    put: dbMocks.putMock,
  });
});

it('sanitizes source provenance patches before updating media library entries', async () => {
  const { updateMediaLibraryEntry } = await import('./index.library.ts');

  await updateMediaLibraryEntry('asset-1', {
    sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
    sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#access_token=abc',
  });

  expect(dbMocks.putMock).toHaveBeenCalledWith(
    'media_library',
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceUrl: 'https://example.com/',
      updatedAt: 500,
    })
  );
});

it('preserves existing source provenance when update patch omits source URL fields', async () => {
  dbMocks.getMock.mockResolvedValue(
    createMediaEntry({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceUrl: 'https://example.com/page',
    })
  );
  const { updateMediaLibraryEntry } = await import('./index.library.ts');

  await updateMediaLibraryEntry('asset-1', {
    sourceTitle: 'Renamed',
  });

  expect(dbMocks.putMock).toHaveBeenCalledWith(
    'media_library',
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Renamed',
      sourceUrl: 'https://example.com/page',
    })
  );
});

it('rejects provenance patch updates when the media library entry is missing', async () => {
  dbMocks.getMock.mockResolvedValue(undefined);
  const { updateMediaLibraryEntry } = await import('./index.library.ts');

  await expect(
    updateMediaLibraryEntry('missing-asset', {
      sourceUrl: 'https://example.com/page?token=secret',
    })
  ).rejects.toThrow('Asset missing-asset не найден.');
  expect(dbMocks.putMock).not.toHaveBeenCalled();
});

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}
