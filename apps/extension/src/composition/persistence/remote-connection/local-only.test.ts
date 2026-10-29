import { initDB } from '../infrastructure/indexed-db/core';
import { createNativeCapture } from '../sync-capture/test-support/frozen-snapshot-database';
import {
  queueHash,
  parseSyncQueueOperation,
  queueOperationKey,
  parseSyncQueueConnection,
  queueConnectionKey,
} from '../sync-capture/queue-model';
// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { reference } from '../sync-capture/test-support/freeze';
import { completeSyncLocalOnly } from './local-only';
import { loadSyncConnection, checkSyncConnectionAdmission } from './store';
import type { SyncConnectionMetadata } from './model';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { captureRootKey } from '../sync-capture/contracts';
import { enqueueSyncQueueOperation, commandSyncQueueOperation } from '../sync-capture/queue';
const io = vi.hoisted(() => ({ db: vi.fn(), read: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
}));
const connection: SyncConnectionMetadata = {
  version: 1,
  kind: 'sync-connection',
  key: 'connection',
  binding: {
    provider: 'webdav',
    rootUrl: 'https://dav.test/root/',
    accountId: 'user',
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 1,
  },
  identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 2 },
  phase: 'paused',
  updateNonce: null,
  credentialId: '10000000-0000-4000-8000-000000000002',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _options: unknown, work: () => unknown) => work() },
  });
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false) => ({ lower, upper, lowerOpen }),
  });
  io.read.mockResolvedValue(new Blob([new Uint8Array(3)]));
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const data = createReviewWorkspaceStoreFixture(() => false);
  data.rows.clear();
  for (const name of EXPECTED_STORES) data.rows.set(name, new Map());
  let failClear = false;
  const db = {
    transaction(names: string[], mode: string) {
      const tx = data.database.transaction(names, mode);
      return {
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            clear: async () => {
              for (const key of await store.getAllKeys()) await store.delete(key);
              if (failClear && name === 'sync_capture')
                throw new DOMException('No space', 'QuotaExceededError');
            },
          };
        },
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
      };
    },
  };
  io.db.mockResolvedValue(db);
  const table = (name: string) => data.rows.get(name)!;
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  table('sync_connection').set('connection', structuredClone(connection));
  table('sync_connection').set('credential', {
    key: 'credential',
    encrypted: 'synthetic-opaque-envelope',
  });
  const ref = reference('original', 'image/png', 3);
  const media = createMediaLibraryEntry({
    id: 'image',
    source: { kind: 'stored-asset', assetId: ref.assetId },
    kind: 'image',
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  table('asset_refs').set(ref.assetId, ref);
  table('media_library').set(media.id, media);
  table('asset_owners').set(JSON.stringify(['media-library', media.id, 'source']), {
    ownerKind: 'media-library',
    ownerId: media.id,
    role: 'source',
    assetId: ref.assetId,
  });
  table('asset_residency').set('settings', {
    version: 1,
    kind: 'settings',
    id: 'settings',
    revision: 0,
    budgetBytes: 1024,
  });
  return {
    ...data,
    table,
    db,
    media,
    ref,
    failClear: (value = true) => {
      failClear = value;
    },
  };
}
it('retires connection, credentials and protocol stores while preserving every native row and file', async () => {
  const f = fixture();
  const native = ['media_library', 'asset_refs', 'asset_owners'];
  const before = native.map((name) => structuredClone([...f.table(name)]));
  await completeSyncLocalOnly(connection);
  expect(await loadSyncConnection()).toBeNull();
  expect(f.table('sync_connection').size).toBe(0);
  expect(f.table('sync_capture').size).toBe(0);
  expect(f.table('sync_outbox').size).toBe(0);
  expect(native.map((name) => [...f.table(name)])).toEqual(before);
  expect(f.table('asset_residency').has('settings')).toBe(true);
  expect(io.read).toHaveBeenCalledExactlyOnceWith(f.ref, f.ref.assetId);
  const tx = (await initDB()).transaction(['sync_capture', 'sync_connection'], 'readonly');
  await expect(
    checkSyncConnectionAdmission(tx, connection.binding, connection.identity)
  ).rejects.toThrow();
});
it('refuses missing originals without discarding their recovery authority', async () => {
  const f = fixture();
  io.read.mockRejectedValueOnce(new DOMException('Absent', 'NotFoundError'));
  await expect(completeSyncLocalOnly(connection)).rejects.toMatchObject({ code: 'missing-bytes' });
  expect(await loadSyncConnection()).toEqual(connection);
  expect(f.table('sync_connection').has('credential')).toBe(true);
});
it('refuses a new native file reference committed during physical verification', async () => {
  const f = fixture();
  io.read.mockImplementationOnce(async () => {
    f.table('asset_refs').set('late', reference('late', 'image/png', 3));
    return new Blob([new Uint8Array(3)]);
  });
  await expect(completeSyncLocalOnly(connection)).rejects.toMatchObject({ code: 'local-changed' });
  expect(await loadSyncConnection()).toEqual(connection);
  expect(f.table('asset_refs').has('late')).toBe(true);
});
it('refuses an unloaded inline source introduced after the first snapshot', async () => {
  const f = fixture();
  io.read.mockImplementationOnce(async () => {
    f.table('media_library').set(
      'late-inline',
      createMediaLibraryEntry({
        id: 'late-inline',
        kind: 'screenshot',
        source: { kind: 'screenshot' },
        mimeType: 'image/png',
        size: 3,
      })
    );
    return new Blob([new Uint8Array(3)]);
  });
  await expect(completeSyncLocalOnly(connection)).rejects.toMatchObject({ code: 'missing-bytes' });
  expect(await loadSyncConnection()).toEqual(connection);
});
it('rolls back credentials, profile and queue together when a final mutation fails, then retries', async () => {
  const f = fixture();
  f.failClear();
  await expect(completeSyncLocalOnly(connection)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(await loadSyncConnection()).toEqual(connection);
  expect(f.table('sync_capture').has('profile')).toBe(true);
  expect(f.table('sync_connection').has('credential')).toBe(true);
  f.failClear(false);
  await completeSyncLocalOnly(connection);
  expect(await loadSyncConnection()).toBeNull();
});
it('refuses a changed connection after bytes were checked', async () => {
  const f = fixture();
  io.read.mockImplementationOnce(async () => {
    f.table('sync_connection').set('connection', {
      ...connection,
      identity: { ...connection.identity, revision: 3 },
    });
    return new Blob([new Uint8Array(3)]);
  });
  await expect(completeSyncLocalOnly(connection)).rejects.toThrow('refused');
  expect(f.table('sync_connection').has('credential')).toBe(true);
  expect(f.table('sync_capture').has('profile')).toBe(true);
});

function captured() {
  const capture = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","pending"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: 'root',
    rootKey: captureRootKey('space', 'media', 'root'),
    generation: 1,
    operationId: 'pending',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'tombstone' },
  });
  expect(parseSyncCaptureRecord(capture)).not.toBeNull();
  return capture;
}
it.each(['queued', 'unknown', 'cancelled'] as const)(
  'handles a %s outgoing operation without silently redirecting it',
  async (mode) => {
    const f = fixture();
    const capture = captured();
    f.table('sync_capture').set(capture.key, capture);
    const queued = await enqueueSyncQueueOperation(capture);
    if (mode === 'cancelled')
      await commandSyncQueueOperation(
        connection.binding,
        capture.operationId,
        queued.revision,
        'cancel'
      );
    if (mode === 'unknown') {
      const key = queueOperationKey(connection.binding, capture.operationId);
      const row = f.table('sync_outbox').get(key);
      if (typeof row !== 'object' || row === null) throw new Error('Queue fixture missing.');
      f.table('sync_outbox').set(key, {
        ...row,
        status: 'interrupted',
        stage: 'writing',
        outcome: 'unknown',
        writeStarted: true,
        failureCode: 'interrupted',
      });
    }
    if (mode === 'cancelled') {
      await completeSyncLocalOnly(connection);
      expect(await loadSyncConnection()).toBeNull();
      expect(f.table('asset_refs').has(f.ref.assetId)).toBe(true);
    } else {
      await expect(completeSyncLocalOnly(connection)).rejects.toMatchObject({
        code: 'pending-outgoing',
      });
      expect(await loadSyncConnection()).toEqual(connection);
      expect(f.table('sync_capture').has(capture.key)).toBe(true);
    }
  }
);
it('retires completed compact publication facts without removing native originals', async () => {
  const f = fixture();
  const native = captured();
  const { change: _change, ...header } = native;
  const published = {
    ...header,
    phase: 'published',
    objects: [],
    publication: {
      kind: 'verified',
      acceptedAt: 3,
      preparedSha256: 'a'.repeat(64),
      attemptId: '10000000-0000-4000-8000-000000000001',
      recordKey: 'Changes/committed.json',
      recordSha256: 'b'.repeat(64),
    },
  };
  expect(parseSyncCaptureRecord(published)).not.toBeNull();
  f.table('sync_capture').set(published.key, published);
  await completeSyncLocalOnly(connection);
  expect(f.table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
  expect(f.table('sync_capture').size).toBe(0);
});
it('a new connection cannot make an old identity admissible after retirement', async () => {
  const f = fixture();
  await completeSyncLocalOnly(connection);
  const replacement = {
    ...connection,
    phase: 'active',
    identity: { incarnation: '20000000-0000-4000-8000-000000000001', revision: 1 },
    binding: { ...connection.binding, spaceId: 'replacement', profileCreatedAt: 5 },
  };
  f.table('sync_connection').set('connection', replacement);
  f.table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    spaceId: 'replacement',
    createdAt: 5,
    connectionGeneration: 1,
  });
  const tx = (await initDB()).transaction(['sync_capture', 'sync_connection'], 'readonly');
  await expect(
    checkSyncConnectionAdmission(tx, connection.binding, connection.identity)
  ).rejects.toThrow();
  expect(await checkSyncConnectionAdmission(tx, replacement.binding, replacement.identity)).toEqual(
    replacement
  );
});

it.each(['delivered', 'late-transition'] as const)(
  'reports exact final history progress: %s',
  async (mode) => {
    const f = fixture();
    const capture = captured();
    f.table('sync_capture').set(capture.key, capture);
    const queued = await enqueueSyncQueueOperation(capture);
    const cancelled = await commandSyncQueueOperation(
      connection.binding,
      capture.operationId,
      queued.revision,
      'cancel'
    );
    const parsed = parseSyncQueueOperation(cancelled);
    if (!parsed) throw new Error('Queue fixture is invalid.');
    const queueConnection = parseSyncQueueConnection(
      f.table('sync_outbox').get(queueConnectionKey(connection.binding))
    );
    if (!queueConnection) throw new Error('Connection history fixture is invalid.');
    const connectionRef = queueHash(queueConnection.key);
    const connectionCursorKey = JSON.stringify(['queue-history-delivery-v1', connectionRef]);
    f.table('sync_outbox').set(connectionCursorKey, {
      version: 1,
      kind: 'queue-history-delivery',
      key: connectionCursorKey,
      sourceRef: connectionRef,
      deliveredSequence: queueConnection.eventSequence,
    });
    const sourceRef = queueHash(queueOperationKey(connection.binding, capture.operationId));
    const key = JSON.stringify(['queue-history-delivery-v1', sourceRef]);
    f.table('sync_outbox').set(key, {
      version: 1,
      kind: 'queue-history-delivery',
      key,
      sourceRef,
      deliveredSequence: mode === 'delivered' ? parsed.eventSequence : queued.eventSequence,
    });
    await expect(completeSyncLocalOnly(connection)).resolves.toBe(
      mode === 'delivered' ? 'delivered' : 'incomplete'
    );
    expect(await loadSyncConnection()).toBeNull();
    expect(f.table('asset_refs').has(f.ref.assetId)).toBe(true);
  }
);
