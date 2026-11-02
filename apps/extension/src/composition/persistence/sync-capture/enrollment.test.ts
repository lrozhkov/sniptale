import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import {
  createVideoProjectEntry,
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { deferCheckpointInTransaction } from './checkpoints';
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

it('keeps uncaptured pending project ownership during initial discovery', async () => {
  const f = setup();
  f.table('media_library').clear();
  f.table('sync_capture').set('profile', { ...f.profile, checkpointIntervalMs: 300000 });
  const entry = createVideoProjectEntry({ id: 'pending-project', name: 'Latest local edits' });
  f.table('video_projects').set(entry.id, entry);
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Expected prepared enrollment database');
  const tx = db.transaction(['sync_capture'], 'readwrite');
  const pending = await deferCheckpointInTransaction(
    tx,
    { rootKind: 'video-project', rootId: entry.id },
    100
  );
  await tx.done;
  if (!pending) throw new Error('Expected pending project ownership');
  await discoverInitialSyncRoots(scope, authorization);
  expect(await discoverInitialSyncRoots(scope, authorization)).toMatchObject({
    captured: 0,
    existing: 1,
    refused: 0,
  });
  expect(f.table('sync_capture').get(pending.key)).toEqual(pending);
  expect(captures(f)).toHaveLength(0);
  expect(f.table('video_projects').get(entry.id)).toEqual(entry);
});

it('immediately captures a preexisting project during interval-enabled initial discovery', async () => {
  const f = setup();
  f.table('media_library').clear();
  f.table('sync_capture').set('profile', { ...f.profile, checkpointIntervalMs: 300000 });
  const entry = createVideoProjectEntry({
    id: 'preexisting-project',
    name: 'Existing local project',
  });
  f.table('video_projects').set(entry.id, entry);
  await discoverInitialSyncRoots(scope, authorization);
  expect(await discoverInitialSyncRoots(scope, authorization)).toMatchObject({
    captured: 1,
    refused: 0,
  });
  expect(captures(f)).toHaveLength(1);
  expect(captures(f)[0]).toMatchObject({
    rootId: entry.id,
    phase: 'native',
    change: { kind: 'video-project', rows: { project: entry } },
  });
  expect(
    [...f.table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(0);
});

it('preserves pending work created after initial root discovery and before capture', async () => {
  const f = setup();
  f.table('sync_capture').set('profile', { ...f.profile, checkpointIntervalMs: 300000 });
  const held = holdDiscovery(f);
  const discovery = discoverInitialSyncRoots(scope, authorization);
  await held.reached.promise;
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Expected prepared enrollment database');
  const tx = db.transaction(['sync_capture'], 'readwrite');
  const pending = await deferCheckpointInTransaction(
    tx,
    { rootKind: 'media', rootId: mediaId },
    100
  );
  await tx.done;
  if (!pending) throw new Error('Expected pending root');
  held.release.resolve();
  expect(await discovery).toMatchObject({ captured: 0, existing: 1, refused: 0 });
  expect(f.table('sync_capture').get(pending.key)).toEqual(pending);
  expect(captures(f)).toHaveLength(0);
  expect(f.table('media_library').get(mediaId)).toEqual(betaV1Fixture.records.media_library[0]);
});

it.each([false, true])(
  'enrolls imported Image source without changing original ownership, edited=%s',
  async (edited) => {
    const f = setup();
    f.table('media_library').clear();
    f.table('recordings').clear();
    for (const name of ['project_assets', 'image_workspaces', 'aggregate_presentations'])
      if (!f.rows.has(name)) f.rows.set(name, new Map());
    const ref = {
      assetId: 'enrolled-image',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/enrolled-image' },
      mimeType: 'image/png',
      size: 8,
      sha256: null,
    };
    const child = createProjectAssetEntry({
      id: 'enrolled-image-child',
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
    });
    const media = createMediaLibraryEntry({
      id: `project-asset:${child.id}`,
      kind: 'image',
      source: { kind: 'project-asset', projectAssetId: child.id },
      size: ref.size,
      mimeType: ref.mimeType,
      workspaceRevision: edited ? 2 : 0,
      imageContentState: edited ? 'edited' : 'original',
      lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
    });
    const owner = {
      assetId: ref.assetId,
      ownerKind: 'project-asset',
      ownerId: child.id,
      role: 'body',
    };
    f.table('media_library').set(media.id, media);
    f.table('project_assets').set(child.id, child);
    f.table('asset_refs').set(ref.assetId, ref);
    const ownerKey = JSON.stringify(['project-asset', child.id, 'body']);
    f.table('asset_owners').set(ownerKey, owner);
    const workspace = {
      aggregateId: media.id,
      revision: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceTitle: null,
      sourceUrl: null,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), ref.assetId),
    };
    if (edited) f.table('image_workspaces').set(media.id, workspace);
    expect(await discoverInitialSyncRoots(scope, authorization)).toMatchObject({
      captured: 1,
      refused: 0,
    });
    const captured = captures(f);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      rootId: media.id,
      change: {
        kind: edited ? 'image' : 'media',
        rows: {
          media,
          projectAsset: child,
          ...(edited ? { workspace, originalRef: ref } : { ref }),
        },
      },
    });
    expect(f.table('media_library').get(media.id)).toEqual(media);
    expect(f.table('project_assets').get(child.id)).toEqual(child);
    expect(f.table('asset_owners').get(ownerKey)).toEqual(owner);
    expect(f.table('asset_refs').get(ref.assetId)).toEqual(ref);
    expect(fetch).not.toHaveBeenCalled();
  }
);
