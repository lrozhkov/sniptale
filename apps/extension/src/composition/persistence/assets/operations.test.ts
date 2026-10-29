import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import type { PublishedCaptureOperation } from '../sync-capture/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  isPersistenceMutationTransitionHeld,
  runWithPersistentDataErasureBarrier,
  runWithDurableAssetLifecycleLock,
} from '../infrastructure/mutation-barrier';

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  initDB: vi.fn(),
  runMutation: vi.fn(),
  journals: vi.fn(),
  writing: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ append: mocks.log }),
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
vi.mock('./opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs-store')>()),
  deleteAssetObject: mocks.deleteObject,
  listReadyJournals: mocks.journals,
  listWritingAssetIds: mocks.writing,
}));

import {
  releasePublishedOperationPins,
  appendAssetOperationCompensation,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  completePhysicalDeleteOperations,
  deleteOrphanAssetObjectBatch,
  createBackupRestoreOperation,
  readAssetOperation,
  transitionAssetOperation,
  abortArchiveRestoreSession,
  appendCommittedArchiveRootInTransaction,
  beginArchiveRestoreRoot,
  completeArchiveRestoreSession,
  createArchiveRestoreSession,
  listArchiveRestoreSessions,
  readArchiveRestoreSession,
} from './operations';

const operation = {
  compensations: [],
  createdAt: 1,
  kind: 'backup-restore' as const,
  obsoleteAssetIds: [],
  operationId: 'restore-1',
  status: 'pending' as const,
  updatedAt: 1,
};

const hostLocks = navigator.locks;

beforeEach(() => {
  vi.clearAllMocks();
  // Node native locks span worker threads; explicit lock cases install their own manager.
  vi.stubGlobal('navigator', {});
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

function installMutationHarness(current: unknown = operation) {
  const put = vi.fn().mockResolvedValue(undefined);
  const store = { get: vi.fn().mockResolvedValue(current), put };
  const db = {
    get: vi.fn(async (): Promise<unknown> => undefined),
    getAll: vi.fn(async (_store: string): Promise<unknown[]> => []),
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore: () => store })),
  };
  mocks.runMutation.mockImplementation(async (callback) => callback(db));
  return { db, put, store };
}

describe('durable asset operations', () => {
  it('keeps fixture deletion independent from host lock admission failures', async () => {
    const request = vi
      .spyOn(hostLocks, 'request')
      .mockRejectedValue(new Error('unrelated host lock admission failed'));
    try {
      const { db } = installMutationHarness();
      const intent = buildPhysicalDeleteOperation(['obsolete']);
      await completePhysicalDeleteOperation(intent);
      expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith('obsolete');
      expect(db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
    }
  });
  it.each(['owner', 'ready'] as const)(
    'retains bytes adopted after their physical delete was journaled: %s',
    async (claim) => {
      const harness = installMutationHarness();
      const intent = buildPhysicalDeleteOperation(['shared']);
      if (claim === 'owner') {
        const ref = {
          assetId: 'shared',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/shared' },
          mimeType: 'image/png',
          size: 3,
          sha256: null,
        };
        harness.db.getAll.mockImplementation(async (store: string) =>
          store === 'asset_refs'
            ? [ref]
            : store === 'asset_owners'
              ? [
                  {
                    assetId: 'shared',
                    ownerKind: 'image-workspace',
                    ownerId: 'copy',
                    role: 'source',
                  },
                ]
              : []
        );
      } else
        mocks.journals.mockResolvedValue([
          {
            journalId: 'prepared-copy',
            domain: 'image-workspace',
            createdAt: 1,
            assetRefs: [{ assetId: 'shared' }],
            payload: {},
          },
        ]);
      await completePhysicalDeleteOperation(intent);
      expect(mocks.deleteObject).not.toHaveBeenCalled();
      if (claim === 'owner')
        expect(harness.db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
      else expect(harness.db.delete).not.toHaveBeenCalled();
    }
  );
  it('deduplicates physical-delete asset ids and completes deletion before removing intent', async () => {
    const harness = installMutationHarness();
    const intent = buildPhysicalDeleteOperation(['asset-1', 'asset-1', 'asset-2']);

    expect(intent.assetIds).toEqual(['asset-1', 'asset-2']);
    await completePhysicalDeleteOperation(intent);

    expect(mocks.deleteObject.mock.calls.map(([assetId]) => assetId)).toEqual([
      'asset-1',
      'asset-2',
    ]);
    expect(harness.db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
  });

  it('creates and parses a pending backup operation', async () => {
    const harness = installMutationHarness();
    const created = await createBackupRestoreOperation();
    expect(created.status).toBe('pending');
    expect(harness.db.add).toHaveBeenCalledWith('asset_operations', created);

    mocks.initDB.mockResolvedValue({ get: vi.fn().mockResolvedValue(created) });
    await expect(readAssetOperation(created.operationId)).resolves.toEqual(created);
    mocks.initDB.mockResolvedValue({ get: vi.fn().mockResolvedValue({ invalid: true }) });
    await expect(readAssetOperation(created.operationId)).resolves.toBeUndefined();
  });

  it('appends compensation and enforces the pending transition authority', async () => {
    const harness = installMutationHarness();
    const compensation = {
      assetId: 'asset-1',
      journalId: 'journal-1',
      nextMediaId: 'recording:recording-1',
      nextOwnerId: 'recording-1',
      previousRecords: {},
    };
    await appendAssetOperationCompensation(operation.operationId, compensation);
    expect(harness.put).toHaveBeenCalledWith(
      expect.objectContaining({ compensations: [compensation] })
    );

    await transitionAssetOperation(operation.operationId, 'pending', 'committed');
    expect(harness.put).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'committed' }));

    installMutationHarness({ ...operation, status: 'aborted' });
    await expect(
      appendAssetOperationCompensation(operation.operationId, compensation)
    ).rejects.toThrow('not pending');
    await expect(
      transitionAssetOperation(operation.operationId, 'pending', 'committed')
    ).rejects.toThrow('not pending');

    installMutationHarness(null);
    await expect(
      transitionAssetOperation(operation.operationId, 'pending', 'committed')
    ).rejects.toThrow('not pending');
  });

  it('persists immutable archive identity and checkpoints a root in the caller transaction', async () => {
    const harness = installMutationHarness();
    await expect(
      createArchiveRestoreSession({ archiveFingerprint: 'invalid', strategy: 'duplicate' })
    ).rejects.toThrow('fingerprint is invalid');
    const created = await createArchiveRestoreSession({
      archiveFingerprint: 'a'.repeat(64),
      strategy: 'duplicate',
    });
    expect(harness.db.add).toHaveBeenCalledWith('asset_operations', created);
    expect(created).toMatchObject({ currentRoot: null, status: 'pending', strategy: 'duplicate' });

    const session = { ...created, currentRoot: 'media:library-item:one' };
    const store = {
      get: vi.fn().mockResolvedValue(session),
      put: vi.fn().mockResolvedValue(undefined),
    };
    await appendCommittedArchiveRootInTransaction(store, session.operationId, {
      rootKey: 'media:library-item:one',
      targetRootId: 'media-copy',
      childIds: { 'scenario-asset:image': 'image-copy' },
    });
    expect(store.put).toHaveBeenCalledWith(
      expect.objectContaining({
        committedRoots: ['media:library-item:one'],
        childIdMap: { 'scenario-asset:image': 'image-copy' },
        conflictedRoots: [],
        currentRoot: null,
        rootIdMap: { 'media:library-item:one': 'media-copy' },
        skippedRoots: [],
        strategy: 'duplicate',
      })
    );

    store.get = vi.fn().mockResolvedValue({
      ...session,
      childIdMap: { 'scenario-asset:image': 'first-image-copy' },
      currentRoot: 'scenario-project:two',
    });
    await expect(
      appendCommittedArchiveRootInTransaction(store, session.operationId, {
        rootKey: 'scenario-project:two',
        targetRootId: 'scenario-copy',
        childIds: { 'scenario-asset:image': 'second-image-copy' },
      })
    ).rejects.toThrow('already mapped');

    store.get = vi.fn().mockResolvedValue(session);
    await appendCommittedArchiveRootInTransaction(store, session.operationId, {
      rootKey: 'media:library-item:one',
      targetRootId: 'media-existing',
      imported: false,
      conflicted: true,
    });
    expect(store.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conflictedRoots: ['media:library-item:one'],
        skippedRoots: ['media:library-item:one'],
      })
    );
  });

  it('enforces archive root and terminal session transitions', async () => {
    const session = {
      archiveFingerprint: 'b'.repeat(64),
      childIdMap: {},
      committedRoots: [],
      conflictedRoots: [],
      createdAt: 1,
      currentRoot: null,
      kind: 'archive-restore-session' as const,
      operationId: 'restore-v6',
      rootIdMap: {},
      skippedRoots: [],
      status: 'pending' as const,
      strategy: 'replace' as const,
      updatedAt: 1,
    };
    const harness = installMutationHarness(session);
    await expect(
      beginArchiveRestoreRoot(session.operationId, 'video-project:one')
    ).resolves.toMatchObject({
      currentRoot: 'video-project:one',
    });
    expect(harness.put).toHaveBeenCalled();

    installMutationHarness(session);
    await expect(completeArchiveRestoreSession(session.operationId)).resolves.toMatchObject({
      status: 'completed',
    });
    installMutationHarness(session);
    await expect(abortArchiveRestoreSession(session.operationId)).resolves.toMatchObject({
      status: 'aborted',
    });

    mocks.initDB.mockResolvedValue({
      get: vi.fn().mockResolvedValue(session),
      getAll: vi.fn().mockResolvedValue([session, operation, { malformed: true }]),
    });
    await expect(readArchiveRestoreSession(session.operationId)).resolves.toEqual(session);
    await expect(listArchiveRestoreSessions()).resolves.toEqual([session]);
  });
});

it.each(['obsolete', 'receipt'] as const)(
  'retains bytes needed by unresolved legacy rollback: %s',
  async (claim) => {
    const harness = installMutationHarness();
    const backup = {
      ...operation,
      obsoleteAssetIds: claim === 'obsolete' ? ['rollback-byte'] : [],
      compensations:
        claim === 'receipt'
          ? [
              {
                assetId: 'new-byte',
                journalId: 'legacy-ready',
                nextMediaId: 'legacy',
                nextOwnerId: 'legacy',
                previousRecords: { assetRefEntry: { assetId: 'rollback-byte' } },
              },
            ]
          : [],
    };
    harness.db.getAll.mockImplementation(async (store) =>
      store === 'asset_operations' ? [backup] : []
    );
    const intent = buildPhysicalDeleteOperation(['rollback-byte']);
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(harness.db.delete).not.toHaveBeenCalled();
  }
);

it('defers physical deletion when durable operation authority is invalid', async () => {
  const harness = installMutationHarness();
  harness.db.getAll.mockImplementation(async (store) =>
    store === 'asset_operations'
      ? [{ kind: 'backup-restore', obsoleteAssetIds: ['rollback-byte'] }]
      : []
  );
  const intent = buildPhysicalDeleteOperation(['rollback-byte']);
  await completePhysicalDeleteOperation(intent);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
  expect(harness.db.delete).not.toHaveBeenCalled();
});

it.each(['recording', 'invalid-source'] as const)(
  'retains physical intent when durable %s metadata remains without refs and owners',
  async (kind) => {
    const harness = installMutationHarness();
    const intent = buildPhysicalDeleteOperation(['shared']);
    harness.db.getAll.mockImplementation(async (store: string) =>
      store === 'recordings'
        ? [
            kind === 'recording'
              ? {
                  id: 'survivor',
                  assetId: 'shared',
                  createdAt: 1,
                  filename: 'r.webm',
                  mimeType: 'video/webm',
                  size: 3,
                }
              : { id: 'invalid', invalid: true },
          ]
        : []
    );
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(harness.db.delete).not.toHaveBeenCalled();
  }
);

it('reads retention once for an entire physical-delete operation', async () => {
  const { db } = installMutationHarness();
  await completePhysicalDeleteOperation(
    buildPhysicalDeleteOperation(Array.from({ length: 32 }, (_, i) => `asset-${i}`))
  );
  expect(db.getAll).toHaveBeenCalledTimes(13);
  expect(mocks.deleteObject).toHaveBeenCalledTimes(32);
});

it('retains the failing and unprocessed intents after a partial replay batch', async () => {
  const { db } = installMutationHarness();
  const intents = ['a', 'b', 'c'].map((id) => ({
    ...buildPhysicalDeleteOperation([id]),
    operationId: `delete-${id}`,
  }));
  mocks.deleteObject.mockImplementation(async (id: string) => {
    if (id === 'b') throw new Error('storage failure');
  });
  await expect(completePhysicalDeleteOperations(intents)).rejects.toThrow('storage failure');
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'delete-failed', counts: { deleted: 0, failed: 1 } })
  );
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'deleted', counts: { deleted: 1 } })
  );
  expect(db.getAll).toHaveBeenCalledTimes(13);
  expect(db.delete.mock.calls).toEqual([['asset_operations', 'delete-a']]);
  expect(mocks.deleteObject.mock.calls).toEqual([['a'], ['b']]);
});

it('does not scan for an empty replay batch', async () => {
  const { db } = installMutationHarness();
  await completePhysicalDeleteOperations([]);
  expect(db.getAll).not.toHaveBeenCalled();
  expect(db.delete).not.toHaveBeenCalled();
});

it('keeps busy logical-only retirement without scanning Library during an editor save', async () => {
  const { db } = installMutationHarness();
  const request = vi.fn(
    async (name: string, _options: unknown, action: (lock: unknown) => Promise<unknown>) =>
      action(name === 'sniptale:assets:resource-readers' ? null : {})
  );
  vi.stubGlobal('navigator', { locks: { request } });
  try {
    await completePhysicalDeleteOperation({
      ...buildPhysicalDeleteOperation([]),
      privateSources: [{ projectAssetId: 'held', expectedAssetId: 'bytes' }],
    });
    expect(db.getAll).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('retains physical-delete intent without scanning while an editor is open, then retries', async () => {
  const { db } = installMutationHarness();
  let readerOpen = true;
  const request = vi.fn(
    async (name: string, _options: unknown, action: (lock: unknown) => Promise<unknown>) =>
      action(name === 'sniptale:assets:resource-readers' && readerOpen ? null : {})
  );
  vi.stubGlobal('navigator', { locks: { request } });
  const intent = buildPhysicalDeleteOperation(['obsolete']);
  try {
    await completePhysicalDeleteOperation(intent);
    expect(db.getAll).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    readerOpen = false;
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith('obsolete');
    expect(db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps projected targets pending while completing unrelated intents in the same batch', async () => {
  const { db } = installMutationHarness();
  db.getAll.mockImplementation(async (store: string) =>
    store === 'recordings'
      ? [
          {
            id: 'retained',
            assetId: 'protected',
            createdAt: 1,
            filename: 'r.webm',
            mimeType: 'video/webm',
            size: 1,
          },
        ]
      : []
  );
  await completePhysicalDeleteOperations(
    ['protected', 'unowned'].map((id) => ({
      ...buildPhysicalDeleteOperation([id]),
      operationId: `delete-${id}`,
    }))
  );
  expect(db.getAll).toHaveBeenCalledTimes(13);
  expect(mocks.deleteObject.mock.calls).toEqual([['unowned']]);
  expect(db.delete.mock.calls).toEqual([['asset_operations', 'delete-unowned']]);
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'referenced', counts: { retained: 1 } })
  );
});

it.each(['complete', 'writing', 'cancel-before', 'cancel-after-intent'] as const)(
  'keeps orphan batch intent and physical effects ordered: %s',
  async (mode) => {
    const { db } = installMutationHarness();
    const controller = new AbortController();
    const put = vi.fn(async () => {
      if (mode === 'cancel-after-intent') controller.abort();
    });
    mocks.runMutation.mockImplementation(async (callback) => callback({ ...db, put }));
    if (mode === 'writing') mocks.writing.mockResolvedValue(['orphan']);
    if (mode === 'cancel-before') controller.abort();
    await runWithDurableAssetLifecycleLock((permit) =>
      deleteOrphanAssetObjectBatch(['orphan'], controller.signal, permit)
    );
    expect(put).toHaveBeenCalledTimes(
      mode === 'complete' || mode === 'cancel-after-intent' ? 1 : 0
    );
    expect(mocks.deleteObject).toHaveBeenCalledTimes(mode === 'complete' ? 1 : 0);
    expect(db.delete).toHaveBeenCalledTimes(mode === 'complete' ? 1 : 0);
  }
);

function publicationReleaseFixture() {
  let refuseIntent = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => refuseIntent && name === 'asset_operations'
  );
  const table = (name: string) => fixture.rows.get(name)!;
  const ref = {
    assetId: 'published-file',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/published-file' },
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
    size: 3,
  };
  const publication: PublishedCaptureOperation = {
    version: 1,
    kind: 'sync-operation',
    phase: 'published',
    key: '["change","operation"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 1,
    rootKind: 'media',
    rootId: 'old',
    rootKey: JSON.stringify(['space', 'media', 'old']),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    sourceSha256: 'b'.repeat(64),
    source: { changeKind: 'media', label: 'old.png' },
    publication: {
      kind: 'verified',
      acceptedAt: 2,
      preparedSha256: 'c'.repeat(64),
      attemptId: '11111111-1111-4111-8111-111111111111',
      recordKey: 'records/manifest.json',
      recordSha256: 'd'.repeat(64),
    },
    objects: [
      {
        objectId: 'body',
        ref,
        filename: 'old.png',
        sha256: 'a'.repeat(64),
        remoteKey: 'Files/published/old.png',
        pinned: true,
      },
    ],
  };
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  table('sync_capture').set(publication.key, publication);
  table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      spaceId: 'space',
      connectionGeneration: 3,
      profileCreatedAt: 1,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  });
  let intentNumber = 0;
  vi.mocked(crypto.randomUUID).mockImplementation(
    () => `00000000-0000-4000-8000-${String(++intentNumber).padStart(12, '0')}`
  );
  const database = {
    ...fixture.database,
    getAll: async (name: string) => structuredClone([...(fixture.rows.get(name)?.values() ?? [])]),
    delete: async (name: string, key: string) => {
      table(name).delete(key);
    },
  };
  mocks.initDB.mockResolvedValue(database);
  mocks.runMutation.mockImplementation(async (callback) => callback(database));
  return {
    ...fixture,
    table,
    publication,
    authorization,
    ref,
    refuseIntent(value: boolean) {
      refuseIntent = value;
    },
  };
}

it('verifies remote bytes before ownerless pin retirement and canonical deletion', async () => {
  const f = publicationReleaseFixture();
  const verify = vi.fn(async () => {
    expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  const released = await releasePublishedOperationPins(f.publication, f.authorization, verify);
  expect(verify).toHaveBeenCalledExactlyOnceWith(f.publication.objects[0]);
  expect(released.released).toEqual([f.ref.assetId]);
  expect(f.table('sync_capture').get(f.publication.key)).toMatchObject({
    phase: 'published',
    objects: [{ pinned: false, ref: f.ref }],
  });
  expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith(f.ref.assetId);
});

it('retires shared publication pins independently and retains bytes until the last claim leaves', async () => {
  const f = publicationReleaseFixture();
  const other: PublishedCaptureOperation = {
    ...f.publication,
    key: 'second',
    operationId: 'second',
    generation: 2,
  };
  f.table('sync_capture').set(other.key, other);
  const first = await releasePublishedOperationPins(
    f.publication,
    f.authorization,
    async () => undefined
  );
  expect(first.released).toEqual([f.ref.assetId]);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
  expect(f.table('asset_operations').size).toBe(1);
  await releasePublishedOperationPins(other, f.authorization, async () => undefined);
  expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith(f.ref.assetId);
});

it.each(['remote', 'native-owner', 'rollback', 'recreated', 'revoked'])(
  'preserves pins and bytes when publication release is refused by %s',
  async (kind) => {
    const f = publicationReleaseFixture();
    if (kind === 'native-owner') {
      f.table('asset_refs').set(f.ref.assetId, f.ref);
      f.table('asset_owners').set('native', {
        ownerKind: 'project-asset',
        ownerId: 'native',
        role: 'body',
        assetId: f.ref.assetId,
      });
    }
    if (kind === 'rollback')
      f.table('asset_operations').set('restore', {
        ...operation,
        operationId: 'restore',
        obsoleteAssetIds: [f.ref.assetId],
      });
    const verify = async () => {
      if (kind === 'remote') throw new Error('Remote digest mismatch.');
      if (kind === 'recreated')
        f.table('sync_capture').set(f.publication.key, {
          ...f.publication,
          sourceSha256: 'e'.repeat(64),
        });
      if (kind === 'revoked') f.table('sync_connection').delete('connection');
    };
    if (kind === 'native-owner' || kind === 'rollback')
      expect(
        (await releasePublishedOperationPins(f.publication, f.authorization, verify)).released
      ).toEqual([]);
    else
      await expect(
        releasePublishedOperationPins(f.publication, f.authorization, verify)
      ).rejects.toThrow();
    expect(f.table('sync_capture').get(f.publication.key)).toMatchObject({
      objects: [{ pinned: true }],
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  }
);

it('preserves publication pins when cancellation arrives after remote verification and before commit', async () => {
  const f = publicationReleaseFixture();
  const controller = new AbortController();
  await expect(
    releasePublishedOperationPins(
      f.publication,
      f.authorization,
      async () => {
        controller.abort();
      },
      controller.signal
    )
  ).rejects.toThrow();
  expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
  expect(f.table('asset_operations').size).toBe(0);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});

it('rolls pin removal back when delete-intent admission fails and permits exact retry', async () => {
  const f = publicationReleaseFixture();
  f.refuseIntent(true);
  await expect(
    releasePublishedOperationPins(f.publication, f.authorization, async () => undefined)
  ).rejects.toThrow('No space');
  expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
  expect(f.table('asset_operations').size).toBe(0);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
  f.refuseIntent(false);
  expect(
    (await releasePublishedOperationPins(f.publication, f.authorization, async () => undefined))
      .released
  ).toEqual([f.ref.assetId]);
});

it('retains the durable delete intent after physical deletion fails', async () => {
  const f = publicationReleaseFixture();
  mocks.deleteObject.mockRejectedValueOnce(new Error('Physical deletion failed.'));
  await expect(
    releasePublishedOperationPins(f.publication, f.authorization, async () => undefined)
  ).rejects.toThrow('Physical deletion failed');
  expect(f.table('sync_capture').get(f.publication.key)).toMatchObject({
    objects: [{ pinned: false }],
  });
  expect(f.table('asset_operations').size).toBe(1);
  const intent = [...f.table('asset_operations').values()][0];
  expect(intent).toMatchObject({ kind: 'physical-delete', assetIds: [f.ref.assetId] });
});

it('preserves pins while an editor resource reader prevents cleanup', async () => {
  const f = publicationReleaseFixture();
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: unknown,
        _options: unknown,
        operation: (lock: null) => Promise<unknown>
      ) => operation(null),
    },
  });
  expect(
    (await releasePublishedOperationPins(f.publication, f.authorization, async () => undefined))
      .released
  ).toEqual([]);
  expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
  expect(f.table('asset_operations').size).toBe(0);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});

it('keeps privacy erasure outside published pin retirement until physical cleanup finishes', async () => {
  const f = publicationReleaseFixture();
  let erasure: Promise<void> | undefined;
  mocks.deleteObject.mockImplementationOnce(async () => {
    expect(isPersistenceMutationTransitionHeld()).toBe(true);
    erasure = runWithPersistentDataErasureBarrier(async () => {
      expect(f.table('asset_operations').size).toBe(0);
      f.table('sync_capture').clear();
    });
  });
  await releasePublishedOperationPins(f.publication, f.authorization, async () => undefined);
  expect(erasure).toBeDefined();
  await erasure;
  expect(f.table('sync_capture').size).toBe(0);
  expect(isPersistenceMutationTransitionHeld()).toBe(false);
});
