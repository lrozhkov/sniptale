import { beforeAll, expect, it } from 'vitest';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import { scanSyncCatalogSnapshot } from './catalog';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { createSyncAttempt, hashSyncText } from './wire-record';
import type { SyncRemoteStore } from './remote-store';

const ROOT_COUNT = 10_000;
const ORIGINAL_SIZE = 6 * 1024 * 1024;
const PAGE_SIZE = 64;

async function createManifest(index: number) {
  const sourceId = `source-${index}`;
  const rootId = `project-asset:${sourceId}`;
  const object = {
    objectId: 'sync-object-000001',
    path: '_sniptale/assets/sync-object-000001/original.png',
    filename: 'original.png',
    mimeType: 'image/png',
    size: ORIGINAL_SIZE,
  };
  return createSyncAttempt(
    JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: 'capacity-space',
      operationId: `operation-${index}`,
      rootKind: 'media',
      rootId,
      kind: 'edit',
      parents: [],
      dependencies: [],
      envelope: parseRootEnvelope({
        descriptor: {
          rootKind: 'media',
          rootId,
          mediaSubtype: 'library-item',
          metadataPath: 'Metadata/sync-root.json',
          objectCount: 1,
          totalBytes: ORIGINAL_SIZE,
        },
        metadata: {
          entry: createMediaLibraryEntry({
            id: rootId,
            filename: object.filename,
            source: { kind: 'project-asset', projectAssetId: sourceId },
            mimeType: object.mimeType,
            size: object.size,
            workspaceRevision: 0,
            lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
          }),
          originalObjectId: object.objectId,
          projectAsset: {
            id: sourceId,
            mimeType: object.mimeType,
            size: object.size,
            createdAt: 1,
          },
        },
        objects: [object],
      }),
      objects: [{ objectId: object.objectId, sha256: 'a'.repeat(64) }],
    }),
    `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`
  );
}

async function createCapacitySeed() {
  const records = new Map<string, Blob>();
  const cachedManifests = [];
  for (let index = 0; index < ROOT_COUNT; index++) {
    const manifest = await createManifest(index);
    const body = new Blob([manifest.recordText]);
    records.set(manifest.recordKey, body);
    cachedManifests.push({
      manifestKey: manifest.recordKey,
      size: body.size,
      text: manifest.recordText,
    });
  }
  return { records, cachedManifests };
}

let seed: Awaited<ReturnType<typeof createCapacitySeed>>;
beforeAll(async () => {
  seed = await createCapacitySeed();
}, 60_000);

function createCapacityFixture() {
  const { records, cachedManifests } = seed;
  const prefix = `.sniptale/${hashSyncText('capacity-space')}/records/`;
  const listing = [...records].map(([key, body]) => ({ key, size: body.size }));
  let reads = 0;
  let pages = 0;
  const remote: SyncRemoteStore = {
    list: async (requestedPrefix, options) => {
      expect(requestedPrefix).toBe(prefix);
      pages++;
      const offset = options.cursor ? Number(options.cursor) : 0;
      const end = offset + PAGE_SIZE;
      return {
        objects: listing.slice(offset, end),
        prefixes: [],
        nextCursor: end < listing.length ? String(end) : null,
      };
    },
    read: async (key) => {
      expect(key.startsWith(prefix)).toBe(true);
      const body = records.get(key);
      if (!body) throw new Error('Catalog requested bytes outside the manifest inventory.');
      reads++;
      return body.stream();
    },
    stat: async () => {
      throw new Error('Catalog must not stat original bytes.');
    },
    write: async () => {
      throw new Error('Catalog must not write.');
    },
  };
  return { remote, listing, cachedManifests, reads: () => reads, pages: () => pages };
}

it('scans and revalidates 10000 live roots without fetching their 50 GiB of original bytes', async () => {
  const fixture = createCapacityFixture();
  const { remote } = fixture;
  const signal = new AbortController().signal;
  const cold = await scanSyncCatalogSnapshot(remote, 'capacity-space', signal);
  expect(ROOT_COUNT * ORIGINAL_SIZE).toBeGreaterThan(50 * 1024 ** 3);
  expect(cold.catalog.roots.size).toBe(ROOT_COUNT);
  expect(cold.catalog.operations.size).toBe(ROOT_COUNT);
  expect(cold.catalog.invalid).toEqual([]);
  expect(cold.catalog.pending).toEqual([]);
  expect(cold.catalog.quarantined).toEqual([]);
  expect(
    [...cold.catalog.roots.values()].every(
      (root) => !root.deleted && !root.conflict && !root.blocked && root.heads.length === 1
    )
  ).toBe(true);
  expect(cold.manifests).toHaveLength(ROOT_COUNT);
  expect(fixture.reads()).toBe(ROOT_COUNT);
  expect(fixture.pages()).toBe(Math.ceil(ROOT_COUNT / PAGE_SIZE));
  const warm = await scanSyncCatalogSnapshot(remote, 'capacity-space', signal, cold.manifests);
  expect([...warm.catalog.roots]).toEqual([...cold.catalog.roots]);
  expect(warm.manifests).toEqual(cold.manifests);
  expect(warm.catalog.metadataBytes).toBe(cold.catalog.metadataBytes);
  expect(fixture.reads()).toBe(ROOT_COUNT);
  expect(fixture.pages()).toBe(2 * Math.ceil(ROOT_COUNT / PAGE_SIZE));
}, 60_000);

it('refuses manifest 10001 while retaining all 10000 checked cache entries', async () => {
  const fixture = createCapacityFixture();
  const { remote, listing } = fixture;
  const retained = structuredClone(fixture.cachedManifests);
  const signal = new AbortController().signal;
  const overflow = await createManifest(ROOT_COUNT);
  listing.push({ key: overflow.recordKey, size: new Blob([overflow.recordText]).size });
  await expect(
    scanSyncCatalogSnapshot(remote, 'capacity-space', signal, fixture.cachedManifests)
  ).rejects.toMatchObject({ code: 'metadata-limit' });
  expect(fixture.reads()).toBe(0);
  expect(fixture.cachedManifests).toEqual(retained);
}, 60_000);
