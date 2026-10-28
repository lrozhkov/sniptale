import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { captureMediaInTransaction } from './capture';
import { captureRootKey } from './contracts';
import { discoverInitialSyncRoots } from './enrollment';
import { parseSyncCaptureRecord } from './guards';
import { parseSyncQueueConnection, queueConnectionKey } from './queue-model';
import {
  authorization,
  scope,
  deferred,
  createReconciliationFixture,
  installReconciliationKeyRanges,
} from './queue-reconciliation.test-support';

const io = vi.hoisted(() => ({ prepared: vi.fn(), initialize: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
  initDB: io.initialize,
}));

type Fixture = ReturnType<typeof createReconciliationFixture>;
const mediaId = 'recording:beta-v1-recording';
function setup() {
  const f = createReconciliationFixture();
  for (const name of [
    'web_snapshots',
    'scenario_projects',
    'scenario_versions',
    'scenario_resources',
  ])
    if (!f.rows.has(name)) f.rows.set(name, new Map());
  const ref = structuredClone(betaV1Fixture.records.asset_refs[0]);
  const owner = structuredClone(betaV1Fixture.records.asset_owners[0]);
  f.table('asset_refs').set(ref.assetId, ref);
  f.table('asset_owners').set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  io.prepared.mockReturnValue(f.database);
  io.initialize.mockResolvedValue(f.database);
  return f;
}
function captures(f: Fixture) {
  return [...f.table('sync_capture').values()].flatMap((value) => {
    const row = parseSyncCaptureRecord(value);
    return row?.kind === 'sync-operation' ? [row] : [];
  });
}
function progress(f: Fixture) {
  return parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))
    ?.enrollmentProgress;
}
function seedRecording(f: Fixture, id: string) {
  const recording = { ...structuredClone(betaV1Fixture.records.recordings[0]), id };
  const media = {
    ...structuredClone(betaV1Fixture.records.media_library[0]),
    id: `recording:${id}`,
    source: { kind: 'recording', recordingId: id },
  };
  const owner = { ...structuredClone(betaV1Fixture.records.asset_owners[0]), ownerId: id };
  f.table('recordings').set(id, recording);
  f.table('media_library').set(media.id, media);
  f.table('asset_owners').set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  return media.id;
}
async function captureNative(f: Fixture, id: string) {
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Missing prepared fixture database');
  const tx = db.transaction([...f.rows.keys()], 'readwrite');
  const result = await captureMediaInTransaction(tx, id);
  await tx.done;
  return result;
}
function holdDiscovery(f: Fixture) {
  const reached = deferred();
  const release = deferred();
  const transaction = f.database.transaction.bind(f.database);
  let held = false;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = transaction(stores, mode);
    if (mode !== 'readonly' || held) return tx;
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'media_library' && !held) {
        held = true;
        const getAllKeys = store.getAllKeys;
        vi.spyOn(store, 'getAllKeys').mockImplementation(async (query, count) => {
          const keys = await getAllKeys(query, count);
          reached.resolve();
          await release.promise;
          return keys;
        });
      }
      return store;
    });
    return tx;
  });
  return { reached, release };
}
beforeEach(() => {
  vi.clearAllMocks();
  installReconciliationKeyRanges();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network');
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('captures a saved native root that predates enrollment through the real capture owner', async () => {
  const f = setup();
  const source = structuredClone(f.table('media_library'));
  expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
    captured: 1,
    existing: 0,
    refused: 0,
    remaining: true,
  });
  expect(captures(f)).toHaveLength(1);
  expect(captures(f)[0]).toMatchObject({
    rootKind: 'media',
    rootId: mediaId,
    generation: 1,
    basis: [],
    phase: 'native',
    change: { kind: 'media', rows: { recording: { id: 'beta-v1-recording' } } },
  });
  expect(f.table('media_library')).toEqual(source);
  expect(io.initialize).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('resumes bounded native pages after a worker restart and completes empty source families once', async () => {
  const f = setup();
  f.table('media_library').clear();
  for (let index = 0; index < 70; index++)
    seedRecording(f, `enroll-${String(index).padStart(3, '0')}`);
  expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
    captured: 64,
    existing: 0,
    refused: 0,
    remaining: true,
  });
  expect(progress(f)).toEqual({
    authorization,
    revision: 1,
    source: 'media',
    afterKey: 'recording:enroll-063',
  });
  const accepted = structuredClone(captures(f));
  const replacement = setup();
  replacement.rows.clear();
  for (const [name, rows] of structuredClone(f.rows)) replacement.rows.set(name, rows);
  expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
    captured: 6,
    existing: 0,
    refused: 0,
    remaining: true,
  });
  expect(captures(replacement)).toHaveLength(70);
  for (const row of accepted) expect(replacement.table('sync_capture').get(row.key)).toEqual(row);
  for (let index = 0; index < 3; index++) await discoverInitialSyncRoots(scope, authorization);
  expect(progress(replacement)).toMatchObject({ source: 'complete', afterKey: null });
  const complete = structuredClone(replacement.rows);
  expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
    captured: 0,
    existing: 0,
    refused: 0,
    remaining: false,
  });
  expect(replacement.rows).toEqual(complete);
});

it('does not duplicate a native write accepted after discovery and before initial capture', async () => {
  const f = setup();
  const hold = holdDiscovery(f);
  const pending = discoverInitialSyncRoots(scope, authorization);
  await hold.reached.promise;
  const accepted = await captureNative(f, mediaId);
  const before = structuredClone(f.table('sync_capture'));
  hold.release.resolve();
  expect(await pending).toEqual({ captured: 0, existing: 1, refused: 0, remaining: true });
  expect(captures(f)).toHaveLength(1);
  expect(f.table('sync_capture')).toEqual(before);
  expect(captures(f)[0]?.operationId).toBe(accepted?.operationId);
});

it('does not recreate a native root deleted after discovery', async () => {
  const f = setup();
  const hold = holdDiscovery(f);
  const pending = discoverInitialSyncRoots(scope, authorization);
  await hold.reached.promise;
  f.table('media_library').delete(mediaId);
  hold.release.resolve();
  expect(await pending).toEqual({ captured: 0, existing: 1, refused: 0, remaining: true });
  expect(captures(f)).toHaveLength(0);
  expect(f.table('media_library').has(mediaId)).toBe(false);
});

it.each([true, false])(
  'preserves retained root state through tombstone or recreation: deleted=%s',
  async (deleted) => {
    const f = setup();
    const rootKey = captureRootKey(scope.spaceId, 'media', mediaId);
    const key = JSON.stringify(['root-state', rootKey]);
    const state = {
      version: 1,
      kind: 'root-state',
      key,
      createdAt: 1,
      spaceId: scope.spaceId,
      rootKind: 'media',
      rootId: mediaId,
      rootKey,
      generation: 7,
      basis: ['33333333-3333-4333-8333-333333333333'],
      ...(deleted ? { deleted: true } : {}),
    };
    expect(parseSyncCaptureRecord(state)).not.toBeNull();
    f.table('sync_capture').set(key, state);
    expect(await discoverInitialSyncRoots(scope, authorization)).toMatchObject({
      captured: 0,
      existing: 1,
    });
    expect(f.table('sync_capture').get(key)).toEqual(state);
    expect(captures(f)).toHaveLength(0);
  }
);

it.each(['authorization', 'paused', 'profile'] as const)(
  'refuses late %s changes without advancing enrollment or duplicating accepted captures',
  async (kind) => {
    const f = setup();
    f.table('media_library').clear();
    seedRecording(f, 'first');
    seedRecording(f, 'second');
    const transaction = f.database.transaction.bind(f.database);
    let writes = 0;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && ++writes === 2) {
        if (kind === 'authorization')
          f.table('sync_connection').set('connection', {
            ...f.connection,
            identity: { ...authorization, revision: 2 },
          });
        if (kind === 'paused')
          f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
        if (kind === 'profile')
          f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
      }
      return transaction(stores, mode);
    });
    await expect(discoverInitialSyncRoots(scope, authorization)).rejects.toThrow();
    expect(captures(f)).toHaveLength(1);
    expect(captures(f)[0]?.rootId).toBe('recording:first');
    expect(progress(f)).toBeUndefined();
    const accepted = structuredClone(captures(f)[0]);
    f.table('sync_connection').set('connection', f.connection);
    f.table('sync_capture').set('profile', f.profile);
    expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
      captured: 1,
      existing: 1,
      refused: 0,
      remaining: true,
    });
    expect(captures(f)).toHaveLength(2);
    expect(f.table('sync_capture').get(accepted!.key)).toEqual(accepted);
  }
);

it('preserves completed native captures when the final enrollment cursor write exceeds quota', async () => {
  const f = setup();
  f.failNextProgressWrite();
  await expect(discoverInitialSyncRoots(scope, authorization)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(progress(f)).toBeUndefined();
  const accepted = structuredClone(captures(f));
  expect(accepted).toHaveLength(1);
  expect(await discoverInitialSyncRoots(scope, authorization)).toEqual({
    captured: 0,
    existing: 1,
    refused: 0,
    remaining: true,
  });
  expect(captures(f)).toEqual(accepted);
});

it('keeps legacy queue connections valid without synthesizing enrollment progress', async () => {
  const f = setup();
  await discoverInitialSyncRoots(scope, authorization);
  const row = parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))!;
  const { enrollmentProgress: ignored, ...legacy } = row;
  void ignored;
  expect(parseSyncQueueConnection(legacy)).toEqual(legacy);
  expect(Object.hasOwn(parseSyncQueueConnection(legacy)!, 'enrollmentProgress')).toBe(false);
});

it.each([
  null,
  undefined,
  {},
  { authorization, revision: 0, source: 'media', afterKey: null },
  { authorization, revision: Number.MAX_SAFE_INTEGER + 1, source: 'media', afterKey: null },
  { authorization: {}, revision: 1, source: 'media', afterKey: null },
  { authorization, revision: 1, source: 'unknown', afterKey: null },
  { authorization, revision: 1, source: 'media', afterKey: {} },
  { authorization, revision: 1, source: 'media', afterKey: NaN },
  { authorization, revision: 1, source: 'complete', afterKey: 'must-be-null' },
])(
  'refuses malformed enrollment continuation without repairing evidence: %j',
  async (enrollmentProgress) => {
    const f = setup();
    await discoverInitialSyncRoots(scope, authorization);
    const row = parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))!;
    const invalid = { ...row, enrollmentProgress };
    expect(parseSyncQueueConnection(invalid)).toBeNull();
    f.table('sync_outbox').set(row.key, invalid);
    const before = structuredClone(f.rows);
    await expect(discoverInitialSyncRoots(scope, authorization)).rejects.toThrow(
      'Invalid sync queue connection'
    );
    expect(f.rows).toEqual(before);
  }
);
