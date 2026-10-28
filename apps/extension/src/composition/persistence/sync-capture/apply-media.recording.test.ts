import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseSyncCaptureRecord } from './guards';
import { captureRootKey } from './contracts';
import { applyCatalogDeletionNative } from './apply-deletion';
import { applyPreparedMediaReplica, type ApplyPreparedMediaReplicaInput } from './apply-media';

const io = vi.hoisted(() => ({ database: vi.fn(), journals: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: vi.fn().mockResolvedValue(undefined),
  listReadyJournals: io.journals,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.journals.mockResolvedValue([]);
});

type RecordingInput = ApplyPreparedMediaReplicaInput & {
  rows: Extract<ApplyPreparedMediaReplicaInput['rows'], { recording: unknown }>;
};
function setup() {
  let failReceipt = false;
  let syncWrites = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && ++syncWrites === 2 && failReceipt
  );
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'received-recording',
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
    location: { kind: 'opfs' as const, objectKey: 'objects/received-recording' },
  };
  const recording = parseRecordingEntry({
    id: 'sync-recording',
    assetId: ref.assetId,
    createdAt: 1,
    filename: 'Saved.webm',
    mimeType: ref.mimeType,
    size: ref.size,
  });
  if (!recording) throw new Error('Invalid recording fixture.');
  const input: RecordingInput = {
    operationId: 'recording-operation',
    sourceDigest: 'a'.repeat(64),
    connectionGeneration: 3,
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    rows: {
      media: buildRecordingMediaEntry(recording),
      ref,
      recording,
      telemetry: {
        recordingId: recording.id,
        createdAt: 1,
        updatedAt: 2,
        captureMode: null,
        viewport: null,
        cursorTrack: null,
        actionEvents: [],
        signals: [],
      },
    },
  };
  const rootKey = captureRootKey(input.spaceId, 'media', input.rows.media.id);
  return {
    ...fixture,
    table,
    input,
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    failReceipt() {
      failReceipt = true;
      syncWrites = 0;
    },
    allowWrites() {
      failReceipt = false;
      syncWrites = 0;
    },
  };
}
function successor(input: RecordingInput): RecordingInput {
  return {
    ...structuredClone(input),
    operationId: `${input.operationId}-next`,
    sourceDigest: 'c'.repeat(64),
    expectedLocalGeneration: 1,
    expectedBasis: [input.operationId],
  };
}

it('publishes canonical recording, telemetry and receipt without recorder runtime state', async () => {
  const f = setup();
  await expect(applyPreparedMediaReplica(f.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  expect(f.table('recordings').get(f.input.rows.recording.id)).toEqual(f.input.rows.recording);
  expect(f.table('recording_telemetry').get(f.input.rows.recording.id)).toEqual(
    f.input.rows.telemetry
  );
  expect(
    f.table('asset_owners').get(JSON.stringify(['recording', f.input.rows.recording.id, 'body']))
  ).toMatchObject({ assetId: f.input.rows.ref.assetId, ownerKind: 'recording' });
  expect(f.table('recording_recovery_sessions').size).toBe(0);
  expect(
    [...f.table('sync_capture').values()].filter(
      (value) => parseSyncCaptureRecord(value)?.kind === 'sync-operation'
    )
  ).toEqual([]);
});

it('aborts recording and telemetry with the receipt and accepts exactly one retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failReceipt();
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.allowWrites();
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({ status: 'applied' });
  f.table('asset_refs').delete(f.input.rows.ref.assetId);
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({ status: 'duplicate' });
});

it('rechecks a delayed recording import after a competing native publication', async () => {
  const f = setup();
  let admit!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    admit = resolve;
  });
  io.database.mockImplementationOnce(async () => {
    entered();
    await gate;
    return f.database;
  });
  const first = applyPreparedMediaReplica(f.input);
  await ready;
  const other = await applyPreparedMediaReplica({ ...f.input, operationId: 'competing-operation' });
  const refused = expect(first).rejects.toThrow('source-changed');
  admit();
  await refused;
  expect(other).toMatchObject({ status: 'applied', generation: 1 });
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({ generation: 1 });
});

it('accepts explicit telemetry absence without changing the immutable original', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const next = successor(f.input);
  next.rows.telemetry = null;
  next.rows.media.filename = 'Renamed.webm';
  await applyPreparedMediaReplica(next);
  expect(f.table('recording_telemetry').has(f.input.rows.recording.id)).toBe(false);
  expect(f.table('asset_refs').get(f.input.rows.ref.assetId)).toEqual(f.input.rows.ref);
  expect(f.table('media_library').get(f.input.rows.media.id)).toMatchObject({
    filename: 'Renamed.webm',
  });
});

it.each(['recordings', 'recording_telemetry', 'recording_recovery_sessions', 'asset_owners'])(
  'refuses a foreign recording identity retained by %s',
  async (store) => {
    const f = setup();
    const id = f.input.rows.recording.id;
    const key = store === 'asset_owners' ? JSON.stringify(['recording', id, 'body']) : id;
    f.table(store).set(key, { id, retained: true });
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('source-changed');
    expect(f.rows).toEqual(before);
  }
);

it('preserves authoritative recovery blocks when replacing admitted canonical bytes', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const id = f.input.rows.recording.id;
  const session = { id, safetyCopy: true };
  const block = { id, index: 0, bytes: new Uint8Array([1, 2, 3]).buffer };
  f.table('recording_recovery_sessions').set(id, session);
  f.table('recording_recovery_blocks').set(JSON.stringify([id, 0]), block);
  const next = successor(f.input);
  next.rows.ref.assetId = next.rows.recording.assetId = 'replaced-recording';
  next.rows.ref.location.objectKey = 'objects/replaced-recording';
  await applyPreparedMediaReplica(next);
  expect(f.table('recording_recovery_sessions').get(id)).toEqual(session);
  expect(f.table('recording_recovery_blocks').get(JSON.stringify([id, 0]))).toEqual(block);
  expect(f.table('recordings').get(id)).toMatchObject({ assetId: 'replaced-recording' });
});

it('preserves the recording tombstone fence across purge and recreation', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  await applyCatalogDeletionNative({
    rootKind: 'media',
    rootId: f.input.rows.media.id,
    operationId: 'recording-delete',
    sourceDigest: 'd'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedLocalGeneration: 1,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: null,
  });
  const deleted = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(successor(f.input))).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(deleted);
  const restored = successor(f.input);
  restored.operationId = 'recording-restore';
  restored.expectedLocalGeneration = 2;
  restored.expectedBasis = ['recording-delete'];
  await expect(applyPreparedMediaReplica(restored)).resolves.toMatchObject({ generation: 3 });
});

it.each(['recordings', 'recording_telemetry'])(
  'refuses an absent recording tombstone with a retained %s row and accepts a clean retry',
  async (store) => {
    const f = setup();
    const id = f.input.rows.recording.id;
    f.table(store).set(id, { id, retained: true });
    const deletion = {
      rootKind: 'media' as const,
      rootId: f.input.rows.media.id,
      operationId: 'absent-recording-delete',
      sourceDigest: 'd'.repeat(64),
      spaceId: f.input.spaceId,
      profileCreatedAt: f.input.profileCreatedAt,
      connectionGeneration: f.input.connectionGeneration,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
    };
    const before = structuredClone(f.rows);
    await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow('Incoming deletion refused');
    expect(f.rows).toEqual(before);
    f.table(store).delete(id);
    await expect(applyCatalogDeletionNative(deletion)).resolves.toEqual({
      status: 'applied',
      generation: 1,
    });
    const completed = structuredClone(f.rows);
    await expect(applyCatalogDeletionNative(deletion)).resolves.toEqual({
      status: 'duplicate',
      generation: 1,
    });
    expect(f.rows).toEqual(completed);
  }
);

it('preserves recording and recovery when a native replacement journal retains the source', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const id = f.input.rows.recording.id;
  f.table('recording_recovery_sessions').set(id, { id, published: true });
  f.table('recording_recovery_blocks').set(JSON.stringify([id, 0]), {
    id,
    index: 0,
    bytes: new Uint8Array([1, 2, 3]).buffer,
  });
  const ready = {
    journalId: 'pending-recording-replacement',
    domain: 'recording-assets',
    createdAt: 1,
    assetRefs: [
      {
        ...f.input.rows.ref,
        assetId: 'pending-replacement',
        location: { kind: 'opfs', objectKey: 'objects/pending-replacement' },
      },
    ],
    payload: {
      completion: null,
      entries: [{ ...f.input.rows.recording, assetId: 'pending-replacement' }],
      expectedAssetIds: { [id]: f.input.rows.ref.assetId },
    },
  };
  f.table('asset_operations').set(ready.journalId, ready);
  io.journals.mockResolvedValue([ready]);
  const before = structuredClone(f.rows);
  await expect(
    applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: f.input.rows.media.id,
      operationId: 'recording-delete',
      sourceDigest: 'd'.repeat(64),
      spaceId: f.input.spaceId,
      profileCreatedAt: f.input.profileCreatedAt,
      connectionGeneration: f.input.connectionGeneration,
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedWorkspaceRevision: null,
    })
  ).rejects.toThrow('Incoming deletion refused');
  expect(f.rows).toEqual(before);
  expect(io.journals).toHaveBeenCalledOnce();
});
