import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../features/video/project/recording-events/blocks';
import { createRecordingEventsStore } from './recording-events/store';
import { RECORDING_EVENTS_SNAPSHOT_ROLE } from './recording-events/contracts';
import * as eventsSnapshots from './recording-events/snapshot';
import { deleteMediaAssetWithProjectCascade } from '../media-library/delete-cascade';
import { collectDurableAssetSnapshot } from '../assets/retention-authority';
import * as captureOwner from '../sync-capture/capture';
import { recoverStandaloneAssetPublications } from '../assets/recovery';
import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCursorTrajectoryBlockPacker } from '../../../features/video/project/cursor-trajectory/blocks';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_TELEMETRY_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_EVENTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  SYNC_CAPTURE_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { createHarness } from '../assets/opfs-store.test-support';
import {
  readAssetFile,
  listReadyJournals,
  listAssetObjectIds,
  isAssetReadyProtected,
} from '../assets/opfs-store';
import type { AssetReadyJournal } from '../assets/contracts';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { collectSyncCaptureClaims } from '../sync-capture/claims';
import { createRecordingCursorTrajectoryStore } from './cursor-trajectory/store';
import { RECORDING_CURSOR_SNAPSHOT_ROLE } from './cursor-trajectory/contracts';
import {
  saveRecordingTelemetry,
  getRecordingTelemetry,
  deleteRecordingTelemetry,
  recordingCursorTrajectoryPublicationAdapter,
} from './telemetry';
import { parseRecordingTelemetryEntry } from './telemetry.guards';
import type { RecordingTelemetryEntry } from './contracts';

const hooks = vi.hoisted(() => ({ ready: vi.fn<(journal: AssetReadyJournal) => Promise<void>>() }));
let database: IDBPDatabase | null = null;
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => {
    if (!database) throw new Error('Database not admitted.');
    return database;
  },
}));
vi.mock('../assets', async (original) => {
  const actual = await original<typeof import('../assets')>();
  return {
    ...actual,
    createAssetPublicationJournal: async (
      ...args: Parameters<typeof actual.createAssetPublicationJournal>
    ) => {
      const journal = await actual.createAssetPublicationJournal(...args);
      if (
        !(
          typeof journal.payload === 'object' &&
          journal.payload !== null &&
          'phase' in journal.payload &&
          journal.payload.phase === 'prepare'
        )
      )
        await hooks.ready(journal);
      return journal;
    },
  };
});

let sequence = 0;
const databases: { name: string; db: IDBPDatabase }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  hooks.ready.mockResolvedValue(undefined);
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  installPersistenceLockManagerForTests(null);
  database = null;
  for (const { db, name } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});

async function fixture() {
  const name = `telemetry-snapshot-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  database = db;
  databases.push({ db, name });
  const harness = createHarness();
  vi.stubGlobal('navigator', {
    storage: { getDirectory: harness.options.getOriginRoot },
    locks: {
      request: async (
        name: string,
        _options: unknown,
        callback: (lock: { name: string }) => Promise<unknown>
      ) => callback({ name }),
    },
  });
  const identity = { recordingId: 'snapshot-recording', trajectoryId: 'a'.repeat(32) };
  const geometry = { width: 160, height: 90 };
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const writer = await store.begin(identity, geometry);
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = [];
  blocks.push(
    ...packer.append({
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      ...geometry,
      reason: 'start',
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    })
  );
  blocks.push(
    ...packer.append({
      kind: 'sample',
      segmentId: 0,
      observationSeq: 0,
      activeTimeUs: 1000,
      xQ8: 256,
      yQ8: 512,
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    })
  );
  blocks.push(
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 2000, reason: 'stop' })
  );
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, packer.summary(), 'complete');
  const entry: RecordingTelemetryEntry = {
    recordingId: identity.recordingId,
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    cursorTrajectory: {
      format: 'cursor-trajectory-v1',
      formatVersion: 1,
      algorithm: 'sed-window-v1',
      encoding: 'json-ascii-int-v1',
      trajectoryId: identity.trajectoryId,
      state: 'complete',
      finalized: true,
      ...packer.summary(),
    },
  };
  const bodyRef = {
    assetId: 'source-video',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source-video' },
    mimeType: 'video/webm',
    size: 5,
    sha256: null,
  };
  await db.put(STORE_NAME, {
    id: identity.recordingId,
    assetId: bodyRef.assetId,
    createdAt: 1,
    filename: 'source.webm',
    mimeType: bodyRef.mimeType,
    size: 5,
  });
  await db.put(ASSET_REFS_STORE, bodyRef);
  await db.put(ASSET_OWNERS_STORE, {
    ownerKind: 'recording',
    ownerId: identity.recordingId,
    role: 'body',
    assetId: bodyRef.assetId,
  });
  await db.put(
    MEDIA_LIBRARY_STORE,
    createMediaLibraryEntry({
      id: `recording:${identity.recordingId}`,
      kind: 'recording',
      source: { kind: 'recording', recordingId: identity.recordingId },
      filename: 'source.webm',
      originalFilename: 'source.webm',
      mimeType: bodyRef.mimeType,
      size: 5,
      ...geometry,
    })
  );
  await db.put(SYNC_CAPTURE_STORE, {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'snapshot-space',
    connectionGeneration: 1,
  });
  return { db, store, identity, writer, entry, blocks, geometry, harness };
}

async function captures(db: IDBPDatabase) {
  return (await db.getAll(SYNC_CAPTURE_STORE))
    .map(parseSyncCaptureRecord)
    .filter((row) => row?.kind === 'sync-operation');
}

it('atomically publishes the snapshot owner, source facts and exact frozen capture', async () => {
  const { db, entry, identity } = await fixture();
  await saveRecordingTelemetry(entry);
  const saved = await getRecordingTelemetry(identity.recordingId);
  const snapshot = saved?.cursorTrajectorySnapshot;
  if (!snapshot) throw new Error('Snapshot was not published.');
  expect(snapshot.ref.sha256).toBe(entry.cursorTrajectory?.streamSha256);
  const authority = await collectDurableAssetSnapshot(db);
  expect(authority.authorityValid).toBe(true);
  expect(authority.expectedOwners).toContainEqual({
    ownerKind: 'recording',
    ownerId: identity.recordingId,
    role: RECORDING_CURSOR_SNAPSHOT_ROLE,
    assetId: snapshot.ref.assetId,
  });
  expect(
    (
      await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [
        identity.recordingId,
        identity.trajectoryId,
      ])
    )?.snapshotAssetId
  ).toBe(snapshot.ref.assetId);
  expect(
    await db.get(ASSET_OWNERS_STORE, [
      'recording',
      identity.recordingId,
      RECORDING_CURSOR_SNAPSHOT_ROLE,
    ])
  ).toMatchObject({ assetId: snapshot.ref.assetId });
  const frozen = await captures(db);
  expect(frozen).toHaveLength(1);
  expect(collectSyncCaptureClaims(frozen).assetIds).toEqual(
    new Set(['source-video', snapshot.ref.assetId])
  );
  expect(await listReadyJournals()).toEqual([]);
  expect(isAssetReadyProtected(snapshot.ref.assetId)).toBe(false);
  expect((await readAssetFile(snapshot.ref, 'cursor.bin')).size).toBe(snapshot.ref.size);
  await saveRecordingTelemetry({ ...entry, updatedAt: 3 });
  expect(hooks.ready).toHaveBeenCalledOnce();
  expect(
    (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot?.ref.assetId
  ).toBe(snapshot.ref.assetId);
});

it('replays an owned journal without overwriting newer source facts or duplicating captures', async () => {
  const { db, entry, identity } = await fixture();
  const journals: AssetReadyJournal[] = [];
  hooks.ready.mockImplementation(async (journal) => {
    journals.push(journal);
  });
  await saveRecordingTelemetry(entry);
  await saveRecordingTelemetry({
    ...entry,
    updatedAt: 5,
    actionEvents: [
      {
        id: 'latest-click',
        kind: 'CLICK',
        time: 0.001,
        duration: 0,
        point: null,
        label: '',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  const journal = journals[0];
  if (!journal) throw new Error('Journal is missing.');
  await recordingCursorTrajectoryPublicationAdapter.publish(journal);
  expect(
    (await getRecordingTelemetry(identity.recordingId))?.actionEvents.map((action) => action.id)
  ).toEqual(['latest-click']);
  expect((await getRecordingTelemetry(identity.recordingId))?.updatedAt).toBe(5);
  expect(await captures(db)).toHaveLength(2);
});

it.each(['delete', 'restore', 'metadata'] as const)(
  'refuses delayed publication after %s and permits a fresh retry',
  async (change) => {
    const { db, store, identity, entry, geometry, blocks } = await fixture();
    hooks.ready.mockImplementationOnce(async () => {
      if (change === 'metadata') {
        await db.put(RECORDING_TELEMETRY_STORE, {
          ...entry,
          cursorTrajectory: undefined,
          updatedAt: 9,
        });
        return;
      }
      await deleteRecordingTelemetry(identity.recordingId);
      if (change === 'restore') {
        const replacement = await store.restore(identity, geometry);
        for (const block of blocks) await store.append(replacement, block);
        await store.finalize(
          replacement,
          { ...entry.cursorTrajectory!, totalSamples: 1 },
          'complete'
        );
      }
    });
    await expect(saveRecordingTelemetry(entry)).rejects.toMatchObject({
      name: 'SupersededAssetPublicationError',
    });
    expect(
      await db.get(ASSET_OWNERS_STORE, [
        'recording',
        identity.recordingId,
        RECORDING_CURSOR_SNAPSHOT_ROLE,
      ])
    ).toBeUndefined();
    expect(await listReadyJournals()).toEqual([]);
    expect(await listAssetObjectIds()).toEqual([]);
    if (change === 'delete') {
      expect(await store.getHead(identity)).toBeNull();
      expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
    } else {
      if (change === 'metadata')
        expect((await getRecordingTelemetry(identity.recordingId))?.updatedAt).toBe(9);
      await saveRecordingTelemetry({ ...entry, updatedAt: 10 });
      expect(
        (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot
      ).toBeDefined();
    }
  }
);

it('refuses one competing preparation and preserves the current owner and facts on retry', async () => {
  const { db, entry, identity } = await fixture();
  const journals: AssetReadyJournal[] = [];
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  hooks.ready.mockImplementation(async (journal) => {
    journals.push(journal);
    if (journals.length === 2) ready.resolve();
    await release.promise;
  });
  const first = saveRecordingTelemetry(entry);
  const second = saveRecordingTelemetry({ ...entry, updatedAt: 3 });
  const results = Promise.allSettled([first, second]);
  await ready.promise;
  const accepted = journals[0];
  if (!accepted) throw new Error('Journal is missing.');
  await recordingCursorTrajectoryPublicationAdapter.publish(accepted);
  release.resolve();
  const settled = await results;
  expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const snapshot = (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot;
  if (!snapshot) throw new Error('Accepted snapshot is missing.');
  await saveRecordingTelemetry({ ...entry, updatedAt: 8 });
  expect((await getRecordingTelemetry(identity.recordingId))?.updatedAt).toBe(8);
  expect(
    (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot?.ref.assetId
  ).toBe(snapshot.ref.assetId);
  expect(
    await db.get(ASSET_OWNERS_STORE, [
      'recording',
      identity.recordingId,
      RECORDING_CURSOR_SNAPSHOT_ROLE,
    ])
  ).toMatchObject({ assetId: snapshot.ref.assetId });
  expect(await listAssetObjectIds()).toEqual([snapshot.ref.assetId]);
});

it('releases live history on telemetry deletion while retaining its frozen transfer bytes', async () => {
  const { db, store, identity, entry } = await fixture();
  await saveRecordingTelemetry(entry);
  const snapshot = (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot;
  if (!snapshot) throw new Error('Snapshot is missing.');
  await deleteRecordingTelemetry(identity.recordingId);
  expect(await store.getHead(identity)).toBeNull();
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  expect(
    await db.get(ASSET_OWNERS_STORE, [
      'recording',
      identity.recordingId,
      RECORDING_CURSOR_SNAPSHOT_ROLE,
    ])
  ).toBeUndefined();
  expect(
    collectSyncCaptureClaims(await db.getAll(SYNC_CAPTURE_STORE)).assetIds.has(snapshot.ref.assetId)
  ).toBe(true);
  expect((await readAssetFile(snapshot.ref, 'retained-cursor.bin')).size).toBe(snapshot.ref.size);
  expect((await db.get(STORE_NAME, identity.recordingId))?.assetId).toBe('source-video');
  expect(
    await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [identity.recordingId, identity.trajectoryId])
  ).toMatchObject({ retired: true });
});

it('rolls back failed capture publication and recovers its protected ready journal atomically', async () => {
  const { db, entry, identity, store } = await fixture();
  const failedCapture = vi
    .spyOn(captureOwner, 'captureMediaInTransaction')
    .mockRejectedValue(new Error('Capture write refused'));
  await expect(saveRecordingTelemetry(entry)).rejects.toThrow('Capture write refused');
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  expect(
    await db.get(ASSET_OWNERS_STORE, [
      'recording',
      identity.recordingId,
      RECORDING_CURSOR_SNAPSHOT_ROLE,
    ])
  ).toBeUndefined();
  expect(await captures(db)).toHaveLength(0);
  const journals = await listReadyJournals();
  expect(journals).toHaveLength(2);
  const journal = journals.find((candidate) => candidate.assetRefs.length > 0);
  if (!journal) throw new Error('Protected journal is missing.');
  expect((await readAssetFile(journal.assetRefs[0]!, 'pending-cursor.bin')).size).toBe(
    journal.assetRefs[0]!.size
  );
  expect((await store.getHead(identity))?.finalized).toBe(true);
  failedCapture.mockRestore();
  expect(
    await recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter])
  ).toBe(2);
  expect(await listReadyJournals()).toEqual([]);
  expect(await captures(db)).toHaveLength(1);
  const snapshot = (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot;
  expect(snapshot).toBeDefined();
  expect((await readAssetFile(snapshot!.ref, 'recovered.bin')).size).toBe(snapshot!.ref.size);
});

async function fixtureWithEvents(cursor = true) {
  const result = await fixture();
  const eventsStore = createRecordingEventsStore({
    database: async () => result.db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const eventsIdentity = {
    recordingId: result.identity.recordingId,
    eventStreamId: 'b'.repeat(32),
  };
  const eventsWriter = await eventsStore.begin(eventsIdentity);
  const packer = createRecordingEventsBlockPacker(
    eventsIdentity.recordingId,
    eventsIdentity.eventStreamId
  );
  const eventBlocks = eventsFixture.blocks.flatMap((block) =>
    block.value.records.flatMap((record) => packer.append(record))
  );
  eventBlocks.push(...packer.finish());
  for (const block of eventBlocks) await eventsStore.append(eventsWriter, block);
  const recordingEvents = {
    ...eventsFixture.descriptor,
    eventStreamId: eventsIdentity.eventStreamId,
    ...packer.summary(),
  };
  await eventsStore.finalize(eventsWriter, recordingEvents);
  const entry: RecordingTelemetryEntry = { ...result.entry };
  if (!cursor) delete entry.cursorTrajectory;
  // Admission receives unknown descriptors; the shared guard checks the frozen schema.
  const admitted = parseRecordingTelemetryEntry({ ...entry, recordingEvents });
  if (!admitted) throw new Error('Invalid events fixture.');
  return { ...result, entry: admitted, eventsStore, eventsIdentity, eventsWriter, eventBlocks };
}

it.each([false, true])(
  'publishes events and optional cursor in one metadata/owner/capture transaction; cursor=%s',
  async (cursor) => {
    const { db, entry, identity, eventsIdentity } = await fixtureWithEvents(cursor);
    await saveRecordingTelemetry(entry);
    const saved = await getRecordingTelemetry(identity.recordingId);
    const eventSnapshot = saved?.recordingEventsSnapshot;
    if (!eventSnapshot) throw new Error('Missing events snapshot.');
    expect(eventSnapshot.ref.sha256).toBe(entry.recordingEvents?.streamSha256);
    expect(
      await db.get(ASSET_OWNERS_STORE, [
        'recording',
        identity.recordingId,
        RECORDING_EVENTS_SNAPSHOT_ROLE,
      ])
    ).toMatchObject({ assetId: eventSnapshot.ref.assetId });
    expect(
      await db.get(RECORDING_EVENTS_STORE, [
        identity.recordingId,
        eventsIdentity.eventStreamId,
        'head',
        0,
      ])
    ).toMatchObject({ snapshotAssetId: eventSnapshot.ref.assetId });
    const claims = collectSyncCaptureClaims(await db.getAll(SYNC_CAPTURE_STORE));
    expect(claims.valid).toBe(true);
    expect(claims.assetIds.has(eventSnapshot.ref.assetId)).toBe(true);
    if (cursor)
      expect(claims.assetIds.has(saved!.cursorTrajectorySnapshot!.ref.assetId)).toBe(true);
    expect(await captures(db)).toHaveLength(1);
    expect((await collectDurableAssetSnapshot(db)).authorityValid).toBe(true);
    expect(await listReadyJournals()).toEqual([]);
  }
);

it('reuses both immutable snapshots on metadata updates and preserves newer facts on replay', async () => {
  const { db, entry, identity } = await fixtureWithEvents();
  const journals: AssetReadyJournal[] = [];
  hooks.ready.mockImplementation(async (journal) => {
    journals.push(journal);
  });
  await saveRecordingTelemetry(entry);
  const initial = await getRecordingTelemetry(identity.recordingId);
  await saveRecordingTelemetry({ ...entry, updatedAt: 5 });
  const updated = await getRecordingTelemetry(identity.recordingId);
  expect(updated?.updatedAt).toBe(5);
  expect(updated?.recordingEventsSnapshot).toEqual(initial?.recordingEventsSnapshot);
  expect(updated?.cursorTrajectorySnapshot).toEqual(initial?.cursorTrajectorySnapshot);
  expect(hooks.ready).toHaveBeenCalledOnce();
  await recordingCursorTrajectoryPublicationAdapter.publish(journals[0]!);
  expect((await getRecordingTelemetry(identity.recordingId))?.updatedAt).toBe(5);
  expect(await captures(db)).toHaveLength(2);
  expect(await listAssetObjectIds()).toHaveLength(2);
});

it('rolls back both file owners and both head links when capture refuses, then replays both together', async () => {
  const { db, entry, identity, eventsStore, eventsIdentity, store } = await fixtureWithEvents();
  const failure = vi
    .spyOn(captureOwner, 'captureMediaInTransaction')
    .mockRejectedValue(new Error('Capture refused both histories'));
  await expect(saveRecordingTelemetry(entry)).rejects.toThrow('Capture refused both histories');
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  for (const role of [RECORDING_CURSOR_SNAPSHOT_ROLE, RECORDING_EVENTS_SNAPSHOT_ROLE])
    expect(
      await db.get(ASSET_OWNERS_STORE, ['recording', identity.recordingId, role])
    ).toBeUndefined();
  expect((await store.getHead(identity))?.snapshotAssetId).toBeUndefined();
  expect((await eventsStore.getHead(eventsIdentity))?.snapshotAssetId).toBeUndefined();
  const journals = await listReadyJournals();
  expect(journals).toHaveLength(2);
  const ready = journals.find((candidate) => candidate.assetRefs.length > 0)!;
  expect(ready.assetRefs).toHaveLength(2);
  for (const ref of ready.assetRefs) expect(isAssetReadyProtected(ref.assetId)).toBe(true);
  failure.mockRestore();
  expect(
    await recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter])
  ).toBe(2);
  expect(
    (await getRecordingTelemetry(identity.recordingId))?.recordingEventsSnapshot
  ).toBeDefined();
  expect(
    (await getRecordingTelemetry(identity.recordingId))?.cursorTrajectorySnapshot
  ).toBeDefined();
  expect(await captures(db)).toHaveLength(1);
});

it('discards only the first prepared copy if event file preparation fails and retains source data/video', async () => {
  const { db, entry, identity, eventsIdentity, store, eventsStore } = await fixtureWithEvents();
  const prepare = vi
    .spyOn(eventsSnapshots, 'prepareRecordingEventsSnapshot')
    .mockRejectedValue(new Error('Events I/O refused'));
  await expect(saveRecordingTelemetry(entry)).rejects.toThrow('Events I/O refused');
  expect(await listAssetObjectIds()).toEqual([]);
  expect(await listReadyJournals()).toHaveLength(1);
  expect((await store.getHead(identity))?.finalized).toBe(true);
  expect((await eventsStore.getHead(eventsIdentity))?.finalized).toBe(true);
  expect((await db.get(STORE_NAME, identity.recordingId))?.assetId).toBe('source-video');
  prepare.mockRestore();
  await expect(
    recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter])
  ).resolves.toBe(1);
  const recovered = await getRecordingTelemetry(identity.recordingId);
  expect(recovered?.recordingEventsSnapshot).toBeDefined();
  expect(recovered?.cursorTrajectorySnapshot).toBeDefined();
  expect(await listReadyJournals()).toEqual([]);
});

it('does not revive an event source deleted and recreated during ready admission', async () => {
  const { db, entry, identity, eventsStore, eventsIdentity, eventBlocks } =
    await fixtureWithEvents(false);
  let successorGeneration: string | undefined;
  hooks.ready.mockImplementationOnce(async () => {
    await deleteRecordingTelemetry(identity.recordingId);
    const successor = await eventsStore.restore(eventsIdentity);
    successorGeneration = successor.writerGeneration;
    for (const block of eventBlocks) await eventsStore.append(successor, block);
    await eventsStore.finalize(successor, entry.recordingEvents);
  });
  await expect(saveRecordingTelemetry(entry)).rejects.toMatchObject({
    name: 'SupersededAssetPublicationError',
  });
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  expect(await eventsStore.getHead(eventsIdentity)).toMatchObject({
    writerGeneration: successorGeneration,
    finalized: true,
  });
  expect(
    await db.get(ASSET_OWNERS_STORE, [
      'recording',
      identity.recordingId,
      RECORDING_EVENTS_SNAPSHOT_ROLE,
    ])
  ).toBeUndefined();
  expect(await listReadyJournals()).toEqual([]);
});

it('releases both history owners on delete while frozen capture pins both files', async () => {
  const { db, entry, identity, eventsStore, eventsIdentity, store } = await fixtureWithEvents();
  await saveRecordingTelemetry(entry);
  const saved = await getRecordingTelemetry(identity.recordingId);
  if (!saved?.recordingEventsSnapshot || !saved.cursorTrajectorySnapshot)
    throw new Error('Missing snapshots.');
  await deleteRecordingTelemetry(identity.recordingId);
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  expect(await store.getHead(identity)).toBeNull();
  expect(await eventsStore.getHead(eventsIdentity)).toBeNull();
  const claims = collectSyncCaptureClaims(await db.getAll(SYNC_CAPTURE_STORE));
  for (const snapshot of [saved.cursorTrajectorySnapshot, saved.recordingEventsSnapshot]) {
    expect(claims.assetIds.has(snapshot.ref.assetId)).toBe(true);
    expect((await readAssetFile(snapshot.ref, 'retained.bin')).size).toBe(snapshot.ref.size);
  }
  expect((await db.get(STORE_NAME, identity.recordingId))?.assetId).toBe('source-video');
});

it('admits one of two parallel history publications and discards only the losing prepared files', async () => {
  const { db, entry, identity } = await fixtureWithEvents();
  let release!: () => void, admitted!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bothReady = new Promise<void>((resolve) => {
    admitted = resolve;
  });
  let count = 0;
  hooks.ready.mockImplementation(async () => {
    if (++count === 2) admitted();
    await barrier;
  });
  const completed = Promise.allSettled([
    saveRecordingTelemetry(entry),
    saveRecordingTelemetry(entry),
  ]);
  await bothReady;
  release();
  const outcomes = await completed;
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const loser = outcomes.find((result) => result.status === 'rejected');
  expect(loser?.status === 'rejected' && loser.reason.name).toBe('SupersededAssetPublicationError');
  expect(await captures(db)).toHaveLength(1);
  const saved = await getRecordingTelemetry(identity.recordingId);
  expect(saved?.cursorTrajectorySnapshot).toBeDefined();
  expect(saved?.recordingEventsSnapshot).toBeDefined();
  expect(await listAssetObjectIds()).toHaveLength(2);
  expect(await listReadyJournals()).toEqual([]);
});

it('deletes the Library source and both raw histories while capture retains the immutable files', async () => {
  const { db, entry, identity, eventsStore, eventsIdentity, store } = await fixtureWithEvents();
  await saveRecordingTelemetry(entry);
  const saved = await getRecordingTelemetry(identity.recordingId);
  if (!saved?.recordingEventsSnapshot || !saved.cursorTrajectorySnapshot)
    throw new Error('Missing snapshots.');
  await deleteMediaAssetWithProjectCascade(`recording:${identity.recordingId}`, []);
  expect(await db.get(STORE_NAME, identity.recordingId)).toBeUndefined();
  expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
  expect(await eventsStore.getHead(eventsIdentity)).toBeNull();
  expect(await store.getHead(identity)).toBeNull();
  const claims = collectSyncCaptureClaims(await db.getAll(SYNC_CAPTURE_STORE));
  for (const snapshot of [saved.cursorTrajectorySnapshot, saved.recordingEventsSnapshot]) {
    expect(claims.assetIds.has(snapshot.ref.assetId)).toBe(true);
    expect((await readAssetFile(snapshot.ref, 'retained.bin')).size).toBe(snapshot.ref.size);
  }
});

it(
  'cancels a failed preparation intent after source deletion and recreation without ' +
    'adopting its generation',
  async () => {
    const { entry, identity, eventsIdentity, eventsStore, eventBlocks } =
      await fixtureWithEvents(false);
    const prepare = vi
      .spyOn(eventsSnapshots, 'prepareRecordingEventsSnapshot')
      .mockRejectedValue(new Error('Events file refused'));
    await expect(saveRecordingTelemetry(entry)).rejects.toThrow('Events file refused');
    expect(await listReadyJournals()).toHaveLength(1);
    prepare.mockRestore();
    await deleteRecordingTelemetry(identity.recordingId);
    const successor = await eventsStore.restore(eventsIdentity);
    for (const block of eventBlocks) await eventsStore.append(successor, block);
    await eventsStore.finalize(successor, entry.recordingEvents);
    await expect(
      recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter])
    ).resolves.toBe(1);
    expect(await getRecordingTelemetry(identity.recordingId)).toBeUndefined();
    expect(await eventsStore.getHead(eventsIdentity)).toMatchObject({
      writerGeneration: successor.writerGeneration,
      finalized: true,
    });
    expect(await listAssetObjectIds()).toEqual([]);
    expect(await listReadyJournals()).toEqual([]);
  }
);
