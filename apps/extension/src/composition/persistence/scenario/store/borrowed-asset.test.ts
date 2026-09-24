import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../media-library/contracts';

const io = vi.hoisted(() => ({
  db: vi.fn(),
  get: vi.fn(),
  read: vi.fn(),
  dimensions: vi.fn(),
  nextId: vi.fn(),
}));

vi.mock('../../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
vi.mock('../../assets', async (original) => ({
  ...(await original<typeof import('../../assets')>()),
  readAssetFile: io.read,
}));
vi.mock('@sniptale/platform/browser/media/image-dimensions', () => ({
  measureImageBlob: io.dimensions,
}));
vi.mock('./project-records/helpers', async (original) => ({
  ...(await original<typeof import('./project-records/helpers')>()),
  createScenarioAssetId: io.nextId,
}));

import { createBorrowedScenarioImageAsset, readBorrowableLibraryImage } from './borrowed-asset';

const blob = new Blob(['pixels'], { type: 'image/png' });
const ref = {
  assetId: 'immutable',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/immutable' },
  mimeType: 'image/png',
  sha256: null,
  size: blob.size,
};

function media(
  source: MediaLibraryEntry['source'] = { kind: 'stored-asset', assetId: ref.assetId }
): MediaLibraryEntry {
  return {
    id: 'library',
    kind: 'image',
    source,
    filename: 'original.png',
    originalFilename: 'original.png',
    createdAt: 1,
    updatedAt: 1,
    size: blob.size,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    workspaceRevision: 0,
    imageContentState: 'original',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.db.mockResolvedValue({ get: io.get });
  io.get.mockImplementation(async (store: string) => (store === 'asset_refs' ? ref : undefined));
  io.read.mockResolvedValue(blob);
  io.dimensions.mockResolvedValue({ width: 100, height: 50 });
  io.nextId.mockReturnValue('scenario-child');
});

it('reads exact stored, project-asset, and recording source objects through their durable refs', async () => {
  for (const source of [
    { kind: 'stored-asset' as const, assetId: ref.assetId },
    { kind: 'project-asset' as const, projectAssetId: 'project-source' },
    { kind: 'recording' as const, recordingId: 'recording-source' },
  ]) {
    io.get.mockImplementation(async (store: string) => {
      if (store === 'asset_refs') return ref;
      if (store === 'project_assets')
        return {
          id: 'project-source',
          assetId: ref.assetId,
          mimeType: 'image/png',
          createdAt: 1,
          size: blob.size,
        };
      if (store === 'recordings')
        return {
          id: 'recording-source',
          assetId: ref.assetId,
          filename: 'original.png',
          mimeType: 'image/png',
          createdAt: 1,
          size: blob.size,
        };
      return undefined;
    });
    await expect(readBorrowableLibraryImage(media(source))).resolves.toEqual({ blob, ref });
    expect(io.read).toHaveBeenLastCalledWith(ref, 'original.png');
  }
});

it('does not borrow edited previews, inline screenshots, web snapshots, or unsupported sources', async () => {
  const cases: MediaLibraryEntry[] = [
    { ...media(), workspaceRevision: 1 },
    { ...media(), imageContentState: 'edited' },
    media({ kind: 'screenshot' }),
    media({ kind: 'web-snapshot', snapshotId: 'snapshot' }),
    media({ kind: 'project-export', exportId: 'export', projectId: 'project' }),
  ];
  for (const entry of cases) await expect(readBorrowableLibraryImage(entry)).resolves.toBeNull();
  expect(io.read).not.toHaveBeenCalled();
});

it('rejects missing source rows, malformed refs, and source metadata mismatches before reading bytes', async () => {
  for (const source of [
    { kind: 'project-asset' as const, projectAssetId: 'missing' },
    { kind: 'recording' as const, recordingId: 'missing' },
  ]) {
    await expect(readBorrowableLibraryImage(media(source))).resolves.toBeNull();
  }
  io.get.mockResolvedValue(undefined);
  await expect(readBorrowableLibraryImage(media())).resolves.toBeNull();
  io.get.mockResolvedValue({ ...ref, location: { kind: 'opfs', objectKey: 'wrong' } });
  await expect(readBorrowableLibraryImage(media())).resolves.toBeNull();
  io.get.mockResolvedValue(ref);
  await expect(readBorrowableLibraryImage({ ...media(), size: blob.size + 1 })).resolves.toBeNull();
  await expect(
    readBorrowableLibraryImage({ ...media(), mimeType: 'image/jpeg' })
  ).resolves.toBeNull();
  expect(io.read).not.toHaveBeenCalled();
});

it('creates a new logical child with measured dimensions and the same immutable ref', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(20);
  try {
    await expect(
      createBorrowedScenarioImageAsset({ blob, mediaId: 'library', projectId: 'scenario', ref })
    ).resolves.toEqual({
      assetId: ref.assetId,
      assetRef: ref,
      id: 'scenario-child',
      projectId: 'scenario',
      galleryAssetId: 'library',
      borrowedMediaId: 'library',
      mimeType: ref.mimeType,
      width: 100,
      height: 50,
      createdAt: 20,
      size: ref.size,
    });
    expect(io.dimensions).toHaveBeenCalledWith(blob);
  } finally {
    now.mockRestore();
  }
});
