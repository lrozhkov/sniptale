import { beforeEach, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  rows: new Map<string, Map<string, unknown>>(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation({
      transaction: () => ({
        objectStore: (name: string) => ({
          get: async (key: string) => io.rows.get(name)?.get(JSON.stringify(key)),
          getAll: async () => [...(io.rows.get(name)?.values() ?? [])],
          put: async (value: { assetId?: string; id?: string; ownerId?: string }) => {
            const key =
              name === 'asset_owners'
                ? JSON.stringify(['media-library', value.ownerId, 'source'])
                : JSON.stringify(value.id ?? value.assetId);
            io.rows.get(name)?.set(key, value);
          },
        }),
        done: Promise.resolve(),
      }),
    }),
}));

import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
} from '../infrastructure/indexed-db/core';
import { backfillScenarioLibraryAssets } from './library-publication';

beforeEach(() => {
  io.rows.clear();
  for (const name of [
    ASSET_OWNERS_STORE,
    ASSET_REFS_STORE,
    MEDIA_LIBRARY_STORE,
    SCENARIO_ASSETS_STORE,
  ]) {
    io.rows.set(name, new Map());
  }
});

it('publishes an existing scenario child into the library once while preserving its physical source', async () => {
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify('old-image'), {
    id: 'old-image',
    projectId: 'old-scenario',
    assetId: 'physical-image',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 1,
    size: 4,
  });
  io.rows.get(ASSET_REFS_STORE)!.set(JSON.stringify('physical-image'), {
    assetId: 'physical-image',
    mimeType: 'image/png',
    size: 4,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/physical-image' },
  });

  expect(await backfillScenarioLibraryAssets()).toBe(1);
  expect(
    io.rows.get(MEDIA_LIBRARY_STORE)?.get(JSON.stringify('scenario-asset:old-image'))
  ).toMatchObject({
    id: 'scenario-asset:old-image',
    source: { kind: 'stored-asset', assetId: 'physical-image' },
  });
  expect(
    io.rows
      .get(ASSET_OWNERS_STORE)
      ?.get(JSON.stringify(['media-library', 'scenario-asset:old-image', 'source']))
  ).toMatchObject({
    assetId: 'physical-image',
  });
  expect(await backfillScenarioLibraryAssets()).toBe(0);
  expect(io.rows.get(MEDIA_LIBRARY_STORE)?.size).toBe(1);
});

it('keeps an existing borrowed child valid after its Library image presentation is edited', async () => {
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify('borrowed-image'), {
    id: 'borrowed-image',
    projectId: 'scenario',
    assetId: 'physical-image',
    galleryAssetId: 'library-image',
    borrowedMediaId: 'library-image',
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 1,
    size: 4,
  });
  io.rows.get(ASSET_REFS_STORE)!.set(JSON.stringify('physical-image'), {
    assetId: 'physical-image',
    mimeType: 'image/png',
    size: 4,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/physical-image' },
  });
  io.rows.get(MEDIA_LIBRARY_STORE)!.set(JSON.stringify('library-image'), {
    id: 'library-image',
    kind: 'image',
    source: { kind: 'stored-asset', assetId: 'physical-image' },
    filename: 'image.png',
    originalFilename: 'image.png',
    createdAt: 1,
    updatedAt: 2,
    size: 4,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    workspaceRevision: 1,
  });

  await expect(backfillScenarioLibraryAssets()).resolves.toBe(0);
  expect(io.rows.get(MEDIA_LIBRARY_STORE)?.size).toBe(1);
});

it('does not publish a private rendered copy imported from an existing Library card', async () => {
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify('rendered-copy'), {
    id: 'rendered-copy',
    projectId: 'scenario',
    assetId: 'rendered-physical',
    galleryAssetId: 'library-original',
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 1,
    size: 4,
  });
  io.rows.get(ASSET_REFS_STORE)!.set(JSON.stringify('rendered-physical'), {
    assetId: 'rendered-physical',
    mimeType: 'image/png',
    size: 4,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/rendered-physical' },
  });
  expect(await backfillScenarioLibraryAssets()).toBe(0);
  expect(io.rows.get(MEDIA_LIBRARY_STORE)?.size).toBe(0);
  expect(io.rows.get(ASSET_REFS_STORE)?.size).toBe(1);
});

function seedPublicationSource() {
  const child = {
    id: 'source',
    projectId: 'scenario',
    assetId: 'physical',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 1,
    size: 4,
  };
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify(child.id), child);
  io.rows.get(ASSET_REFS_STORE)!.set(JSON.stringify(child.assetId), {
    assetId: child.assetId,
    mimeType: child.mimeType,
    size: child.size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/physical' },
  });
  return child;
}

it('does not overwrite an occupied Library identity during publication', async () => {
  seedPublicationSource();
  const occupied = { id: 'scenario-asset:source', invalid: true };
  io.rows.get(MEDIA_LIBRARY_STORE)!.set(JSON.stringify(occupied.id), occupied);
  await expect(backfillScenarioLibraryAssets()).rejects.toThrow(
    'identity scenario-asset:source is occupied'
  );
  expect(io.rows.get(MEDIA_LIBRARY_STORE)!.get(JSON.stringify(occupied.id))).toEqual(occupied);
  expect(io.rows.get(ASSET_OWNERS_STORE)?.size).toBe(0);
});

it.each([null, {}, { assetId: 'other-physical' }])(
  'retains conflicting Library ownership %j',
  async (owner) => {
    seedPublicationSource();
    io.rows
      .get(ASSET_OWNERS_STORE)!
      .set(JSON.stringify(['media-library', 'scenario-asset:source', 'source']), owner);
    await expect(backfillScenarioLibraryAssets()).rejects.toThrow(
      'owner scenario-asset:source is occupied'
    );
    expect(io.rows.get(MEDIA_LIBRARY_STORE)?.size).toBe(0);
    expect(io.rows.get(ASSET_REFS_STORE)?.size).toBe(1);
  }
);

it('does not publish missing or mismatched source bytes or invalid child metadata', async () => {
  const child = seedPublicationSource();
  io.rows.get(ASSET_REFS_STORE)!.delete(JSON.stringify(child.assetId));
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify('invalid'), { id: 'invalid' });
  expect(await backfillScenarioLibraryAssets()).toBe(0);
  expect(io.rows.get(MEDIA_LIBRARY_STORE)?.size).toBe(0);
});

it('preserves a replaced canonical root version during legacy backfill', async () => {
  const child = {
    id: 'frozen',
    projectId: 'scenario',
    assetId: 'old-bytes',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 1,
    size: 4,
  };
  io.rows.get(SCENARIO_ASSETS_STORE)!.set(JSON.stringify(child.id), child);
  io.rows.get(ASSET_REFS_STORE)!.set(JSON.stringify(child.assetId), {
    assetId: child.assetId,
    mimeType: child.mimeType,
    size: child.size,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/old-bytes' },
  });
  const { createMediaLibraryEntry } = await import('../projects/index.test-support');
  const root = createMediaLibraryEntry({
    id: 'scenario-asset:frozen',
    source: { kind: 'stored-asset', assetId: 'new-bytes' },
  });
  io.rows.get(MEDIA_LIBRARY_STORE)!.set(JSON.stringify(root.id), root);
  const owner = {
    assetId: 'new-bytes',
    ownerId: root.id,
    ownerKind: 'media-library',
    role: 'source',
  };
  io.rows.get(ASSET_OWNERS_STORE)!.set(JSON.stringify(['media-library', root.id, 'source']), owner);
  expect(await backfillScenarioLibraryAssets()).toBe(0);
  expect(io.rows.get(MEDIA_LIBRARY_STORE)!.get(JSON.stringify(root.id))).toEqual(root);
  expect(
    io.rows.get(ASSET_OWNERS_STORE)!.get(JSON.stringify(['media-library', root.id, 'source']))
  ).toEqual(owner);
});
