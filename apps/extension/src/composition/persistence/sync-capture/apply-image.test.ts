import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { commitImagePresentation } from '../image-aggregates/mutations';
import { mediaHasPendingPublication } from '../media-library/delete-cascade.sources';
import { captureRootKey } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import {
  applyPreparedImageReplica,
  parseApplyPreparedImageReplicaInput,
  type ApplyPreparedImageReplicaInput,
} from './apply-image';
import { applyCatalogDeletionNative } from './apply-deletion';

const io = vi.hoisted(() => ({ database: vi.fn(), read: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
  completePhysicalDeleteOperation: vi.fn().mockResolvedValue(undefined),
  listReadyJournals: vi.fn().mockResolvedValue([]),
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: { size: number; mimeType: string }, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType })
  );
});

function setup() {
  let fail = false;
  let writes = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && fail && ++writes === 2
  );
  const table = (name: string) => fixture.rows.get(name)!;
  // The general fixture keys presentations by aggregateId; adapt only its compound-key lookup.
  const database = {
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name !== 'aggregate_presentations') return store;
          return {
            ...store,
            get: (key: IDBValidKey) =>
              store.get(
                Array.isArray(key) && key[0] === 'image' && typeof key[1] === 'string'
                  ? key[1]
                  : key
              ),
            delete: (key: IDBValidKey) =>
              store.delete(
                Array.isArray(key) && key[0] === 'image' && typeof key[1] === 'string'
                  ? key[1]
                  : key
              ),
          };
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const originalRef = {
    assetId: 'image-original',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/image-original' },
    mimeType: 'image/png',
    sha256: null,
    size: 8,
  };
  const media = createMediaLibraryEntry({
    id: 'image-root',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    mimeType: 'image/png',
    size: 8,
    workspaceRevision: 0,
    imageContentState: 'original',
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  const input: ApplyPreparedImageReplicaInput = {
    operationId: 'incoming-image',
    sourceDigest: 'a'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedNativeRevision: null,
    media,
    originalRef,
    workspace: null,
    documentRefs: [],
    presentation: {
      entry: {
        aggregateId: media.id,
        aggregateKind: 'image',
        presentationRevision: 0,
        updatedAt: 1,
      },
      thumbnailRef: {
        ...originalRef,
        assetId: 'thumb',
        location: { kind: 'opfs', objectKey: 'objects/thumb' },
      },
      previewRef: {
        ...originalRef,
        assetId: 'preview',
        location: { kind: 'opfs', objectKey: 'objects/preview' },
      },
    },
  };
  const rootKey = captureRootKey('space', 'media', media.id);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  return {
    ...fixture,
    table,
    input,
    rootKey,
    stateKey,
    fail: () => {
      fail = true;
      writes = 0;
    },
    allow: () => {
      fail = false;
    },
  };
}

it('publishes original-only image bytes and current presentation without an outgoing echo', async () => {
  const f = setup();
  expect(await applyPreparedImageReplica(f.input)).toEqual({ status: 'applied', generation: 1 });
  expect(f.table('media_library').get(f.input.media.id)).toMatchObject({
    workspaceRevision: 1,
    source: { kind: 'screenshot' },
  });
  expect(f.table('aggregate_presentations').get(f.input.media.id)).toMatchObject({
    presentationRevision: 1,
  });
  expect(f.table('image_workspaces').has(f.input.media.id)).toBe(false);
  expect(f.table('asset_refs').size).toBe(0);
  expect(
    [...f.table('sync_capture').values()].some(
      (row) => parseSyncCaptureRecord(row)?.kind === 'sync-operation'
    )
  ).toBe(false);
});

it('rolls back image publication and permits exact retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.fail();
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allow();
  expect(await applyPreparedImageReplica(f.input)).toEqual({ status: 'applied', generation: 1 });
});

it('replays the exact receipt after transport bytes are removed without allocating another revision', async () => {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  const before = structuredClone(f.rows);
  io.read.mockRejectedValue(new Error('Transport staging removed.'));
  expect(await applyPreparedImageReplica(f.input)).toEqual({ status: 'duplicate', generation: 1 });
  expect(f.rows).toEqual(before);
  await expect(
    applyPreparedImageReplica({ ...f.input, sourceDigest: 'b'.repeat(64) })
  ).rejects.toThrow('receipt');
});

it('restores above the image revision fence and refuses stale writers', async () => {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  await applyCatalogDeletionNative({
    rootKind: 'media',
    rootId: f.input.media.id,
    operationId: 'delete-image',
    sourceDigest: 'd'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: 1,
  });
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
    deleted: true,
    nativeRevision: 1,
  });
  expect(
    await applyPreparedImageReplica({
      ...f.input,
      operationId: 'restored-image',
      expectedLocalGeneration: 2,
      expectedBasis: ['delete-image'],
    })
  ).toEqual({ status: 'applied', generation: 3 });
  expect(f.table('media_library').get(f.input.media.id)).toMatchObject({ workspaceRevision: 2 });
  const before = structuredClone(f.rows);
  await expect(
    commitImagePresentation({
      aggregateId: f.input.media.id,
      expectedWorkspaceRevision: 1,
      previewBlob: new Blob(['old']),
      thumbnailBlob: new Blob(['old']),
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(f.rows).toEqual(before);
});

it('publishes decoded document owners and omits stale source presentation', async () => {
  const f = setup();
  const input = {
    ...f.input,
    media: { ...f.input.media, workspaceRevision: 3, imageContentState: 'edited' as const },
    workspace: {
      aggregateId: f.input.media.id,
      createdAt: 1,
      updatedAt: 2,
      revision: 3,
      sourceUrl: null,
      sourceTitle: null,
      document: createPersistedEditorDocumentFixture(
        createEditorDocumentFixture(),
        f.input.originalRef.assetId
      ),
    },
    documentRefs: [f.input.originalRef],
  };
  await applyPreparedImageReplica(input);
  expect(f.table('image_workspaces').get(input.media.id)).toMatchObject({
    revision: 1,
    document: { sourceImage: { assetId: input.originalRef.assetId } },
  });
  expect(f.table('aggregate_presentations').has(input.media.id)).toBe(false);
  expect([...f.table('asset_owners').values()]).toContainEqual({
    assetId: input.originalRef.assetId,
    ownerId: input.media.id,
    ownerKind: 'image-workspace',
    role: 'source-image',
  });
});

it('refuses a concurrent predecessor and unknown or exhausted graveyard fences', async () => {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  const before = structuredClone(f.rows);
  await expect(
    applyPreparedImageReplica({ ...f.input, operationId: 'concurrent-image' })
  ).rejects.toThrow('predecessor');
  expect(f.rows).toEqual(before);
  f.table('media_library').delete(f.input.media.id);
  f.table('aggregate_presentations').delete(f.input.media.id);
  const current = parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey));
  if (current?.kind !== 'root-state') throw new Error('Expected state.');
  const { nativeDigest: _digest, nativeRevision: _revision, ...state } = current;
  f.table('sync_capture').set(f.stateKey, { ...state, deleted: true });
  const restore = {
    ...f.input,
    operationId: 'restored',
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
  };
  await expect(applyPreparedImageReplica(restore)).rejects.toThrow('predecessor');
  f.table('sync_capture').set(f.stateKey, {
    ...state,
    deleted: true,
    nativeRevision: Number.MAX_SAFE_INTEGER,
  });
  await expect(applyPreparedImageReplica(restore)).rejects.toThrow('predecessor');
});

it('validates document closure and matches pending image publication by its native media identity', () => {
  const f = setup();
  expect(parseApplyPreparedImageReplicaInput(f.input)).not.toBeNull();
  expect(
    parseApplyPreparedImageReplicaInput({ ...f.input, documentRefs: [f.input.originalRef] })
  ).toBeNull();
  expect(
    mediaHasPendingPublication(
      { domain: 'sync-replica', payload: { kind: 'image', input: f.input } },
      { id: f.input.media.id }
    )
  ).toBe(true);
  expect(
    mediaHasPendingPublication(
      { domain: 'sync-replica', payload: { kind: 'image', input: f.input } },
      { id: 'unrelated' }
    )
  ).toBe(false);
});
