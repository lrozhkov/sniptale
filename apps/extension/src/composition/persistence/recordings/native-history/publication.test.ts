import {
  createNativeHistoryPublicationGrant,
  publishNativeHistoryInTransaction,
  readPublishedNativeHistory,
} from './publication';
import * as eventsSnapshots from '../recording-events/snapshot';
import * as captureOwner from '../../sync-capture/capture';
import { createCursorTrajectoryBlockPacker } from '../../../../features/video/project/cursor-trajectory/blocks';
import { createRecordingCursorTrajectoryStore } from '../cursor-trajectory/store';
import { createMediaLibraryEntry } from '../../projects/index.test-support';
import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import eventsFixture from '../../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { createHarness } from '../../assets/opfs-store.test-support';
import { listReadyJournals, readAssetFile } from '../../assets/opfs-store';
import { recoverStandaloneAssetPublications } from '../../assets/recovery';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  STORE_NAME,
  MEDIA_LIBRARY_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_TELEMETRY_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import {
  saveNativeRecordingHistory,
  getRecordingTelemetry,
  recordingCursorTrajectoryPublicationAdapter,
} from '../telemetry';
import { createRecordingEventsStore } from '../recording-events/store';
import { createNativeRecordingHistoryStore } from './store';
import { recoverNativeRecordingHistories } from './recovery';
import type { RecordingTelemetryEntry } from '../contracts';

let database: IDBPDatabase;
let databaseName: string;
vi.mock('../../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../../infrastructure/indexed-db/core')>()),
  initDB: async () => database,
}));
const recordingId = eventsFixture.recordingId;
const base: RecordingTelemetryEntry = {
  recordingId,
  createdAt: 1,
  updatedAt: 2,
  captureMode: null,
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [],
};
beforeEach(async () => {
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  databaseName = `native-publication-${crypto.randomUUID()}`;
  database = await openDB(databaseName, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const harness = createHarness();
  vi.stubGlobal('navigator', {
    storage: { getDirectory: harness.options.getOriginRoot },
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<unknown>
      ) => callback({}),
    },
  });
  await database.put(STORE_NAME, {
    id: recordingId,
    assetId: 'video',
    filename: 'source.mp4',
    mimeType: 'video/mp4',
    size: 1000,
    createdAt: 1,
  });
  await database.put(ASSET_REFS_STORE, {
    assetId: 'video',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/video' },
    mimeType: 'video/mp4',
    sha256: 'd'.repeat(64),
    size: 1000,
  });
  await database.put(ASSET_OWNERS_STORE, {
    assetId: 'video',
    ownerKind: 'recording',
    ownerId: recordingId,
    role: 'body',
  });
  await database.put(
    MEDIA_LIBRARY_STORE,
    createMediaLibraryEntry({
      id: `recording:${recordingId}`,
      kind: 'recording',
      source: { kind: 'recording', recordingId },
      filename: 'source.mp4',
      originalFilename: 'source.mp4',
      mimeType: 'video/mp4',
      size: 1000,
      width: 640,
      height: 360,
    })
  );
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    id: recordingId,
    kind: 'recording-complete',
    controllerLeaseId: 'lease',
    sha256: 'd'.repeat(64),
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 10000,
    metadata: { width: 640, height: 360, openEditor: true },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  database.close();
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
});
async function acceptedEvents(stage: 'verified' | 'appended' | 'partial' = 'verified') {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
  const owner = createNativeRecordingHistoryStore();
  const intent = await owner.plan({
    recordingId,
    controllerLeaseId: 'lease',
    videoSha256: 'd'.repeat(64),
    width: 640,
    height: 360,
    recordingEvents: eventsFixture.descriptor,
    baseTelemetry: base,
  });
  const writer = intent.events!.writer!;
  const events = createRecordingEventsStore({
    database: async () => database,
    mintGeneration: () => writer.writerGeneration,
  });
  await events.begin(writer, recordingId, intent.operationId);
  for (let index = 0; index < (stage === 'partial' ? 1 : eventsFixture.blocks.length); index++)
    await events.append(writer, {
      bytes: new TextEncoder().encode(eventsFixture.blocks[index]!.utf8),
      entry: eventsFixture.manifest[index]!,
    });
  if (stage === 'verified') await events.finalize(writer, eventsFixture.descriptor);
  if (stage === 'verified')
    await owner.savePull(intent, {
      kind: 'events',
      descriptor: eventsFixture.descriptor,
      pull: { kind: 'verified' },
    });
  return { owner, writer };
}
async function acceptedCursor(stage: 'verified' | 'appended' = 'verified') {
  const owner = createNativeRecordingHistoryStore();
  const packer = createCursorTrajectoryBlockPacker(recordingId, 'a'.repeat(32));
  const blocks = packer.append({
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    width: 640,
    height: 360,
    reason: 'start',
    clock: {
      source: 'windows-message-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  });
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
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 2000, reason: 'stop' }),
    ...packer.finish()
  );
  const descriptor = {
    format: 'cursor-trajectory-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'sed-window-v1' as const,
    encoding: 'json-ascii-int-v1' as const,
    trajectoryId: 'a'.repeat(32),
    state: 'complete' as const,
    finalized: true,
    ...packer.summary(),
  };
  const intent = await owner.plan({
    recordingId,
    controllerLeaseId: 'lease',
    videoSha256: 'd'.repeat(64),
    width: 640,
    height: 360,
    cursorTrajectory: descriptor,
  });
  const writer = intent.cursor!.writer!;
  const cursor = createRecordingCursorTrajectoryStore({
    database: async () => database,
    mintGeneration: () => writer.writerGeneration,
  });
  await cursor.begin(writer, { width: 640, height: 360 }, recordingId, intent.operationId);
  for (const block of blocks) await cursor.append(writer, block);
  if (stage === 'verified') await cursor.finalize(writer, descriptor, 'complete');
  if (stage === 'verified')
    await owner.savePull(intent, { kind: 'cursor', descriptor, pull: { kind: 'verified' } });
  return { owner, writer, descriptor };
}

it(
  'publishes original event bytes, facts, owner, metadata and Native receipt state ' +
    'together and retries idempotently',
  async () => {
    const { owner, writer } = await acceptedEvents();
    await saveNativeRecordingHistory(recordingId, 'events');
    const saved = await getRecordingTelemetry(recordingId);
    expect(saved?.recordingEvents).toEqual(eventsFixture.descriptor);
    expect(saved?.recordingEventsSnapshot?.sourceRecordingId).toBe(recordingId);
    expect(saved?.actionEvents).toEqual(base.actionEvents);
    const snapshot = saved!.recordingEventsSnapshot!;
    expect(snapshot.ref.sha256).toBe(eventsFixture.descriptor.streamSha256);
    expect((await readAssetFile(snapshot.ref, 'events.bin')).size).toBe(
      eventsFixture.descriptor.totalBytes + eventsFixture.descriptor.totalBlocks * 4
    );
    expect(
      await database.get(ASSET_OWNERS_STORE, ['recording', recordingId, 'recording-events'])
    ).toMatchObject({ assetId: snapshot.ref.assetId });
    expect(
      await database.get(RECORDING_EVENTS_STORE, [
        recordingId,
        eventsFixture.descriptor.eventStreamId,
        'head',
        0,
      ])
    ).toMatchObject({ finalized: true, snapshotAssetId: snapshot.ref.assetId, totalRecords: 18 });
    expect(
      await database.get(RECORDING_EVENTS_STORE, [
        writer.recordingId,
        writer.eventStreamId,
        'head',
        0,
      ])
    ).toMatchObject({ retired: true });
    expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'published' });
    await saveNativeRecordingHistory(recordingId, 'events');
    expect(await getRecordingTelemetry(recordingId)).toEqual(saved);
    expect(await listReadyJournals()).toEqual([]);
  }
);
it('keeps the durable Native parent and verified prefix when OPFS is unavailable, then retries', async () => {
  const { owner, writer } = await acceptedEvents();
  const navigatorBeforeFailure = navigator;
  vi.stubGlobal('navigator', {
    ...navigatorBeforeFailure,
    storage: {
      getDirectory: async () => {
        throw new Error('disk-unavailable');
      },
    },
  });
  await expect(saveNativeRecordingHistory(recordingId, 'events')).rejects.toThrow(
    'disk-unavailable'
  );
  vi.stubGlobal('navigator', navigatorBeforeFailure);
  // An unavailable OPFS also prevents the journal write.
  // The durable Native parent remains authoritative.
  expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  expect(
    await database.get(RECORDING_EVENTS_STORE, [
      writer.recordingId,
      writer.eventStreamId,
      'head',
      0,
    ])
  ).toMatchObject({ retired: false, finalized: true });
  await saveNativeRecordingHistory(recordingId, 'events');
  await recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter]);
  expect((await owner.read(recordingId))?.phase).toBe('complete');
});
it('refuses a replaced video and preserves accepted private history without publishing metadata', async () => {
  const { owner, writer } = await acceptedEvents();
  const video = await database.get(STORE_NAME, recordingId);
  await database.put(STORE_NAME, { ...video, assetId: 'replacement' });
  await expect(saveNativeRecordingHistory(recordingId, 'events')).rejects.toThrow();
  expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
  expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
  expect(
    await database.get(RECORDING_EVENTS_STORE, [
      writer.recordingId,
      writer.eventStreamId,
      'head',
      0,
    ])
  ).toMatchObject({ retired: false });
});
it('publishes unavailable zero-block events without creating an archive', async () => {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
  const owner = createNativeRecordingHistoryStore();
  const descriptor = {
    ...eventsFixture.descriptor,
    state: 'unavailable' as const,
    totalBlocks: 0,
    totalRecords: 0,
    totalBytes: 0,
    streamSha256: eventsFixture.emptyStreamSha256,
  };
  const intent = await owner.plan({
    recordingId,
    controllerLeaseId: 'lease',
    videoSha256: 'd'.repeat(64),
    width: 640,
    height: 360,
    recordingEvents: descriptor,
    baseTelemetry: base,
  });
  await owner.savePull(intent, { kind: 'events', descriptor, pull: { kind: 'unavailable' } });
  await saveNativeRecordingHistory(recordingId, 'events');
  const saved = await getRecordingTelemetry(recordingId);
  expect(saved?.recordingEvents).toEqual(descriptor);
  expect(saved?.recordingEventsSnapshot).toBeUndefined();
  expect(saved?.signals).toHaveLength(1);
  expect(
    await database.get(ASSET_OWNERS_STORE, ['recording', recordingId, 'recording-events'])
  ).toBeUndefined();
  expect((await owner.read(recordingId))?.phase).toBe('complete');
});

it('records the prepare intent before snapshot I/O and replays after that I/O fails', async () => {
  const { owner } = await acceptedEvents();
  const failure = vi
    .spyOn(eventsSnapshots, 'prepareRecordingEventsSnapshot')
    .mockImplementation(async () => {
      expect(await listReadyJournals()).toHaveLength(1);
      throw new Error('snapshot-write-failed');
    });
  await expect(saveNativeRecordingHistory(recordingId, 'events')).rejects.toThrow(
    'snapshot-write-failed'
  );
  expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
  expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
  failure.mockRestore();
  await recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter]);
  expect((await owner.read(recordingId))?.phase).toBe('complete');
  expect(await listReadyJournals()).toEqual([]);
});
it(
  'rolls back private retirement, public facts, owner, metadata and receipt state when ' +
    'the metadata transaction fails',
  async () => {
    const { owner, writer } = await acceptedEvents();
    const failure = vi
      .spyOn(captureOwner, 'captureMediaInTransaction')
      .mockRejectedValue(new Error('metadata-refused'));
    await expect(saveNativeRecordingHistory(recordingId, 'events')).rejects.toThrow(
      'metadata-refused'
    );
    expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
    expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
    expect(
      await database.get(ASSET_OWNERS_STORE, ['recording', recordingId, 'recording-events'])
    ).toBeUndefined();
    expect(
      await database.get(RECORDING_EVENTS_STORE, [recordingId, writer.eventStreamId, 'head', 0])
    ).toBeUndefined();
    expect(
      await database.get(RECORDING_EVENTS_STORE, [
        writer.recordingId,
        writer.eventStreamId,
        'head',
        0,
      ])
    ).toMatchObject({ retired: false, finalized: true });
    failure.mockRestore();
    await recoverStandaloneAssetPublications([recordingCursorTrajectoryPublicationAdapter]);
    expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'published' });
    expect((await getRecordingTelemetry(recordingId))?.recordingEventsSnapshot).toBeDefined();
  }
);
it.each(['cursor-first', 'events-first'] as const)(
  'preserves the independent stream and its immutable file when publishing %s',
  async (order) => {
    if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
    const { owner } = await acceptedEvents();
    const { descriptor } = await acceptedCursor();
    const first = order === 'cursor-first' ? 'cursor' : 'events';
    const second = first === 'cursor' ? 'events' : 'cursor';
    await saveNativeRecordingHistory(recordingId, first);
    const intermediate = await getRecordingTelemetry(recordingId);
    await saveNativeRecordingHistory(recordingId, second);
    const saved = await getRecordingTelemetry(recordingId);
    expect(saved?.cursorTrajectory).toEqual(descriptor);
    expect(saved?.recordingEvents).toEqual(eventsFixture.descriptor);
    if (first === 'cursor')
      expect(saved?.cursorTrajectorySnapshot).toEqual(intermediate?.cursorTrajectorySnapshot);
    else expect(saved?.recordingEventsSnapshot).toEqual(intermediate?.recordingEventsSnapshot);
    expect((await owner.read(recordingId))?.phase).toBe('complete');
    expect(await readPublishedNativeHistory(recordingId, 'cursor')).toEqual({
      kind: 'cursor',
      descriptor,
    });
  }
);

it.each(['verified', 'appended'] as const)(
  'recovers the durable %s Native parent without any network connection or prior OPFS journal',
  async (stage) => {
    const { owner } = await acceptedEvents(stage);
    expect(await listReadyJournals()).toEqual([]);
    expect(await recoverNativeRecordingHistories()).toBe(1);
    expect((await owner.read(recordingId))?.phase).toBe('complete');
    expect((await getRecordingTelemetry(recordingId))?.recordingEventsSnapshot).toBeDefined();
    expect(await recoverNativeRecordingHistories()).toBe(0);
  }
);
it('leaves an incomplete network prefix pending and preserves the video during offline recovery', async () => {
  const { owner, writer } = await acceptedEvents('partial');
  expect(await recoverNativeRecordingHistories()).toBe(0);
  expect((await owner.read(recordingId))?.phase).toBe('pending');
  expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  expect(
    await database.get(RECORDING_EVENTS_STORE, [
      writer.recordingId,
      writer.eventStreamId,
      'head',
      0,
    ])
  ).toMatchObject({ retired: false, totalBlocks: 1, finalized: false });
});
it('retains a failed optional history during recovery and succeeds on a later attempt', async () => {
  const { owner } = await acceptedEvents();
  const failure = vi
    .spyOn(eventsSnapshots, 'prepareRecordingEventsSnapshot')
    .mockRejectedValue(new Error('disk-full'));
  expect(await recoverNativeRecordingHistories()).toBe(0);
  expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  failure.mockRestore();
  expect(await recoverNativeRecordingHistories()).toBe(1);
});

it('authorizes receipt facts from the committed ledger and refuses a missing byte owner', async () => {
  await acceptedEvents();
  await expect(readPublishedNativeHistory(recordingId, 'events')).rejects.toThrow();
  await saveNativeRecordingHistory(recordingId, 'events');
  expect(await readPublishedNativeHistory(recordingId, 'events')).toEqual({
    kind: 'events',
    descriptor: eventsFixture.descriptor,
  });
  await database.delete(ASSET_OWNERS_STORE, ['recording', recordingId, 'recording-events']);
  await expect(readPublishedNativeHistory(recordingId, 'events')).rejects.toThrow();
});

it('recovers appended cursor bytes after a crash before finalization and receipt publication', async () => {
  const { owner, descriptor } = await acceptedCursor('appended');
  expect(await recoverNativeRecordingHistories()).toBe(1);
  expect((await owner.read(recordingId))?.phase).toBe('complete');
  expect((await getRecordingTelemetry(recordingId))?.cursorTrajectory).toEqual(descriptor);
  expect(await readPublishedNativeHistory(recordingId, 'cursor')).toEqual({
    kind: 'cursor',
    descriptor,
  });
  expect(await recoverNativeRecordingHistories()).toBe(0);
});

it.each(['cursor', 'events'] as const)(
  'recovers a zero-block unavailable %s without an archive or receipt',
  async (kind) => {
    const owner = createNativeRecordingHistoryStore();
    if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
    const empty = {
      state: 'unavailable' as const,
      totalBlocks: 0,
      totalRecords: 0,
      totalBytes: 0,
      streamSha256: eventsFixture.emptyStreamSha256,
    };
    const cursor = {
      format: 'cursor-trajectory-v1' as const,
      formatVersion: 1 as const,
      algorithm: 'sed-window-v1' as const,
      encoding: 'json-ascii-int-v1' as const,
      trajectoryId: 'a'.repeat(32),
      finalized: true,
      totalSamples: 0,
      ...empty,
    };
    const descriptor = kind === 'cursor' ? cursor : { ...eventsFixture.descriptor, ...empty };
    await owner.plan({
      recordingId,
      controllerLeaseId: 'lease',
      videoSha256: 'd'.repeat(64),
      width: 640,
      height: 360,
      ...(kind === 'cursor'
        ? { cursorTrajectory: cursor }
        : { recordingEvents: { ...eventsFixture.descriptor, ...empty } }),
    });
    expect(await recoverNativeRecordingHistories()).toBe(1);
    expect((await owner.read(recordingId))?.phase).toBe('complete');
    const saved = await getRecordingTelemetry(recordingId);
    expect(kind === 'cursor' ? saved?.cursorTrajectory : saved?.recordingEvents).toEqual(
      descriptor
    );
    expect(saved?.cursorTrajectorySnapshot).toBeUndefined();
    expect(saved?.recordingEventsSnapshot).toBeUndefined();
    expect(await readPublishedNativeHistory(recordingId, kind)).toBeNull();
  }
);

it('keeps appended cursor history pending when its private generation changes', async () => {
  const { owner, writer } = await acceptedCursor('appended');
  const key = [writer.recordingId, writer.trajectoryId];
  const head = await database.get(RECORDING_CURSOR_TRAJECTORIES_STORE, key);
  await database.put(RECORDING_CURSOR_TRAJECTORIES_STORE, {
    ...head,
    writerGeneration: 'replacement',
  });
  expect(await recoverNativeRecordingHistories()).toBe(0);
  expect((await owner.read(recordingId))?.phase).toBe('pending');
  expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
});

it('refuses cancelled and unverified publication grants before snapshot writes', async () => {
  const { owner } = await acceptedEvents('partial');
  const intent = await owner.read(recordingId);
  if (!intent) throw new Error('Missing accepted intent.');
  expect(() => createNativeHistoryPublicationGrant(intent, 'events')).toThrow();
  expect(() =>
    createNativeHistoryPublicationGrant({ ...intent, phase: 'cancelled' }, 'events')
  ).toThrow();
  expect(() => createNativeHistoryPublicationGrant(intent, 'cursor')).toThrow();
  expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
  expect(await listReadyJournals()).toEqual([]);
});

it.each([
  'missing-intent',
  'missing-telemetry',
  'changed-descriptor',
  'missing-snapshot',
  'changed-ref',
] as const)('refuses a recovered event receipt with %s', async (damage) => {
  await acceptedEvents();
  await saveNativeRecordingHistory(recordingId, 'events');
  const saved = await getRecordingTelemetry(recordingId);
  if (!saved?.recordingEventsSnapshot) throw new Error('Missing published archive.');
  if (damage === 'missing-intent')
    await database.delete(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  else if (damage === 'missing-telemetry')
    await database.delete(RECORDING_TELEMETRY_STORE, recordingId);
  else if (damage === 'changed-descriptor')
    await database.put(RECORDING_TELEMETRY_STORE, {
      ...saved,
      recordingEvents: { ...saved.recordingEvents, state: 'complete' },
    });
  else if (damage === 'missing-snapshot') {
    const { recordingEventsSnapshot: _removed, ...withoutSnapshot } = saved;
    await database.put(RECORDING_TELEMETRY_STORE, withoutSnapshot);
  } else {
    const ref = saved.recordingEventsSnapshot.ref;
    await database.put(ASSET_REFS_STORE, { ...ref, size: ref.size + 1 });
  }
  await expect(readPublishedNativeHistory(recordingId, 'events')).rejects.toThrow();
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
});

it.each(['recording', 'descriptor', 'snapshot', 'lease'] as const)(
  'aborts publication with a mismatched %s binding and preserves the verified private stream',
  async (mismatch) => {
    const { owner, writer } = await acceptedEvents();
    const intent = await owner.read(recordingId);
    if (!intent || !isRecordingEventsDescriptor(eventsFixture.descriptor))
      throw new Error('Missing accepted intent.');
    const grant = createNativeHistoryPublicationGrant(intent, 'events');
    const entry: RecordingTelemetryEntry = { ...base, recordingEvents: eventsFixture.descriptor };
    if (mismatch === 'recording') entry.recordingId = 'different-source';
    if (mismatch === 'descriptor')
      entry.recordingEvents = { ...eventsFixture.descriptor, state: 'complete' };
    const tx = database.transaction(
      [
        STORE_NAME,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        NATIVE_TRANSFER_SESSIONS_STORE,
        RECORDING_CURSOR_TRAJECTORIES_STORE,
        RECORDING_EVENTS_STORE,
        RECORDING_TELEMETRY_STORE,
      ],
      'readwrite'
    );
    void tx.done.catch(() => undefined);
    await expect(
      publishNativeHistoryInTransaction(
        tx,
        mismatch === 'lease' ? { ...grant, controllerLeaseId: 'replaced-lease' } : grant,
        entry,
        null
      )
    ).rejects.toThrow();
    tx.abort();
    await tx.done.catch(() => undefined);
    expect(await getRecordingTelemetry(recordingId)).toBeUndefined();
    expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
    expect(
      await database.get(RECORDING_EVENTS_STORE, [
        writer.recordingId,
        writer.eventStreamId,
        'head',
        0,
      ])
    ).toMatchObject({ retired: false, finalized: true });
  }
);

it.each(['cursor', 'events'] as const)(
  'refuses a recovered %s receipt when the durable head no longer owns the published snapshot',
  async (kind) => {
    if (kind === 'cursor') await acceptedCursor();
    else await acceptedEvents();
    await saveNativeRecordingHistory(recordingId, kind);
    const saved = await getRecordingTelemetry(recordingId);
    const store = kind === 'cursor' ? RECORDING_CURSOR_TRAJECTORIES_STORE : RECORDING_EVENTS_STORE;
    const key =
      kind === 'cursor'
        ? [recordingId, saved!.cursorTrajectory!.trajectoryId]
        : [recordingId, saved!.recordingEvents!.eventStreamId, 'head', 0];
    const head = await database.get(store, key);
    await database.put(store, { ...head, snapshotAssetId: 'unrelated-archive' });
    await expect(readPublishedNativeHistory(recordingId, kind)).rejects.toThrow();
    expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  }
);
