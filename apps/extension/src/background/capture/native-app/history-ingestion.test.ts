import { cleanupStaleNativeTransferSessions } from './persistence/staging';
import { sha256 } from '@noble/hashes/sha2.js';
import { createNativeRecordingHistoryIngestion } from './history-ingestion';
import { parseNativeHistoryInboundMessage } from '../../../contracts/native-app/parser-attachments';
import { readPublishedNativeHistory } from '../../../composition/persistence/recordings/native-history/publication';
import * as captureOwner from '../../../composition/persistence/sync-capture/capture';
import { createMediaLibraryEntry } from '../../../composition/persistence/projects/index.test-support';
import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import { createHarness } from '../../../composition/persistence/assets/opfs-store.test-support';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  STORE_NAME,
  MEDIA_LIBRARY_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
} from '../../../composition/persistence/infrastructure/indexed-db/core.stores';
import {
  saveNativeRecordingHistory,
  getRecordingTelemetry,
} from '../../../composition/persistence/recordings/telemetry';
import { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';

const navigation = vi.hoisted(() => ({ open: vi.fn(async () => undefined) }));
vi.mock('../../../platform/navigation/extension-pages', async (original) => ({
  ...(await original<typeof import('../../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: navigation.open,
}));
let database: IDBPDatabase;
let databaseName: string;
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
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
  navigation.open.mockClear();
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
it(
  'runs the live receiver from manifest requests through original chunks to a ' +
    'post-publication receipt and delayed editor opening',
  async () => {
    if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
    const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
    await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
      ...parent,
      metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
    });
    const ingestion = createNativeRecordingHistoryIngestion({
      currentLeaseId: () => 'lease',
      enabled: () => true,
    });
    let responses = await ingestion.resume(recordingId, 'lease');
    expect(responses).toHaveLength(1);
    expect(responses[0]?.type).toBe('extension.recording.events.manifest.request');
    expect(navigation.open).not.toHaveBeenCalled();
    let blocks = 0;
    for (let turn = 0; turn < 20; turn++) {
      const request = responses[0];
      if (!request || request.type === 'extension.recording.events.ack') break;
      if (
        request.type !== 'extension.recording.events.manifest.request' &&
        request.type !== 'extension.recording.events.chunk.request'
      )
        throw new Error('Unexpected request.');
      let raw: unknown;
      if (request.type === 'extension.recording.events.manifest.request') {
        raw = {
          protocolVersion: 2,
          controllerLeaseId: request.controllerLeaseId,
          recordingId: request.recordingId,
          eventStreamId: request.eventStreamId,
          requestId: request.requestId,
          type: 'app.recording.events.manifest',
          descriptor: eventsFixture.descriptor,
          fromSequence: request.nextSequence,
          entries: eventsFixture.manifest.slice(request.nextSequence),
          nextSequence: null,
        };
      } else {
        const bytes = new TextEncoder().encode(eventsFixture.blocks[request.sequence]!.utf8);
        const part = bytes.slice(request.chunkIndex * 32768, (request.chunkIndex + 1) * 32768);
        const hash = Array.from(sha256(part), (byte) => byte.toString(16).padStart(2, '0')).join(
          ''
        );
        raw = {
          ...request,
          type: 'app.recording.events.chunk',
          blockBytes: bytes.length,
          blockSha256: eventsFixture.manifest[request.sequence]!.blockSha256,
          chunkCount: Math.ceil(bytes.length / 32768),
          chunkByteOffset: request.chunkIndex * 32768,
          chunkRawBytes: part.length,
          chunkSha256: hash,
          base64: btoa(String.fromCharCode(...part)),
        };
        blocks++;
      }
      const parsed = parseNativeHistoryInboundMessage(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      responses = await ingestion.handle(parsed.value);
      if (blocks < eventsFixture.blocks.length) {
        expect(
          responses.every((message) => message.type !== 'extension.recording.events.ack')
        ).toBe(true);
        expect(navigation.open).not.toHaveBeenCalled();
      }
    }
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'extension.recording.events.ack',
        receipt: {
          version: 1,
          durable: true,
          format: 'recording-events-v1',
          state: eventsFixture.descriptor.state,
          totalBlocks: eventsFixture.descriptor.totalBlocks,
          totalRecords: eventsFixture.descriptor.totalRecords,
          totalBytes: eventsFixture.descriptor.totalBytes,
          streamSha256: eventsFixture.descriptor.streamSha256,
        },
      }),
    ]);
    expect(await readPublishedNativeHistory(recordingId, 'events')).not.toBeNull();
    expect(navigation.open).toHaveBeenCalledOnce();
    expect(await ingestion.resume(recordingId, 'lease')).toEqual([]);
    expect(await ingestion.resume(recordingId, 'lease', true)).toEqual([
      expect.objectContaining({ type: 'extension.recording.events.ack' }),
    ]);
    expect(navigation.open).toHaveBeenCalledOnce();
  }
);
it('keeps live history disabled until negotiation and refuses a stale lease before opening an intent', async () => {
  const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    ...parent,
    metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
  });
  const disabled = createNativeRecordingHistoryIngestion({
    currentLeaseId: () => 'lease',
    enabled: () => false,
  });
  expect(await disabled.resume(recordingId, 'lease')).toEqual([]);
  const enabled = createNativeRecordingHistoryIngestion({
    currentLeaseId: () => 'new-lease',
    enabled: () => true,
  });
  expect(await enabled.resume(recordingId, 'lease')).toEqual([]);
  expect(await createNativeRecordingHistoryStore().read(recordingId)).toBeNull();
});

it('keeps the live receipt pending after a publication failure and issues it only after retry succeeds', async () => {
  const { owner } = await acceptedEvents();
  const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    ...parent,
    metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
  });
  const ingestion = createNativeRecordingHistoryIngestion({
    currentLeaseId: () => 'lease',
    enabled: () => true,
  });
  const failure = vi
    .spyOn(captureOwner, 'captureMediaInTransaction')
    .mockRejectedValue(new Error('disk-full'));
  expect(await ingestion.resume(recordingId, 'lease')).toEqual([]);
  expect((await owner.read(recordingId))?.events?.pull).toEqual({ kind: 'verified' });
  expect(navigation.open).not.toHaveBeenCalled();
  failure.mockRestore();
  expect(await ingestion.resume(recordingId, 'lease')).toEqual([
    expect.objectContaining({ type: 'extension.recording.events.ack' }),
  ]);
  expect(navigation.open).toHaveBeenCalledOnce();
});

it(
  'accepts availability on a new lease for the exact durable video without reloading MP4 ' +
    'or replacing the accepted writer',
  async () => {
    const { owner, writer } = await acceptedEvents();
    const before = await owner.read(recordingId);
    const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
    await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
      ...parent,
      metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
    });
    const ingestion = createNativeRecordingHistoryIngestion({
      currentLeaseId: () => 'lease-B',
      enabled: () => true,
    });
    const available = parseNativeHistoryInboundMessage({
      protocolVersion: 2,
      type: 'app.recording.events.available',
      controllerLeaseId: 'lease-B',
      recordingId,
      eventStreamId: eventsFixture.eventStreamId,
      videoSha256: 'd'.repeat(64),
      descriptor: eventsFixture.descriptor,
    });
    if (!available.ok) throw new Error(available.error);
    const responses = await ingestion.handle(available.value);
    expect(responses).toEqual([
      expect.objectContaining({
        controllerLeaseId: 'lease-B',
        type: 'extension.recording.events.ack',
      }),
    ]);
    const after = await owner.read(recordingId);
    expect(after?.events?.writer).toEqual(writer);
    expect(after?.operationId).toBe(before?.operationId);
    expect(after?.recordingAssetId).toBe(before?.recordingAssetId);
    expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
    expect(await ingestion.handle({ ...available.value, controllerLeaseId: 'lease' })).toEqual([]);
  }
);

it('retains an expired pending Native parent, accepted prefix and video until history publication', async () => {
  const { owner, writer } = await acceptedEvents('partial');
  const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, { ...parent, expiresAt: 50 });
  expect(await cleanupStaleNativeTransferSessions(100)).toEqual([]);
  expect((await owner.read(recordingId))?.phase).toBe('pending');
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  expect(
    await database.get(RECORDING_EVENTS_STORE, [
      writer.recordingId,
      writer.eventStreamId,
      'head',
      0,
    ])
  ).toMatchObject({ totalBlocks: 1, retired: false });
});

it(
  'excludes published Native parents from periodic retry and includes them for explicit ' +
    'receipt reconstruction',
  async () => {
    const { owner } = await acceptedEvents();
    const collect = async (includePublished: boolean) => {
      const ids: string[] = [];
      for await (const id of owner.candidates('lease', includePublished)) ids.push(id);
      return ids;
    };
    expect(await collect(false)).toEqual([recordingId]);
    await saveNativeRecordingHistory(recordingId, 'events');
    expect(await collect(false)).toEqual([]);
    expect(await collect(true)).toEqual([recordingId]);
    const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
    await database.put(NATIVE_TRANSFER_SESSIONS_STORE, { ...parent, expiresAt: 50 });
    expect(await cleanupStaleNativeTransferSessions(100)).toEqual([recordingId]);
    expect((await getRecordingTelemetry(recordingId))?.recordingEventsSnapshot).toBeDefined();
    expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
  }
);

it('retains an offered history parent when a worker stops before it creates the private intent', async () => {
  const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    ...parent,
    expiresAt: 50,
    metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
  });
  expect(await cleanupStaleNativeTransferSessions(100)).toEqual([]);
  expect(await createNativeRecordingHistoryStore().read(recordingId)).toBeNull();
  const ids: string[] = [];
  for await (const id of createNativeRecordingHistoryStore().candidates('lease')) ids.push(id);
  expect(ids).toEqual([recordingId]);
});

it('adopts a completed parent on availability after a crash before the first intent', async () => {
  const parent = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
  await database.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    ...parent,
    metadata: { ...parent.metadata, recordingEvents: eventsFixture.descriptor },
  });
  const owner = createNativeRecordingHistoryStore();
  expect(await owner.read(recordingId)).toBeNull();
  const ingestion = createNativeRecordingHistoryIngestion({
    currentLeaseId: () => 'lease-B',
    enabled: () => true,
  });
  const available = parseNativeHistoryInboundMessage({
    protocolVersion: 2,
    type: 'app.recording.events.available',
    controllerLeaseId: 'lease-B',
    recordingId,
    eventStreamId: eventsFixture.eventStreamId,
    videoSha256: 'd'.repeat(64),
    descriptor: eventsFixture.descriptor,
  });
  if (!available.ok) throw new Error(available.error);
  const responses = await ingestion.handle(available.value);
  expect(responses).toEqual([
    expect.objectContaining({
      type: 'extension.recording.events.manifest.request',
      controllerLeaseId: 'lease-B',
    }),
  ]);
  expect((await owner.read(recordingId))?.controllerLeaseId).toBe('lease-B');
  expect((await database.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId)).controllerLeaseId).toBe(
    'lease-B'
  );
  expect(await database.get(STORE_NAME, recordingId)).toMatchObject({ assetId: 'video' });
});
