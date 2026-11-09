import { recoverPendingAssetPublications } from '../../../composition/persistence/asset-publication-recovery';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createHarness } from '../../../composition/persistence/assets/opfs-store.test-support';
import * as physicalAssets from '../../../composition/persistence/assets/opfs-store';
import * as eventStages from '../../../composition/persistence/recordings/recording-events/staging';
import * as restoreSessions from './restore-session';
import { restoreMediaHubBackupV6 } from './restore';
import * as assetIo from '../../../composition/persistence/assets';
import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../features/video/project/recording-events/blocks';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import {
  openRecordingEventsStream,
  createRecordingEventsReader,
} from '../../../composition/persistence/recordings/recording-events/reader';
import { linkRecordingEventsSnapshotInTransaction } from '../../../composition/persistence/recordings/recording-events/publication';
import { retireJournalRecordingEventStages } from '../../../composition/persistence/recordings/recording-events/staging';
import { parseRecordingTelemetryEntry } from '../../../composition/persistence/recordings/telemetry.guards';
import { preparePortableReplica } from '../../sync-transfer/prepared-root';
import { applyPreparedMediaReplica } from '../../../composition/persistence/sync-capture/apply-media';
import { frozenReviewDatabase } from '../../sync-transfer/captured-review';
import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createArchiveWriter, openArchiveReader } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import { publishStagedCursorTrajectoryInTransaction } from '../../../composition/persistence/recordings/cursor-trajectory/publication';
import { createCursorTrajectoryBlockPacker } from '../../../features/video/project/cursor-trajectory/blocks';
import type { PortableCursorTrajectoryAttachment } from './root-codecs/cursor-trajectory';
import { openStoredCursorTrajectoryStream, stageCursorTrajectoryStream } from './cursor-trajectory';
import { digestBackupObject } from './shared-objects';
import { openArchiveRootObjectSource } from './object-source';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';
import { inspectMediaHubBackupV6 } from './inspect';
import { retireJournalCursorTrajectoryStages } from '../../../composition/persistence/recordings/cursor-trajectory/staging';
import { buildMediaRootInventory } from './inventory/media';
import { createMediaHubBackupExportOptions } from './options';
import { createArchivePathAllocator } from '../../../composition/archive-transfer';
import { createMediaLibraryEntry } from '../../../composition/persistence/projects/index.test-support';
import { mediaLibraryRootPublisher } from './root-publication/media';
import type {
  AssetRef,
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../composition/persistence/assets';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  RECORDING_EVENTS_STORE,
  ASSET_OWNERS_STORE,
} from '../../../composition/persistence/infrastructure/indexed-db/core.stores';

let admittedDatabase: IDBPDatabase | null = null;
const files = new Map<string, File>();
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => {
    if (!admittedDatabase) throw new Error('Database not admitted.');
    return admittedDatabase;
  },
}));
vi.mock('../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/assets')>()),
  readAssetFile: async (ref: { assetId: string }) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Fixture file is missing.');
    return file;
  },
}));

const databases: { name: string; db: IDBPDatabase }[] = [];
let sequence = 0;
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  admittedDatabase = null;
  files.clear();
  installPersistenceLockManagerForTests(null);
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});

async function fixture() {
  const name = `cursor-backup-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  admittedDatabase = db;
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = { recordingId: 'original', trajectoryId: 'a'.repeat(32) };
  const geometry = { width: 160, height: 90 };
  const writer = await store.begin(identity, geometry);
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = [];
  for (let i = 0; i < 3; i += 1) {
    blocks.push(
      ...packer.append({
        kind: 'segment',
        segmentId: i,
        activeTimeUs: i * 100,
        ...geometry,
        clock: {
          source: 'dom-event-time',
          timestampQuantumUs: null,
          resolutionBoundUs: null,
          mappingUncertaintyUs: null,
        },
        reason: i === 0 ? 'start' : 'resume',
      })
    );
    blocks.push(
      ...packer.append({
        kind: 'sample',
        segmentId: i,
        observationSeq: i,
        activeTimeUs: i * 100,
        xQ8: 256,
        yQ8: 512,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
    blocks.push(
      ...packer.append({
        kind: 'boundary',
        segmentId: i,
        activeTimeUs: i * 100 + 50,
        reason: i === 2 ? 'stop' : 'pause',
      })
    );
  }
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, packer.summary(), 'complete');
  const attachment: PortableCursorTrajectoryAttachment = {
    ...geometry,
    recordingId: identity.recordingId,
    sourceRecordingId: 'original',
    objectId: 'cursor-stream',
    descriptor: {
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
  return { db, store, writer, attachment, identity, blocks, geometry };
}

it('roundtrips exact native bytes through ZIP and private staging before atomic publication', async () => {
  const { db, store, attachment, blocks } = await fixture();
  const source = await openStoredCursorTrajectoryStream(store, attachment);
  expect(await digestBackupObject(source)).toBe(attachment.descriptor.streamSha256);
  const output = createArchiveMemorySink();
  const zip = createArchiveWriter(output.sink);
  await zip.addSource('cursor.bin', source);
  await zip.close();
  const archive = await openArchiveReader(output.blob());
  try {
    const entry = archive.entry('cursor.bin');
    if (!entry) throw new Error('Missing cursor ZIP entry.');
    const staged = await stageCursorTrajectoryStream({
      store,
      attachment,
      source: entry,
      stagingRecordingId: 'private-stage',
    });
    expect(await store.getHead({ ...staged, recordingId: 'restored' })).toBeNull();
    const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
    await publishStagedCursorTrajectoryInTransaction({
      tx,
      stagingWriter: staged,
      recordingId: 'restored',
      descriptor: attachment.descriptor,
      mintGeneration: () => crypto.randomUUID(),
    });
    await tx.done;
    expect(await store.getHead(staged)).toBeNull();
    const restored = { ...attachment, recordingId: 'restored' };
    expect(await digestBackupObject(await openStoredCursorTrajectoryStream(store, restored))).toBe(
      attachment.descriptor.streamSha256
    );
    for (const block of blocks)
      expect(
        (
          await store.readBlock(
            { recordingId: 'restored', trajectoryId: attachment.descriptor.trajectoryId },
            block.entry.sequence
          )
        )?.entry.blockSha256
      ).toBe(block.entry.blockSha256);
  } finally {
    await archive.close();
  }
});

it.each(['between-blocks', 'before-close'] as const)(
  'refuses a captured stream after source recreation at %s even when replacement bytes match',
  async (phase) => {
    const { store, attachment, identity, geometry, blocks } = await fixture();
    const source = await openStoredCursorTrajectoryStream(store, attachment);
    let writes = 0;
    const closed = vi.fn();
    const aborted = vi.fn();
    await expect(
      source.pipeTo(
        new WritableStream<Uint8Array>({
          async write() {
            writes += 1;
            if (writes !== (phase === 'between-blocks' ? 2 : blocks.length * 2)) return;
            await store.retire(identity);
            const replacement = await store.restore(identity, geometry);
            for (const block of blocks) await store.append(replacement, block);
            await store.finalize(replacement, attachment.descriptor, 'complete');
          },
          close: closed,
          abort: aborted,
        })
      )
    ).rejects.toMatchObject({ code: 'stale-writer' });
    expect(closed).not.toHaveBeenCalled();
    expect(aborted).toHaveBeenCalledOnce();
    expect((await store.getHead(identity))?.finalized).toBe(true);
  }
);

it.each(['truncated', 'hash', 'cancelled', 'storage', 'unclosed'] as const)(
  'cleans private staging on %s without changing the source',
  async (failure) => {
    const { store, attachment, identity } = await fixture();
    const source = await openStoredCursorTrajectoryStream(store, attachment);
    const controller = new AbortController();
    const sourceHead = await store.getHead(identity);
    const incoming =
      failure === 'hash'
        ? { ...attachment, descriptor: { ...attachment.descriptor, streamSha256: 'b'.repeat(64) } }
        : attachment;
    const append = store.append.bind(store);
    if (failure === 'storage')
      vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('Storage refused'));
    if (failure === 'cancelled')
      vi.spyOn(store, 'append').mockImplementationOnce(async (writer, block) => {
        await append(writer, block);
        controller.abort();
      });
    const selected =
      failure === 'truncated'
        ? {
            size: source.size,
            async pipeTo(sink: WritableStream<Uint8Array>) {
              const writer = sink.getWriter();
              try {
                await writer.write(new Uint8Array([1, 0, 0]));
                await writer.close();
              } finally {
                writer.releaseLock();
              }
            },
          }
        : failure === 'unclosed'
          ? {
              size: source.size,
              async pipeTo(sink: WritableStream<Uint8Array>) {
                const writer = sink.getWriter();
                try {
                  await source.pipeTo(
                    new WritableStream({ write: (chunk) => writer.write(chunk) })
                  );
                } finally {
                  writer.releaseLock();
                }
              },
            }
          : source;
    await expect(
      stageCursorTrajectoryStream({
        store,
        attachment: incoming,
        source: selected,
        stagingRecordingId: 'private-stage',
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(await store.getHead({ ...identity, recordingId: 'private-stage' })).toBeNull();
    expect(await store.getHead(identity)).toEqual(sourceHead);
    expect((await store.readBlock(identity, 0))?.sequence).toBe(0);
  }
);

function assetRef(assetId: string, size: number, mimeType: string): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    size,
    sha256: null,
  };
}

async function recordingArchiveFixture(includeTelemetry = true) {
  const data = await fixture();
  const { db, attachment, store } = data;
  const media = createMediaLibraryEntry({
    id: 'recording:original',
    kind: 'recording',
    source: { kind: 'recording', recordingId: 'original' },
    filename: 'original.webm',
    originalFilename: 'original.webm',
    mimeType: 'video/webm',
    size: 5,
    width: 160,
    height: 90,
    duration: 1,
  });
  await db.put(MEDIA_LIBRARY_STORE, media);
  await db.put(STORE_NAME, {
    id: 'original',
    assetId: 'source-video',
    createdAt: 1,
    filename: media.filename,
    mimeType: media.mimeType,
    size: 5,
  });
  await db.put(ASSET_REFS_STORE, assetRef('source-video', 5, 'video/webm'));
  files.set('source-video', new File(['video'], 'original.webm', { type: 'video/webm' }));
  await db.put(RECORDING_TELEMETRY_STORE, {
    recordingId: 'original',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    cursorTrajectory: attachment.descriptor,
  });
  const roots = await buildMediaRootInventory({
    db,
    cursorStore: store,
    items: [{ ...media, hasThumbnail: false }],
    options: createMediaHubBackupExportOptions({ includeTelemetry }),
    paths: createArchivePathAllocator(),
  });
  const root = roots[0];
  if (!root) throw new Error('Missing recording root.');
  const payload = await root.load();
  return { ...data, root, payload };
}

it('includes one raw history object only when recording telemetry is selected', async () => {
  const included = await recordingArchiveFixture();
  expect(included.payload.objects).toHaveLength(2);
  expect(included.payload.metadata).toMatchObject({
    recording: { cursorAttachment: { recordingId: 'original', sourceRecordingId: 'original' } },
  });
  const excluded = await recordingArchiveFixture(false);
  expect(excluded.payload.objects).toHaveLength(1);
  expect(excluded.payload.metadata).not.toHaveProperty('recording.telemetry');
  expect(excluded.payload.metadata).not.toHaveProperty('recording.cursorAttachment');
});

it.each(['duplicate', 'replace', 'rollback'] as const)(
  'publishes the real recording root with cursor history under %s',
  async (mode) => {
    const { db, store, root, payload, identity, attachment } = await recordingArchiveFixture();
    const staged = [];
    for (const [index, object] of payload.objects.entries()) {
      const assetId = `incoming-${index}`;
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const source = await openArchiveRootObjectSource(object);
      await source.pipeTo(
        new WritableStream<Uint8Array>({
          write(chunk) {
            chunks.push(new Uint8Array(chunk));
          },
        })
      );
      files.set(assetId, new File(chunks, object.ref.filename, { type: object.ref.mimeType }));
      staged.push({
        objectId: object.ref.objectId,
        ref: assetRef(assetId, object.ref.size, object.ref.mimeType),
      });
    }
    const rootKey = `media:library-item:${root.descriptor.rootId}`;
    const session: ArchiveRestoreSession = {
      operationId: 'restore-real-cursor',
      kind: 'archive-restore-session',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
      archiveFingerprint: 'a'.repeat(64),
      strategy: mode === 'duplicate' ? 'duplicate' : 'replace',
      committedRoots: [],
      conflictedRoots: [],
      skippedRoots: [],
      rootIdMap: {},
      childIdMap: {},
      currentRoot: mode === 'rollback' ? 'another-root' : rootKey,
    };
    await db.put(ASSET_OPERATIONS_STORE, session);
    const before = await store.getHead(identity);
    const publish = mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: root.descriptor,
        metadata: payload.metadata,
        objects: payload.objects.map((object) => object.ref),
      },
      staged,
      session,
      journal: {
        journalId: 'real-cursor-journal',
        domain: 'archive-restore-root',
        operationId: session.operationId,
        createdAt: 1,
        assetRefs: staged.map((object) => object.ref),
        payload: { rootKey },
      },
    });
    if (mode === 'rollback') {
      await expect(publish).rejects.toThrow();
      expect(await store.getHead(identity)).toEqual(before);
      expect((await db.get(STORE_NAME, 'original'))?.assetId).toBe('source-video');
      await retireJournalCursorTrajectoryStages('real-cursor-journal');
      expect(await store.getHead(identity)).toEqual(before);
      return;
    }
    expect(await publish).toMatchObject({ imported: true });
    const completed: unknown = await db.get(ASSET_OPERATIONS_STORE, session.operationId);
    expect(completed).toMatchObject({ committedRoots: [rootKey] });
    const rows: unknown[] = await db.getAll(STORE_NAME);
    const restored = rows.find(
      (row) =>
        typeof row === 'object' && row !== null && 'assetId' in row && row.assetId === 'incoming-0'
    );
    if (
      typeof restored !== 'object' ||
      restored === null ||
      !('id' in restored) ||
      typeof restored.id !== 'string'
    )
      throw new Error('Restored recording is missing.');
    expect(mode === 'duplicate' ? restored.id !== 'original' : restored.id === 'original').toBe(
      true
    );
    const head = await store.getHead({ ...identity, recordingId: restored.id });
    expect(head?.sourceRecordingId).toBe('original');
    expect(head?.streamSha256).toBe(attachment.descriptor.streamSha256);
    expect(head?.stagingJournalId).toBeUndefined();
    expect(
      await digestBackupObject(
        await openStoredCursorTrajectoryStream(store, { ...attachment, recordingId: restored.id })
      )
    ).toBe(attachment.descriptor.streamSha256);
  }
);

it('exports and inspects a real recording archive with the cursor layout fence', async () => {
  const { root, store, db } = await recordingArchiveFixture();
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: buildMediaHubBackupExportPlanV6({
      roots: [root],
      layout: 'library-folders-v3',
      privacy: { includeSourceMetadata: true, includeTelemetry: true, includeWebSnapshots: false },
    }),
    sink: output.sink,
  });
  const inspected = await inspectMediaHubBackupV6(output.blob());
  expect(inspected.manifest.layout).toBe('library-folders-v5');
  expect(inspected.manifest.totals.objects).toBe(3);
  const media = await db.get(MEDIA_LIBRARY_STORE, 'recording:original');
  await expect(
    buildMediaRootInventory({
      db,
      items: [{ ...media, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    })
  ).rejects.toThrow('requires its frozen source');
  expect(
    (await store.getHead({ recordingId: 'original', trajectoryId: 'a'.repeat(32) }))?.finalized
  ).toBe(true);
});

it(
  'exports a frozen immutable snapshot after source deletion without reading live blocks ' +
    'or leaking native refs',
  async () => {
    const { db, store, attachment, identity } = await recordingArchiveFixture();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    await (
      await openStoredCursorTrajectoryStream(store, attachment)
    ).pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(new Uint8Array(chunk));
        },
      })
    );
    const file = new File(chunks, 'cursor.bin', { type: 'application/octet-stream' });
    const snapshot = {
      sourceRecordingId: attachment.sourceRecordingId,
      width: attachment.width,
      height: attachment.height,
      ref: {
        ...assetRef('immutable-cursor-file', file.size, file.type),
        sha256: attachment.descriptor.streamSha256,
      },
    };
    files.set(snapshot.ref.assetId, file);
    const media = await db.get(MEDIA_LIBRARY_STORE, 'recording:original');
    const recording = await db.get(STORE_NAME, 'original');
    const ref = await db.get(ASSET_REFS_STORE, 'source-video');
    const telemetry = {
      ...(await db.get(RECORDING_TELEMETRY_STORE, 'original')),
      cursorTrajectorySnapshot: snapshot,
    };
    const frozen = frozenReviewDatabase({
      source: { media, recording, ref, telemetry },
      assets: [],
      refs: [],
      media: [],
      privateReviews: [],
    });
    await db.delete(MEDIA_LIBRARY_STORE, media.id);
    await db.delete(STORE_NAME, recording.id);
    await db.delete(RECORDING_TELEMETRY_STORE, recording.id);
    await store.retire(identity);
    const roots = await buildMediaRootInventory({
      db: frozen,
      items: [{ ...media, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    const payload = await roots[0]!.load();
    expect(payload.objects).toHaveLength(2);
    expect(payload.metadata).toMatchObject({
      recording: {
        cursorAttachment: { sourceRecordingId: 'original', descriptor: attachment.descriptor },
      },
    });
    expect(payload.metadata).not.toHaveProperty('recording.telemetry.cursorTrajectorySnapshot');
    expect(JSON.stringify(payload.metadata)).not.toContain(snapshot.ref.assetId);
    const history = payload.objects.find((object) => object.ref.filename.endsWith('-cursor.bin'));
    if (!history) throw new Error('Frozen history object is missing.');
    expect(await digestBackupObject(await openArchiveRootObjectSource(history))).toBe(
      attachment.descriptor.streamSha256
    );
    expect(await store.getHead(identity)).toBeNull();
  }
);

async function syncCursorFixture(source?: Awaited<ReturnType<typeof recordingArchiveFixture>>) {
  const data = source ?? (await recordingArchiveFixture());
  const verifiedObjects = new Map<string, AssetRef>();
  for (const [index, object] of data.payload.objects.entries()) {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const source = await openArchiveRootObjectSource(object);
    await source.pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(new Uint8Array(chunk));
        },
      })
    );
    const ref = {
      ...assetRef(`sync-cursor-${index}`, source.size, object.ref.mimeType),
      sha256: await digestBackupObject(source),
    };
    files.set(ref.assetId, new File(chunks, object.ref.filename, { type: object.ref.mimeType }));
    verifiedObjects.set(object.ref.objectId, ref);
  }
  const payload = await preparePortableReplica({
    envelope: {
      descriptor: data.root.descriptor,
      metadata: data.payload.metadata,
      objects: data.payload.objects.map((object) => object.ref),
    },
    verifiedObjects,
    senderDependencies: [],
    admission: {
      operationId: 'remote-cursor',
      sourceDigest: 'b'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  if (payload.kind !== 'media' || !('recording' in payload.input.rows))
    throw new Error('Expected recording.');
  await data.db.delete(MEDIA_LIBRARY_STORE, payload.input.rows.media.id);
  await data.db.delete(STORE_NAME, 'original');
  await data.db.delete(RECORDING_TELEMETRY_STORE, 'original');
  await data.store.retire(data.identity);
  await data.db.put('sync_capture', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  return { ...data, input: payload.input };
}

it('admits a portable cursor stream and commits its blocks, native owner and sync receipt together', async () => {
  const { db, store, identity, attachment, input } = await syncCursorFixture();
  await expect(applyPreparedMediaReplica(input, undefined, 'sync-cursor-journal')).resolves.toEqual(
    { status: 'applied', generation: 1 }
  );
  const head = await store.getHead(identity);
  expect(head).toMatchObject({
    streamSha256: attachment.descriptor.streamSha256,
    totalBlocks: attachment.descriptor.totalBlocks,
    totalSamples: attachment.descriptor.totalSamples,
    finalized: true,
    snapshotAssetId: 'sync-cursor-1',
  });
  expect(head?.stagingJournalId).toBeUndefined();
  expect(
    await db.get('asset_owners', ['recording', 'original', 'cursor-trajectory'])
  ).toMatchObject({ assetId: head?.snapshotAssetId });
  expect(
    (await db.get(RECORDING_TELEMETRY_STORE, 'original')).cursorTrajectorySnapshot.ref.assetId
  ).toBe(head?.snapshotAssetId);
  const before = await store.getHead(identity);
  // Duplicate receipt does not reopen the immutable file or replace the published generation.
  files.clear();
  await expect(applyPreparedMediaReplica(input, undefined, 'sync-cursor-journal')).resolves.toEqual(
    { status: 'duplicate', generation: 1 }
  );
  expect(await store.getHead(identity)).toEqual(before);
});

it.each(['corrupt', 'profile-changed', 'head-conflict'] as const)(
  'refuses cursor sync %s without publishing partial history',
  async (failure) => {
    const { db, store, identity, input } = await syncCursorFixture();
    const before = await store.getHead(identity);
    if (failure === 'corrupt')
      files.set(
        'sync-cursor-1',
        new File([new Uint8Array(files.get('sync-cursor-1')!.size)], 'cursor.bin', {
          type: 'application/octet-stream',
        })
      );
    if (failure === 'profile-changed') {
      const profile = await db.get('sync_capture', 'profile');
      await db.put('sync_capture', { ...profile, connectionGeneration: 4 });
    }
    if (failure === 'head-conflict') {
      // Publication detects invalid destination state after writing source rows and receipt.
      // The parent transaction must roll back all these writes.
      await db.put(HEADS, { recordingId: 'original', trajectoryId: 'b'.repeat(32) });
    }
    await expect(
      applyPreparedMediaReplica(input, undefined, 'sync-cursor-journal')
    ).rejects.toThrow();
    expect(await store.getHead(identity)).toEqual(before);
    expect(await db.get(STORE_NAME, 'original')).toBeUndefined();
    expect(
      (await db.getAll('sync_capture')).filter((row) => row.kind === 'applied-operation')
    ).toEqual([]);
    expect(
      (await db.getAll(HEADS)).filter(
        (row) => row.stagingJournalId === 'sync-cursor-journal' && !row.retired
      )
    ).toEqual([]);
  }
);

it('accepts one parallel cursor publication and retains the winner on an exact retry', async () => {
  const { store, identity, input } = await syncCursorFixture();
  const results = await Promise.allSettled([
    applyPreparedMediaReplica(input, undefined, 'parallel-cursor-journal'),
    applyPreparedMediaReplica(input, undefined, 'parallel-cursor-journal'),
  ]);
  expect(
    results.some((result) => result.status === 'fulfilled' && result.value.status === 'applied')
  ).toBe(true);
  const head = await store.getHead(identity);
  expect(head).toMatchObject({ finalized: true, snapshotAssetId: 'sync-cursor-1' });
  await expect(
    applyPreparedMediaReplica(input, undefined, 'parallel-cursor-journal')
  ).resolves.toEqual({ status: 'duplicate', generation: 1 });
  expect(await store.getHead(identity)).toEqual(head);
});

it('publishes a successor with the same immutable history without losing its native file owner', async () => {
  const { db, store, identity, input } = await syncCursorFixture();
  await applyPreparedMediaReplica(input, undefined, 'first-cursor-journal');
  const head = await store.getHead(identity);
  const next = {
    ...input,
    operationId: 'cursor-successor',
    sourceDigest: 'c'.repeat(64),
    expectedLocalGeneration: 1,
    expectedBasis: [input.operationId],
  };
  await expect(applyPreparedMediaReplica(next, undefined, 'next-cursor-journal')).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(await store.getHead(identity)).toMatchObject({
    snapshotAssetId: head?.snapshotAssetId,
    streamSha256: head?.streamSha256,
    totalSamples: head?.totalSamples,
  });
  expect((await store.getHead(identity))?.writerGeneration).not.toBe(head?.writerGeneration);
  expect(
    await db.get('asset_owners', ['recording', 'original', 'cursor-trajectory'])
  ).toMatchObject({ assetId: 'sync-cursor-1' });
  expect(
    (await db.getAll('sync_capture')).filter((row) => row.kind === 'applied-operation')
  ).toHaveLength(2);
});

async function eventsArchiveFixture(includeCursor = false) {
  const data = await recordingArchiveFixture();
  const eventsStore = createRecordingEventsStore({
    database: async () => data.db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const eventsIdentity = { recordingId: 'original', eventStreamId: 'b'.repeat(32) };
  const writer = await eventsStore.begin(eventsIdentity);
  const packer = createRecordingEventsBlockPacker(
    eventsIdentity.recordingId,
    eventsIdentity.eventStreamId
  );
  const blocks = eventsFixture.blocks.flatMap((block) =>
    block.value.records.flatMap((record) => packer.append(record))
  );
  blocks.push(...packer.finish());
  for (const block of blocks) await eventsStore.append(writer, block);
  const descriptor = {
    ...eventsFixture.descriptor,
    eventStreamId: eventsIdentity.eventStreamId,
    ...packer.summary(),
  };
  if (!isRecordingEventsDescriptor(descriptor)) throw new Error('Invalid event fixture.');
  await eventsStore.finalize(writer, descriptor);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const stream = await openRecordingEventsStream(eventsStore, eventsIdentity, descriptor);
  await stream.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(new Uint8Array(chunk));
      },
    })
  );
  const file = new File(chunks, 'events.bin', { type: 'application/octet-stream' });
  const ref = {
    ...assetRef('immutable-events-file', file.size, file.type),
    sha256: descriptor.streamSha256,
  };
  files.set(ref.assetId, file);
  const tx = data.db.transaction(
    [RECORDING_EVENTS_STORE, ASSET_REFS_STORE, ASSET_OWNERS_STORE],
    'readwrite'
  );
  await tx.objectStore(ASSET_REFS_STORE).put(ref);
  await tx.objectStore(ASSET_OWNERS_STORE).put({
    assetId: ref.assetId,
    ownerKind: 'recording',
    ownerId: 'original',
    role: 'recording-events',
  });
  await linkRecordingEventsSnapshotInTransaction(tx, writer, ref.assetId);
  await tx.done;
  const telemetry = parseRecordingTelemetryEntry(
    await data.db.get(RECORDING_TELEMETRY_STORE, 'original')
  );
  if (!telemetry) throw new Error('Missing source telemetry.');
  if (!includeCursor) delete telemetry.cursorTrajectory;
  telemetry.recordingEvents = descriptor;
  telemetry.recordingEventsSnapshot = { ref, sourceRecordingId: 'original' };
  await data.db.put(RECORDING_TELEMETRY_STORE, telemetry);
  const media = await data.db.get(MEDIA_LIBRARY_STORE, 'recording:original');
  const roots = await buildMediaRootInventory({
    db: data.db,
    cursorStore: data.store,
    items: [{ ...media, hasThumbnail: false }],
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const root = roots[0];
  if (!root) throw new Error('Missing events root.');
  const payload = await root.load();
  return {
    ...data,
    eventsStore,
    eventsIdentity,
    eventsDescriptor: descriptor,
    eventsRef: ref,
    root,
    payload,
  };
}

it.each([false, true])(
  'exports original event bytes with the v5 fence and optional cursor; cursor=%s',
  async (includeCursor) => {
    const data = await eventsArchiveFixture(includeCursor);
    expect(data.payload.objects).toHaveLength(includeCursor ? 3 : 2);
    expect(data.payload.metadata).toMatchObject({
      recording: {
        eventsAttachment: { sourceRecordingId: 'original', descriptor: data.eventsDescriptor },
      },
    });
    expect(JSON.stringify(data.payload.metadata)).not.toContain(data.eventsRef.assetId);
    const output = createArchiveMemorySink();
    await exportMediaHubBackupV6({
      plan: buildMediaHubBackupExportPlanV6({
        roots: [data.root],
        layout: 'library-folders-v3',
        privacy: {
          includeSourceMetadata: true,
          includeTelemetry: true,
          includeWebSnapshots: false,
        },
      }),
      sink: output.sink,
    });
    expect((await inspectMediaHubBackupV6(output.blob())).manifest.layout).toBe(
      'library-folders-v5'
    );
  }
);

it.each(['duplicate', 'replace', 'rollback'] as const)(
  'restores event history with the real recording root under %s',
  async (mode) => {
    const data = await eventsArchiveFixture(true);
    const staged = [];
    for (const [index, object] of data.payload.objects.entries()) {
      const source = await openArchiveRootObjectSource(object);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      await source.pipeTo(
        new WritableStream<Uint8Array>({
          write(chunk) {
            chunks.push(new Uint8Array(chunk));
          },
        })
      );
      const ref = {
        ...assetRef(`incoming-events-${index}`, source.size, object.ref.mimeType),
        sha256: await digestBackupObject(source),
      };
      files.set(ref.assetId, new File(chunks, object.ref.filename, { type: object.ref.mimeType }));
      staged.push({ objectId: object.ref.objectId, ref });
    }
    const rootKey = `media:library-item:${data.root.descriptor.rootId}`;
    const session: ArchiveRestoreSession = {
      operationId: 'restore-real-events',
      kind: 'archive-restore-session',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
      archiveFingerprint: 'a'.repeat(64),
      strategy: mode === 'duplicate' ? 'duplicate' : 'replace',
      committedRoots: [],
      conflictedRoots: [],
      skippedRoots: [],
      rootIdMap: {},
      childIdMap: {},
      currentRoot: mode === 'rollback' ? 'another-root' : rootKey,
    };
    await data.db.put(ASSET_OPERATIONS_STORE, session);
    const before = await data.eventsStore.getHead(data.eventsIdentity);
    const result = mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: data.root.descriptor,
        metadata: data.payload.metadata,
        objects: data.payload.objects.map((object) => object.ref),
      },
      staged,
      session,
      journal: {
        journalId: 'real-events-journal',
        domain: 'archive-restore-root',
        operationId: session.operationId,
        createdAt: 1,
        assetRefs: staged.map((object) => object.ref),
        payload: { rootKey },
      },
    });
    if (mode === 'rollback') {
      await expect(result).rejects.toThrow();
      expect(await data.eventsStore.getHead(data.eventsIdentity)).toEqual(before);
      await retireJournalRecordingEventStages('real-events-journal');
      return;
    }
    expect(await result).toMatchObject({ imported: true });
    const recordings: unknown[] = await data.db.getAll(STORE_NAME);
    const restored = recordings.find(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'assetId' in row &&
        row.assetId === 'incoming-events-0'
    );
    if (
      typeof restored !== 'object' ||
      restored === null ||
      !('id' in restored) ||
      typeof restored.id !== 'string'
    )
      throw new Error('Missing restored recording.');
    const identity = { ...data.eventsIdentity, recordingId: restored.id };
    const head = await data.eventsStore.getHead(identity);
    expect(head).toMatchObject({
      sourceRecordingId: 'original',
      finalized: true,
      streamSha256: data.eventsDescriptor.streamSha256,
    });
    expect(head?.stagingJournalId).toBeUndefined();
    expect(
      await digestBackupObject(
        await openRecordingEventsStream(data.eventsStore, identity, data.eventsDescriptor)
      )
    ).toBe(data.eventsDescriptor.streamSha256);
    const page = await createRecordingEventsReader({ database: async () => data.db }).readPage({
      identity,
      descriptor: data.eventsDescriptor,
      fromTimeUs: 0,
      toTimeUs: 9000000,
    });
    expect(page.facts.length).toBeGreaterThan(0);
    expect(
      await data.db.get(ASSET_OWNERS_STORE, ['recording', restored.id, 'recording-events'])
    ).toMatchObject({ assetId: head?.snapshotAssetId });
  }
);

async function syncEventsFixture(includeCursor = true) {
  const data = await eventsArchiveFixture(includeCursor);
  const { input } = await syncCursorFixture(data);
  await data.eventsStore.retire(data.eventsIdentity);
  await data.db.delete(ASSET_OWNERS_STORE, ['recording', 'original', 'recording-events']);
  await data.db.delete(ASSET_REFS_STORE, data.eventsRef.assetId);
  return { ...data, input };
}

it.each([false, true])(
  'publishes event sync and its receipt atomically, with optional cursor=%s',
  async (includeCursor) => {
    const data = await syncEventsFixture(includeCursor);
    await expect(
      applyPreparedMediaReplica(data.input, undefined, 'sync-events-journal')
    ).resolves.toEqual({ status: 'applied', generation: 1 });
    const head = await data.eventsStore.getHead(data.eventsIdentity);
    expect(head).toMatchObject({
      streamSha256: data.eventsDescriptor.streamSha256,
      finalized: true,
    });
    expect(head?.stagingJournalId).toBeUndefined();
    expect(
      await data.db.get(ASSET_OWNERS_STORE, ['recording', 'original', 'recording-events'])
    ).toMatchObject({ assetId: head?.snapshotAssetId });
    const saved = parseRecordingTelemetryEntry(
      await data.db.get(RECORDING_TELEMETRY_STORE, 'original')
    );
    expect(saved?.recordingEventsSnapshot?.ref.assetId).toBe(head?.snapshotAssetId);
    if (includeCursor) expect((await data.store.getHead(data.identity))?.finalized).toBe(true);
    const before = await data.eventsStore.getHead(data.eventsIdentity);
    files.clear();
    await expect(
      applyPreparedMediaReplica(data.input, undefined, 'sync-events-journal')
    ).resolves.toEqual({ status: 'duplicate', generation: 1 });
    expect(await data.eventsStore.getHead(data.eventsIdentity)).toEqual(before);
  }
);

it.each(['corrupt', 'profile-changed', 'head-conflict'] as const)(
  'refuses event sync %s without partial metadata, owners or receipt',
  async (failure) => {
    const data = await syncEventsFixture();
    const before = await data.eventsStore.getHead(data.eventsIdentity);
    if (!('recording' in data.input.rows)) throw new Error('Expected recording.');
    const snapshot = data.input.rows.telemetry?.recordingEventsSnapshot;
    if (!snapshot) throw new Error('Expected event snapshot.');
    if (failure === 'corrupt')
      files.set(
        snapshot.ref.assetId,
        new File([new Uint8Array(snapshot.ref.size)], 'events.bin', { type: snapshot.ref.mimeType })
      );
    if (failure === 'profile-changed') {
      const profile = await data.db.get('sync_capture', 'profile');
      await data.db.put('sync_capture', { ...profile, connectionGeneration: 4 });
    }
    if (failure === 'head-conflict')
      await data.db.put(RECORDING_EVENTS_STORE, {
        recordingId: 'original',
        eventStreamId: 'e'.repeat(32),
        kind: 'head',
        entryId: 0,
      });
    await expect(
      applyPreparedMediaReplica(data.input, undefined, 'sync-events-journal')
    ).rejects.toThrow();
    expect(await data.eventsStore.getHead(data.eventsIdentity)).toEqual(before);
    expect(await data.db.get(STORE_NAME, 'original')).toBeUndefined();
    expect(
      (await data.db.getAll('sync_capture')).filter((row) => row.kind === 'applied-operation')
    ).toEqual([]);
    const heads: unknown[] = await data.db.getAllFromIndex(RECORDING_EVENTS_STORE, 'kind', 'head');
    expect(
      heads.filter(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          'stagingJournalId' in row &&
          row.stagingJournalId === 'sync-events-journal' &&
          'retired' in row &&
          !row.retired
      )
    ).toEqual([]);
  }
);

it('cleans a later staged attempt after a parallel winner commits without touching the winner', async () => {
  const data = await syncEventsFixture();
  if (!('recording' in data.input.rows)) throw new Error('Expected recording.');
  const snapshot = data.input.rows.telemetry?.recordingEventsSnapshot;
  if (!snapshot) throw new Error('Missing event snapshot.');
  let releaseFirst!: () => void, releaseSecond!: () => void, bothEntered!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    bothEntered = resolve;
  });
  let reads = 0;
  vi.spyOn(assetIo, 'readAssetFile').mockImplementation(async (ref) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing fixture file.');
    if (ref.assetId === snapshot.ref.assetId) {
      reads++;
      if (reads === 2) bothEntered();
      await (reads === 1 ? firstGate : secondGate);
    }
    return file;
  });
  const first = applyPreparedMediaReplica(data.input, undefined, 'ordered-events-journal');
  const second = applyPreparedMediaReplica(data.input, undefined, 'ordered-events-journal');
  const completed = Promise.allSettled([first, second]);
  await entered;
  releaseFirst();
  await Promise.race([first, second]);
  const winner = await data.eventsStore.getHead(data.eventsIdentity);
  releaseSecond();
  const outcomes = await completed;
  expect(outcomes.every((result) => result.status === 'fulfilled')).toBe(true);
  expect(await data.eventsStore.getHead(data.eventsIdentity)).toEqual(winner);
  const heads: unknown[] = await data.db.getAllFromIndex(RECORDING_EVENTS_STORE, 'kind', 'head');
  expect(
    heads.filter(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'stagingJournalId' in row &&
        row.stagingJournalId === 'ordered-events-journal' &&
        'retired' in row &&
        !row.retired
    )
  ).toEqual([]);
});

it('exports a frozen event snapshot after source deletion without a live event database', async () => {
  const data = await eventsArchiveFixture(false);
  const media = await data.db.get(MEDIA_LIBRARY_STORE, 'recording:original');
  const recording = await data.db.get(STORE_NAME, 'original');
  const ref = await data.db.get(ASSET_REFS_STORE, 'source-video');
  const telemetry = parseRecordingTelemetryEntry(
    await data.db.get(RECORDING_TELEMETRY_STORE, 'original')
  );
  if (!telemetry) throw new Error('Missing captured metadata.');
  const frozen = frozenReviewDatabase({
    source: { media, recording, ref, telemetry },
    assets: [],
    refs: [],
    media: [],
    privateReviews: [],
  });
  await data.db.delete(MEDIA_LIBRARY_STORE, media.id);
  await data.db.delete(STORE_NAME, recording.id);
  await data.db.delete(RECORDING_TELEMETRY_STORE, recording.id);
  await data.eventsStore.retire(data.eventsIdentity);
  const roots = await buildMediaRootInventory({
    db: frozen,
    items: [{ ...media, hasThumbnail: false }],
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const payload = await roots[0]!.load();
  expect(payload.objects).toHaveLength(2);
  expect(payload.metadata).toMatchObject({
    recording: {
      eventsAttachment: { sourceRecordingId: 'original', descriptor: data.eventsDescriptor },
    },
  });
  expect(JSON.stringify(payload.metadata)).not.toContain(data.eventsRef.assetId);
  expect(payload.metadata).not.toHaveProperty('recording.telemetry.recordingEventsSnapshot');
  const history = payload.objects.find((object) => object.ref.filename.endsWith('-events.bin'));
  if (!history) throw new Error('Missing frozen events.');
  expect(await digestBackupObject(await openArchiveRootObjectSource(history))).toBe(
    data.eventsDescriptor.streamSha256
  );
});

it.each([false, true])(
  'cleans event staging through failed restore orchestration, cleanup refuses=%s',
  async (refuseCleanup) => {
    const opfs = createHarness();
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: opfs.options.getOriginRoot,
        estimate: async () => ({}),
      },
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: (lock: object) => Promise<unknown>
        ) => operation({}),
      },
    });
    const data = await eventsArchiveFixture(true);
    const sourceHead = await data.eventsStore.getHead(data.eventsIdentity);
    const originalRecording = await data.db.get(STORE_NAME, 'original');
    const output = createArchiveMemorySink();
    await exportMediaHubBackupV6({
      plan: buildMediaHubBackupExportPlanV6({
        roots: [data.root],
        layout: 'library-folders-v3',
        privacy: {
          includeSourceMetadata: true,
          includeTelemetry: true,
          includeWebSnapshots: false,
        },
      }),
      sink: output.sink,
    });
    const file = output.blob();
    const inspection = await inspectMediaHubBackupV6(file);
    const session: ArchiveRestoreSession = {
      operationId: 'failed-events-restore',
      kind: 'archive-restore-session',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
      archiveFingerprint: inspection.fingerprint,
      strategy: 'duplicate',
      committedRoots: [],
      conflictedRoots: [],
      skippedRoots: [],
      rootIdMap: {},
      childIdMap: {},
      currentRoot: null,
    };
    await data.db.put(ASSET_OPERATIONS_STORE, session);
    vi.spyOn(restoreSessions, 'verifyMediaHubRestoreResume').mockResolvedValue({
      inspection,
      session,
    });
    if (refuseCleanup)
      vi.spyOn(eventStages, 'retireJournalRecordingEventStages').mockRejectedValueOnce(
        new Error('Private event cleanup refused')
      );
    const journals: AssetReadyJournal[] = [];
    const stagedRefs: AssetRef[] = [];
    const result = restoreMediaHubBackupV6({
      file,
      operationId: session.operationId,
      publishers: [
        {
          profile: mediaLibraryRootPublisher.profile,
          async publish(args) {
            journals.push(args.journal);
            for (const staged of args.staged) {
              if (!stagedRefs.some((ref) => ref.assetId === staged.ref.assetId))
                stagedRefs.push(staged.ref);
              files.set(
                staged.ref.assetId,
                await physicalAssets.readAssetFile(staged.ref, 'staged')
              );
            }
            // A controlled concurrent session change refuses the final root transaction after history staging.
            await data.db.put(ASSET_OPERATIONS_STORE, {
              ...args.session,
              currentRoot: 'another-root',
            });
            return mediaLibraryRootPublisher.publish(args);
          },
        },
      ],
    });
    await expect(result).rejects.toThrow(
      refuseCleanup ? 'ready journal cleanup failed' : 'root checkpoint does not match'
    );
    const journal = journals[0];
    if (!journal) throw new Error('Restore did not reach root publication.');
    const rows: unknown[] = await data.db.getAll(RECORDING_EVENTS_STORE);
    const privateHeads = rows
      .filter(isRecord)
      .filter((row) => row['kind'] === 'head' && row['stagingJournalId'] === journal.journalId);
    expect(privateHeads.length).toBeGreaterThan(0);
    const identities = new Set(privateHeads.map((row) => row['recordingId']));
    const privateData = rows
      .filter(isRecord)
      .filter((row) => identities.has(row['recordingId']) && row['kind'] !== 'head');
    const ready = await physicalAssets.listReadyJournals();
    if (refuseCleanup) {
      expect(privateHeads.every((row) => row['retired'] === false)).toBe(true);
      expect(privateData.length).toBeGreaterThan(0);
      expect(ready.some((row) => row.journalId === journal.journalId)).toBe(true);
      for (const ref of stagedRefs)
        await expect(physicalAssets.readAssetFile(ref, 'pending')).resolves.toHaveProperty(
          'size',
          ref.size
        );
      expect(await data.db.get(ASSET_OPERATIONS_STORE, session.operationId)).toMatchObject({
        status: 'pending',
      });
      await recoverPendingAssetPublications();
      const recoveredRows: unknown[] = await data.db.getAll(RECORDING_EVENTS_STORE);
      expect(
        recoveredRows
          .filter(isRecord)
          .filter((row) => identities.has(row['recordingId']) && row['kind'] !== 'head')
      ).toEqual([]);
      expect(
        (await physicalAssets.listReadyJournals()).some(
          (row) => row.journalId === journal.journalId
        )
      ).toBe(false);
    } else {
      expect(privateHeads.every((row) => row['retired'] === true)).toBe(true);
      expect(privateData).toEqual([]);
      expect(ready).toEqual([]);
      for (const ref of stagedRefs)
        await expect(physicalAssets.readAssetFile(ref, 'discarded')).rejects.toThrow();
      expect(await data.db.get(ASSET_OPERATIONS_STORE, session.operationId)).toMatchObject({
        status: 'aborted',
      });
    }
    expect(await data.eventsStore.getHead(data.eventsIdentity)).toEqual(sourceHead);
    expect(await data.db.get(STORE_NAME, 'original')).toEqual(originalRecording);
  }
);
