import { digestCapturedMediaRows } from './freeze';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { initDB } from '../infrastructure/indexed-db/core';
import { freezeImageInTransaction, digestCapturedImageRows } from './image-snapshot';
import { deferCheckpointInTransaction, consumeCheckpointInTransaction } from './checkpoints';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { commitImagePresentation } from '../image-aggregates/mutations';
import { mediaHasPendingPublication } from '../media-library/delete-cascade.sources';
import { assetResidencyCopyId, type AssetResidencyCopy } from '../assets/residency-records';
import { finishAssetResidencyTransitionInTransaction } from '../assets/residency';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
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
  // Node shares native Web Locks across workers. Each in-memory database needs its own scope.
  const locks = navigator.locks;
  const prefix = `image-replica-fixture:${crypto.randomUUID()}:`;
  vi.stubGlobal('navigator', {
    locks: new Proxy(locks, {
      get(target, property) {
        if (property !== 'request') return Reflect.get(target, property, target);
        return (name: string, ...args: unknown[]) =>
          Reflect.apply(target.request, target, [prefix + name, ...args]);
      },
    }),
  });
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: { size: number; mimeType: string }, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType })
  );
});

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let fail = false;
  let writes = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && fail && ++writes === 2
  );
  fixture.rows.set('web_snapshots', new Map());
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

it('publishes a stored image, caches its presentation without echo, and replays without source staging', async () => {
  const f = setup();
  f.input.media = {
    ...f.input.media,
    kind: 'image',
    source: { kind: 'stored-asset', assetId: f.input.originalRef.assetId },
  };
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementation(async (ref: { size: number; mimeType: string }, filename: string) => {
    if (filename === 'parallel-image.png') {
      entered();
      await gate;
    }
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const parallel = applyPreparedImageReplica({
    ...f.input,
    operationId: 'parallel-stored',
    media: { ...f.input.media, filename: 'parallel-image.png' },
  });
  await blocked;
  await expect(applyPreparedImageReplica(f.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  const accepted = structuredClone(f.rows);
  release();
  await expect(parallel).rejects.toThrow();
  expect(f.rows).toEqual(accepted);
  expect(f.table('media_library').get(f.input.media.id)).not.toHaveProperty('blob');
  expect(f.table('asset_refs').get(f.input.originalRef.assetId)).toEqual(f.input.originalRef);
  expect(
    f.table('asset_owners').get(JSON.stringify(['media-library', f.input.media.id, 'source']))
  ).toMatchObject({ assetId: f.input.originalRef.assetId });
  const previousState = parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey));
  await commitImagePresentation({
    aggregateId: f.input.media.id,
    expectedWorkspaceRevision: 1,
    previewBlob: new Blob(['preview'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['thumbnail'], { type: 'image/png' }),
  });
  expect([...f.table('sync_capture').values()].map(parseSyncCaptureRecord)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'sync-operation' })])
  );
  expect([...f.table('sync_capture').values()].map(parseSyncCaptureRecord)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'pending-checkpoint' })])
  );
  expect(f.table('asset_refs').get(f.input.originalRef.assetId)).toEqual(f.input.originalRef);
  const db = await initDB();
  const read = db.transaction(
    ['media_library', 'image_workspaces', 'aggregate_presentations', 'asset_refs', 'asset_owners'],
    'readonly'
  );
  const native = await freezeImageInTransaction(read, f.input.media.id);
  await read.done;
  expect(native.originalRef).toEqual(f.input.originalRef);
  expect(parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey))).toEqual({
    ...previousState,
    nativeDigest: digestCapturedImageRows(native),
  });
  const before = structuredClone(f.rows);
  io.read.mockRejectedValue(new Error('staging removed'));
  await expect(applyPreparedImageReplica(f.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(f.rows).toEqual(before);
});

it('keeps a stored image predecessor through failed publication and rejects delayed recreation', async () => {
  const f = setup();
  f.input.media = {
    ...f.input.media,
    kind: 'image',
    source: { kind: 'stored-asset', assetId: f.input.originalRef.assetId },
  };
  f.fail();
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allow();
  await applyPreparedImageReplica(f.input);
  await applyCatalogDeletionNative({
    rootKind: 'media',
    rootId: f.input.media.id,
    operationId: 'stored-delete',
    sourceDigest: 'd'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: 1,
  });
  await applyPreparedImageReplica({
    ...f.input,
    operationId: 'stored-recreated',
    expectedLocalGeneration: 2,
    expectedBasis: ['stored-delete'],
  });
  const recreated = structuredClone(f.rows);
  await expect(
    applyPreparedImageReplica({
      ...f.input,
      operationId: 'late-stored',
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedNativeRevision: 1,
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(recreated);
});

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

it('updates shared image metadata only when original bytes match', async () => {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  const project = createVideoProjectEntryWithMediaClip({ id: 'dependent' });
  project.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.input.media.id };
  f.table('video_projects').set(project.id, project);
  const next = {
    ...f.input,
    operationId: 'soft-trash',
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedNativeRevision: 1,
    media: {
      ...f.input.media,
      filename: 'renamed.png',
      lifecycle: {
        storageClass: 'library' as const,
        savedAt: 1,
        updatedAt: 2,
        trashedAt: 2,
      },
    },
  };
  expect(await applyPreparedImageReplica(next)).toEqual({ status: 'applied', generation: 2 });
  expect(f.table('media_library').get(f.input.media.id)).toMatchObject({
    filename: 'renamed.png',
    lifecycle: { trashedAt: 2 },
    workspaceRevision: 2,
  });
  expect(f.table('video_projects').get(project.id)).toEqual(project);
  const before = structuredClone(f.rows);
  io.read.mockImplementation(
    async (ref: { size: number; mimeType: string }, filename: string) =>
      new File([new Uint8Array(ref.size).fill(1)], filename, { type: ref.mimeType })
  );
  await expect(
    applyPreparedImageReplica({
      ...next,
      operationId: 'changed-bytes',
      expectedLocalGeneration: 2,
      expectedBasis: ['soft-trash'],
      expectedNativeRevision: 2,
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it.each([false, true])(
  'keeps revision fences through Trash restore and recreation, imported=%s',
  async (imported) => {
    const f = imported ? importedImageReplicaFixture() : setup();
    await applyPreparedImageReplica(f.input);
    const trash = {
      ...f.input,
      operationId: 'trash',
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedNativeRevision: 1,
      media: {
        ...f.input.media,
        lifecycle: { storageClass: 'library' as const, savedAt: 1, updatedAt: 2, trashedAt: 2 },
      },
    };
    await applyPreparedImageReplica(trash);
    const restore = {
      ...f.input,
      operationId: 'restore',
      expectedLocalGeneration: 2,
      expectedBasis: ['trash'],
      expectedNativeRevision: 2,
    };
    await applyPreparedImageReplica(restore);
    expect(f.table('media_library').get(f.input.media.id)).toMatchObject({ workspaceRevision: 3 });
    expect(f.table('media_library').get(f.input.media.id)).not.toHaveProperty(
      'lifecycle.trashedAt'
    );
    await applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: f.input.media.id,
      operationId: 'delete',
      sourceDigest: 'd'.repeat(64),
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 3,
      expectedLocalGeneration: 3,
      expectedBasis: ['restore'],
      expectedWorkspaceRevision: 3,
    });
    await applyPreparedImageReplica({
      ...f.input,
      operationId: 'recreate',
      expectedLocalGeneration: 4,
      expectedBasis: ['delete'],
    });
    expect(f.table('media_library').get(f.input.media.id)).toMatchObject({ workspaceRevision: 4 });
    const before = structuredClone(f.rows);
    await expect(
      applyPreparedImageReplica({ ...restore, operationId: 'delayed-restore' })
    ).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('checks authorization before mutation and replays committed results after pause', async () => {
  const f = setup();
  const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
  f.input.authorization = authorization;
  const connection = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 3,
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  };
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow('admission refused');
  expect(f.rows).toEqual(before);
  f.table('sync_connection').set('connection', connection);
  await expect(applyPreparedImageReplica(f.input)).resolves.toMatchObject({ status: 'applied' });
  f.table('sync_connection').set('connection', {
    ...connection,
    identity: { ...authorization, revision: 2 },
    phase: 'paused',
  });
  const committed = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).resolves.toMatchObject({ status: 'duplicate' });
  expect(f.rows).toEqual(committed);
});

async function unloadedPredecessor() {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  const media = parseMediaLibraryEntry(f.table('media_library').get(f.input.media.id));
  const presentation = parseAggregatePresentationEntry(
    f.table('aggregate_presentations').get(f.input.media.id)
  );
  const state = parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey));
  if (
    !media?.blob ||
    !presentation?.previewBlob ||
    !state ||
    state.kind !== 'root-state' ||
    !state.nativeDigest
  )
    throw new Error('Expected materialized predecessor');
  const copy: AssetResidencyCopy = {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId({ kind: 'inline-image', mediaId: media.id }),
    revision: 2,
    operationId: 'unload',
    phase: 'unloaded',
    lastUsedAt: 1,
    target: {
      kind: 'inline-image',
      mediaId: media.id,
      createdAt: media.createdAt,
      workspaceRevision: media.workspaceRevision ?? 0,
      rootGeneration: state.generation,
      nativeDigest: state.nativeDigest,
      size: media.size,
      mimeType: media.mimeType,
      blobType: media.blob.type,
      duplicatePreview: {
        presentationRevision: presentation.presentationRevision,
        blobType: presentation.previewBlob.type,
      },
    },
    remote: {
      key: 'Originals/old-original.png',
      sha256: createHash('sha256').update(new Uint8Array(media.size)).digest('hex'),
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.example.test/root/',
        accountId: 'alice',
        spaceId: 'space',
        connectionGeneration: 3,
        profileCreatedAt: 1,
      },
    },
  };
  const { blob: _blob, ...missing } = media;
  const { previewBlob: _preview, ...missingPreview } = presentation;
  f.table('media_library').set(media.id, missing);
  f.table('aggregate_presentations').set(media.id, missingPreview);
  f.table('asset_residency').set(copy.id, copy);
  const next: ApplyPreparedImageReplicaInput = {
    ...f.input,
    operationId: 'next-image',
    sourceDigest: 'b'.repeat(64),
    expectedLocalGeneration: state.generation,
    expectedBasis: [...state.basis],
    expectedNativeRevision: media.workspaceRevision ?? 0,
    originalRef: {
      ...f.input.originalRef,
      assetId: 'next-original',
      location: { kind: 'opfs', objectKey: 'objects/next-original' },
    },
  };
  io.read.mockClear();
  return { ...f, copy, next, media, state };
}

it('applies an incoming unloaded image without reading old bytes and retires its recovery row atomically', async () => {
  const f = await unloadedPredecessor();
  expect(await applyPreparedImageReplica(f.next)).toEqual({ status: 'applied', generation: 2 });
  expect(f.table('asset_residency').has(f.copy.id)).toBe(false);
  expect(f.table('media_library').get(f.media.id)).toMatchObject({
    workspaceRevision: 2,
    blob: expect.any(Blob),
  });
  expect(io.read).toHaveBeenCalledTimes(3);
  expect(io.read.mock.calls.map(([ref]) => ref.assetId)).not.toContain(f.input.originalRef.assetId);
  const committed = structuredClone(f.rows);
  io.read.mockRejectedValue(new Error('Staging removed'));
  expect(await applyPreparedImageReplica(f.next)).toEqual({ status: 'duplicate', generation: 2 });
  expect(f.rows).toEqual(committed);
});

it('keeps unloaded predecessor and exact recovery evidence after receipt refusal and permits retry', async () => {
  const f = await unloadedPredecessor();
  const before = structuredClone(f.rows);
  f.fail();
  await expect(applyPreparedImageReplica(f.next)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allow();
  expect(await applyPreparedImageReplica(f.next)).toEqual({ status: 'applied', generation: 2 });
  expect(f.table('asset_residency').has(f.copy.id)).toBe(false);
});

it('accepts unchanged unloaded originals borrowed by a project only after checking new staged SHA', async () => {
  const f = await unloadedPredecessor();
  const borrower = createVideoProjectEntryWithMediaClip({ id: 'borrower' });
  borrower.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media.id };
  f.table('video_projects').set(borrower.id, borrower);
  expect(await applyPreparedImageReplica(f.next)).toEqual({ status: 'applied', generation: 2 });
  expect(f.table('asset_residency').has(f.copy.id)).toBe(false);
});

it('retains the replaceability guard when an unloaded borrowed original changes', async () => {
  const f = await unloadedPredecessor();
  const borrower = createVideoProjectEntryWithMediaClip({ id: 'borrower' });
  borrower.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media.id };
  f.table('video_projects').set(borrower.id, borrower);
  io.read.mockImplementation(
    async (ref: { size: number; mimeType: string; assetId: string }, filename: string) =>
      new File(
        [
          ref.assetId === 'next-original'
            ? new TextEncoder().encode('changed!')
            : new Uint8Array(ref.size),
        ],
        filename,
        { type: ref.mimeType }
      )
  );
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.next)).rejects.toMatchObject({
    name: 'MediaAssetDeletionBlockedError',
  });
  expect(f.rows).toEqual(before);
});

it('refuses delayed incoming completion after a controlled native generation replacement', async () => {
  const f = await unloadedPredecessor();
  io.read.mockImplementation(async (ref: { size: number; mimeType: string }, filename: string) => {
    f.table('sync_capture').set(f.stateKey, { ...f.state, generation: 2 });
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  await expect(applyPreparedImageReplica(f.next)).rejects.toThrow('predecessor changed');
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
  expect(f.table('media_library').get(f.media.id)).not.toHaveProperty('blob');
});

it('refuses an old restore settlement after incoming replaced the native image', async () => {
  const f = await unloadedPredecessor();
  await applyPreparedImageReplica(f.next);
  const committed = structuredClone(f.rows);
  await expect(
    runWithIndexedDbMutation(async (db, permit) => {
      const tx = db.transaction(['asset_residency'], 'readwrite');
      try {
        await finishAssetResidencyTransitionInTransaction(tx, f.copy, 'resident', permit);
        await tx.done;
      } catch (error) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw error;
      }
    })
  ).rejects.toThrow('source is stale');
  expect(f.rows).toEqual(committed);
});

it('applies an unloaded image tombstone without reading originals and retires its recovery evidence', async () => {
  const f = await unloadedPredecessor();
  io.read.mockRejectedValue(new Error('Old originals must not be fetched'));
  expect(
    await applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: f.media.id,
      operationId: 'delete-unloaded',
      sourceDigest: 'c'.repeat(64),
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 3,
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedWorkspaceRevision: 1,
    })
  ).toEqual({ status: 'applied', generation: 2 });
  expect(f.table('media_library').has(f.media.id)).toBe(false);
  expect(f.table('asset_residency').has(f.copy.id)).toBe(false);
  expect(io.read).not.toHaveBeenCalled();
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
    deleted: true,
    generation: 2,
    nativeRevision: 1,
  });
});

it('refuses a pending checkpoint before the first causal image state', async () => {
  const f = setup();
  const tx = f.database.transaction(['sync_capture'], 'readwrite');
  const pending = await deferCheckpointInTransaction(
    tx,
    { rootKind: 'media', rootId: f.input.media.id },
    2
  );
  await tx.done;
  expect(pending).not.toBeNull();
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  if (!pending) throw new Error('Missing pending checkpoint fixture');
  const consume = f.database.transaction(['sync_capture'], 'readwrite');
  expect(await consumeCheckpointInTransaction(consume, pending)).toBe(true);
  await consume.done;
  await expect(applyPreparedImageReplica(f.input)).resolves.toMatchObject({ status: 'applied' });
});

it('refuses pending work with unchanged causal generation and native digest', async () => {
  const f = setup();
  await applyPreparedImageReplica(f.input);
  const next = {
    ...f.input,
    operationId: 'pending-successor',
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedNativeRevision: 1,
  };
  const tx = f.database.transaction(['sync_capture'], 'readwrite');
  const pending = await deferCheckpointInTransaction(
    tx,
    { rootKind: 'media', rootId: f.input.media.id },
    2
  );
  await tx.done;
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(next)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  if (!pending) throw new Error('Missing pending checkpoint fixture');
  const consume = f.database.transaction(['sync_capture'], 'readwrite');
  expect(await consumeCheckpointInTransaction(consume, pending)).toBe(true);
  await consume.done;
  await expect(applyPreparedImageReplica(next)).resolves.toMatchObject({ status: 'applied' });
});

function importedImageReplicaFixture(legacy = false) {
  const f = setup();
  const id = 'project-asset:imported-image';
  const child = createProjectAssetEntry({
    id: 'imported-image',
    assetId: f.input.originalRef.assetId,
    size: f.input.originalRef.size,
    mimeType: f.input.originalRef.mimeType,
  });
  const rootKey = captureRootKey('space', 'media', id);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const input: ApplyPreparedImageReplicaInput = {
    ...f.input,
    media: {
      ...f.input.media,
      id,
      kind: 'image',
      source: { kind: 'project-asset', projectAssetId: child.id },
      workspaceRevision: 2,
      imageContentState: 'edited',
    },
    projectAsset: child,
    presentation: null,
    workspace: {
      aggregateId: id,
      revision: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceTitle: null,
      sourceUrl: null,
      document: createPersistedEditorDocumentFixture(
        createEditorDocumentFixture(),
        f.input.originalRef.assetId
      ),
    },
    documentRefs: [f.input.originalRef],
    ...(legacy
      ? {
          expectedLocalGeneration: 1,
          expectedBasis: ['legacy-imported'],
          expectedNativeRevision: 0,
        }
      : {}),
  };
  let immutable: unknown;
  if (legacy) {
    const media = { ...input.media, workspaceRevision: 0, imageContentState: 'original' as const };
    const rows = { media, projectAsset: child, ref: input.originalRef };
    f.table('media_library').set(id, media);
    f.table('project_assets').set(child.id, child);
    f.table('asset_refs').set(input.originalRef.assetId, input.originalRef);
    f.table('asset_owners').set(JSON.stringify(['project-asset', child.id, 'body']), {
      assetId: child.assetId,
      ownerKind: 'project-asset',
      ownerId: child.id,
      role: 'body',
    });
    f.table('sync_capture').set(stateKey, {
      version: 1,
      kind: 'root-state',
      key: stateKey,
      createdAt: 1,
      spaceId: 'space',
      rootKind: 'media',
      rootId: id,
      rootKey,
      generation: 1,
      basis: ['legacy-imported'],
      nativeDigest: digestCapturedMediaRows(rows),
    });
    const native = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', 'legacy-imported']),
      createdAt: 1,
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: id,
      rootKey,
      generation: 1,
      operationId: 'legacy-imported',
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'media', rows },
    });
    const { change: _change, phase: _phase, ...header } = native;
    immutable = {
      ...header,
      phase: 'published',
      publication: {
        kind: 'verified',
        acceptedAt: 1,
        preparedSha256: 'a'.repeat(64),
        attemptId: '11111111-1111-4111-8111-111111111111',
        recordKey: 'records/legacy.json',
        recordSha256: 'b'.repeat(64),
      },
      objects: [],
    };
    if (!parseSyncCaptureRecord(immutable)) throw new Error('Invalid legacy capture fixture');
    f.table('sync_capture').set(native.key, immutable);
  }
  return { ...f, input, child, rootKey, stateKey, immutable };
}

it('applies a causal Image successor over an exact pristine legacy project-asset media predecessor', async () => {
  const f = importedImageReplicaFixture(true);
  const previousChild = structuredClone(f.table('project_assets').get(f.child.id));
  const previousRef = structuredClone(f.table('asset_refs').get(f.input.originalRef.assetId));
  const previousOwner = structuredClone(
    f.table('asset_owners').get(JSON.stringify(['project-asset', f.child.id, 'body']))
  );
  await expect(applyPreparedImageReplica(f.input)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(f.table('project_assets').get(f.child.id)).toEqual(previousChild);
  expect(f.table('asset_refs').get(f.input.originalRef.assetId)).toEqual(previousRef);
  expect(
    f.table('asset_owners').get(JSON.stringify(['project-asset', f.child.id, 'body']))
  ).toEqual(previousOwner);
  expect(f.table('media_library').get(f.input.media.id)).toMatchObject({
    source: f.input.media.source,
    workspaceRevision: 1,
  });
  expect(f.table('image_workspaces').get(f.input.media.id)).toMatchObject({
    document: f.input.workspace?.document,
  });
  expect(f.table('sync_capture').get(JSON.stringify(['change', 'legacy-imported']))).toEqual(
    f.immutable
  );
  const before = structuredClone(f.rows);
  io.read.mockRejectedValue(new Error('staging removed'));
  await expect(applyPreparedImageReplica(f.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 2,
  });
  expect(f.rows).toEqual(before);
});

it('refuses legacy project-asset predecessor with an unsynced local Image workspace', async () => {
  const f = importedImageReplicaFixture(true);
  f.table('image_workspaces').set(f.input.media.id, { ...f.input.workspace, revision: 0 });
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('publishes a project-asset Image child workspace and source owners atomically', async () => {
  const f = importedImageReplicaFixture();
  await applyPreparedImageReplica(f.input);
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(
    f.table('asset_owners').get(JSON.stringify(['project-asset', f.child.id, 'body']))
  ).toMatchObject({ assetId: f.child.assetId });
  expect(f.table('media_library').get(f.input.media.id)).not.toHaveProperty('blob');
  const accepted = structuredClone(f.rows);
  const db = await initDB();
  const tx = db.transaction(
    [
      'sync_capture',
      'media_library',
      'project_assets',
      'asset_refs',
      'asset_owners',
      'image_workspaces',
      'aggregate_presentations',
    ],
    'readonly'
  );
  const native = await freezeImageInTransaction(tx, f.input.media.id);
  await tx.done;
  expect(native.projectAsset).toEqual(f.child);
  expect(parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey))).toMatchObject({
    nativeDigest: digestCapturedImageRows(native),
    nativeRevision: 1,
  });
  expect(f.rows).toEqual(accepted);
});

it('rolls back imported Image child publication and permits one retry before deletion and recreation', async () => {
  const f = importedImageReplicaFixture();
  const before = structuredClone(f.rows);
  f.fail();
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allow();
  await expect(applyPreparedImageReplica(f.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  await expect(
    applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: f.input.media.id,
      operationId: 'imported-delete',
      sourceDigest: 'd'.repeat(64),
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 3,
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedWorkspaceRevision: 1,
    })
  ).resolves.toEqual({ status: 'applied', generation: 2 });
  expect(f.table('media_library').has(f.input.media.id)).toBe(false);
  expect(f.table('project_assets').has(f.child.id)).toBe(false);
  await expect(
    applyPreparedImageReplica({
      ...f.input,
      operationId: 'imported-recreated',
      expectedLocalGeneration: 2,
      expectedBasis: ['imported-delete'],
    })
  ).resolves.toEqual({ status: 'applied', generation: 3 });
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  const recreated = structuredClone(f.rows);
  await expect(
    applyPreparedImageReplica({
      ...f.input,
      operationId: 'late-imported',
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedNativeRevision: 1,
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(recreated);
});

it('refuses an unrelated existing project-asset child before publishing an imported Image root', async () => {
  const f = importedImageReplicaFixture();
  f.table('project_assets').set(f.child.id, { ...f.child, assetId: 'another-source' });
  const before = structuredClone(f.rows);
  await expect(applyPreparedImageReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('preserves Montage borrowed originals while applying imported Image workspace changes', async () => {
  const f = importedImageReplicaFixture(true);
  const borrower = createVideoProjectEntryWithMediaClip({ id: 'imported-image-borrower' });
  borrower.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.input.media.id };
  f.table('video_projects').set(borrower.id, borrower);
  await expect(applyPreparedImageReplica(f.input)).resolves.toMatchObject({ status: 'applied' });
  expect(f.table('video_projects').get(borrower.id)).toEqual(borrower);
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(f.table('media_library').get(f.input.media.id)).toMatchObject({
    source: f.input.media.source,
  });
});
