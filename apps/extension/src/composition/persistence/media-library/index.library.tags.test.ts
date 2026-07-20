import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const dbMocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteProjectAsset: vi.fn(),
  deleteProjectExport: vi.fn(),
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteRecording: vi.fn(),
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteWebSnapshotMediaAsset: vi.fn(),
  getWebSnapshotRecord: vi.fn(),
}));

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    id: overrides.id ?? 'asset-1',
    kind: overrides.kind ?? 'screenshot',
    source: overrides.source ?? { kind: 'screenshot' },
    filename: overrides.filename ?? 'capture.png',
    originalFilename: overrides.originalFilename ?? 'capture.png',
    createdAt: overrides.createdAt ?? 100,
    updatedAt: overrides.updatedAt ?? 100,
    size: overrides.size ?? 10,
    mimeType: overrides.mimeType ?? 'image/png',
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    duration: overrides.duration ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? [],
    blob: overrides.blob ?? new Blob(['image']),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.initDBMock.mockResolvedValue({
    get: dbMocks.getMock,
    put: dbMocks.putMock,
  });
});

it('merges added tags with the current media record tags', async () => {
  const existing = createMediaEntry({ tags: ['remote'] });
  dbMocks.getMock.mockResolvedValue(existing);
  vi.spyOn(Date, 'now').mockReturnValue(999);

  const { addMediaLibraryEntryTags } = await import('./index.library.ts');

  await expect(addMediaLibraryEntryTags('asset-1', ['demo', 'remote'])).resolves.toEqual(
    expect.objectContaining({ tags: ['remote', 'demo'] })
  );
  expect(dbMocks.putMock).toHaveBeenCalledWith(
    'media_library',
    expect.objectContaining({ tags: ['remote', 'demo'], updatedAt: 999 })
  );
});

it('skips writes when every added tag already exists on the current record', async () => {
  const existing = createMediaEntry({ tags: ['remote', 'demo'] });
  dbMocks.getMock.mockResolvedValue(existing);

  const { addMediaLibraryEntryTags } = await import('./index.library.ts');

  await expect(addMediaLibraryEntryTags('asset-1', ['demo'])).resolves.toStrictEqual(existing);
  expect(dbMocks.putMock).not.toHaveBeenCalled();
});
