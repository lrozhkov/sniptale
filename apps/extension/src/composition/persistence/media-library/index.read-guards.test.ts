import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const mocks = vi.hoisted(() => ({
  deleteProjectAsset: vi.fn(),
  deleteRecording: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  getAllKeys: vi.fn(),
  initDB: vi.fn(),
  put: vi.fn(),
  txDelete: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: mocks.initDB,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects/index')>()),
  deleteProjectAsset: mocks.deleteProjectAsset,
  deleteProjectExport: vi.fn(),
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/index')>()),
  deleteRecording: mocks.deleteRecording,
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../web-snapshots')>()),
  deleteWebSnapshotMediaAsset: vi.fn(),
  getWebSnapshotRecord: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  listReadyJournals: vi.fn(async () => []),
}));

import {
  addMediaLibraryEntryTags,
  deleteMediaLibraryAsset,
  getMediaLibraryEntry,
  getMediaThumbnail,
  listMediaLibrary,
  updateMediaLibraryEntry,
} from './index.library.ts';
import { parseMediaLibraryEntry } from './read-guards';

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    createdAt: 200,
    duration: null,
    filename: 'asset.webm',
    height: null,
    id: 'recording:valid',
    kind: 'recording',
    mimeType: 'video/webm',
    originalFilename: 'asset.webm',
    size: 10,
    source: { kind: 'recording', recordingId: 'recording-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 200,
    width: null,
    ...overrides,
  };
}

function createDb() {
  return {
    get: mocks.get,
    getAll: mocks.getAll,
    getAllKeys: mocks.getAllKeys,
    put: mocks.put,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({ delete: mocks.txDelete, get: mocks.get, put: mocks.put })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue(createDb());
});

it('fails closed for malformed persisted media and thumbnail rows', async () => {
  mocks.getAll.mockResolvedValueOnce([
    createMediaEntry({
      recordingGroup: {
        groupId: 'capture-1',
        order: 0,
        role: 'display',
        sourceLabel: 'Window 1',
      },
    }),
    { id: 'recording:broken', filename: 'broken.webm' },
    { ...createMediaEntry({ id: 'recording:invalid-group' }), recordingGroup: { role: 'camera' } },
  ]);
  mocks.getAllKeys.mockResolvedValue([]);
  mocks.get
    .mockResolvedValueOnce({ id: 'recording:broken', filename: 'broken.webm' })
    .mockResolvedValueOnce({
      assetId: 'recording:broken',
      blob: 'not-a-blob',
      createdAt: 1,
      height: 90,
      updatedAt: 1,
      width: 120,
    });

  await expect(listMediaLibrary()).resolves.toEqual([
    expect.objectContaining({
      id: 'recording:valid',
      recordingGroup: expect.objectContaining({ groupId: 'capture-1' }),
    }),
  ]);
  await expect(getMediaLibraryEntry('recording:broken')).resolves.toBeUndefined();
  await expect(getMediaThumbnail('recording:broken')).resolves.toBeUndefined();
});

it('rejects malformed media rows before metadata and tag mutation writes', async () => {
  mocks.get.mockResolvedValue({ id: 'asset-1', tags: ['demo'] });

  await expect(updateMediaLibraryEntry('asset-1', { filename: 'renamed.png' })).rejects.toThrow(
    'Asset asset-1 не найден.'
  );
  await expect(addMediaLibraryEntryTags('asset-1', ['remote'])).rejects.toThrow(
    'Asset asset-1 не найден.'
  );
  expect(mocks.put).not.toHaveBeenCalled();
});

it('does not route source cleanup from malformed media records', async () => {
  mocks.get.mockResolvedValue({ id: 'asset-1', source: { kind: 'recording' } });

  await deleteMediaLibraryAsset('asset-1');

  expect(mocks.deleteRecording).not.toHaveBeenCalled();
  expect(mocks.deleteProjectAsset).not.toHaveBeenCalled();
  expect(mocks.txDelete).not.toHaveBeenCalled();
});

it.each<MediaLibraryEntry['source']>([
  { kind: 'screenshot' },
  { kind: 'stored-asset', assetId: 'scenario-source' },
])('normalizes editable image content state and rejects invalid state for $kind', (source) => {
  const image = createMediaEntry({
    blob: new Blob(['image'], { type: 'image/png' }),
    height: 100,
    id: 'image-1',
    kind: 'image',
    mimeType: 'image/png',
    source,
    width: 100,
  });

  expect(parseMediaLibraryEntry({ ...image, workspaceRevision: 0 })?.imageContentState).toBe(
    'original'
  );
  expect(parseMediaLibraryEntry({ ...image, workspaceRevision: 3 })?.imageContentState).toBe(
    'edited'
  );
  expect(
    parseMediaLibraryEntry({ ...image, imageContentState: 'original', workspaceRevision: 3 })
      ?.imageContentState
  ).toBe('original');
  expect(
    parseMediaLibraryEntry({ ...image, imageContentState: 'unknown', workspaceRevision: 3 })
  ).toBeNull();
});

it('returns a valid thumbnail with its original Blob and timestamps', async () => {
  const thumbnail = {
    assetId: 'recording:valid',
    blob: new Blob(['preview'], { type: 'image/png' }),
    createdAt: 100,
    updatedAt: 200,
    width: 1280,
    height: 720,
  };
  mocks.get.mockResolvedValueOnce(thumbnail);
  await expect(getMediaThumbnail(thumbnail.assetId)).resolves.toEqual(thumbnail);
  expect(mocks.get).toHaveBeenCalledWith('thumbnails', thumbnail.assetId);
});
