import * as historyIngestion from './history-ingestion';
import { parseNativeHistoryInboundMessage } from '../../../contracts/native-app/parser-attachments';
import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  MemoryFileHandle,
  createHarness,
} from '../../../composition/persistence/assets/opfs-store.test-support';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  STORE_NAME,
  ASSET_REFS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
} from '../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { createNativeAppIngestionController } from './controller';
import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import events from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
let database: IDBPDatabase;
let name: string;
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => database,
}));
vi.mock('../../../platform/navigation/extension-pages', () => ({ openVideoEditorPage: vi.fn() }));
const digest = (bytes: Uint8Array) =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const getFile = MemoryFileHandle.prototype.getFile;
  vi.spyOn(MemoryFileHandle.prototype, 'getFile').mockImplementation(async function (
    this: MemoryFileHandle
  ) {
    const file = await getFile.call(this);
    return new File([file], 'memory-file', { lastModified: Date.now() });
  });
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  name = `native-real-recording-${crypto.randomUUID()}`;
  database = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const harness = createHarness();
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: harness.options.getOriginRoot,
      estimate: async () => ({ quota: 10000000000, usage: 0 }),
    },
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<unknown>
      ) => callback({}),
    },
  });
});
afterEach(async () => {
  database.close();
  await deleteDB(name);
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function commit(historyEnabled = true) {
  if (!isRecordingEventsDescriptor(events.descriptor)) throw new Error('Invalid fixture.');
  const bytes = new TextEncoder().encode('native-mp4-owned-body');
  let lease = 'lease-A';
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => lease,
    isHistoryEnabled: () => historyEnabled,
  });
  const stopped = {
    type: 'app.recording.stopped' as const,
    protocolVersion: 2 as const,
    recordingId: events.recordingId,
    controllerLeaseId: lease,
    filename: 'source.mp4',
    mimeType: 'video/mp4' as const,
    totalBytes: bytes.length,
    chunkCount: 1,
    sha256: digest(bytes),
    width: 640,
    height: 360,
    durationMs: 1000,
    fps: 30,
    openEditor: false,
    telemetry: null,
    recordingEvents: events.descriptor,
  };
  expect(await controller.handleRecordingStopped(stopped)).toEqual([
    expect.objectContaining({ type: 'extension.recording.chunkRequest' }),
  ]);
  const responses = await controller.handleRecordingChunk({
    type: 'app.recording.chunk',
    protocolVersion: 2,
    recordingId: stopped.recordingId,
    controllerLeaseId: lease,
    chunkIndex: 0,
    chunkByteOffset: 0,
    chunkRawBytes: bytes.length,
    chunkSha256: digest(bytes),
    base64: Buffer.from(bytes).toString('base64'),
  });
  const recording = await database.get(STORE_NAME, stopped.recordingId);
  return {
    controller,
    stopped,
    responses,
    recording,
    setLease(value: string) {
      lease = value;
    },
  };
}
it(
  'recovers a real published Native MP4 and starts history with the nullable SHA from ' +
    'normal asset publication',
  async () => {
    const { controller, stopped, responses, recording, setLease } = await commit();
    expect(responses).toContainEqual(expect.objectContaining({ type: 'extension.recording.ack' }));
    expect((await database.get(ASSET_REFS_STORE, recording.assetId)).sha256).toBeNull();
    expect(responses).toContainEqual(
      expect.objectContaining({ type: 'extension.recording.events.manifest.request' })
    );
    const intent = await createNativeRecordingHistoryStore().read(stopped.recordingId);
    expect(intent?.recordingAssetId).toBe(recording.assetId);
    expect(await controller.resumePendingTransfers('lease-A')).toContainEqual(
      expect.objectContaining({
        type: 'extension.recording.ack',
        receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
      })
    );
    const lease = 'lease-B';
    setLease(lease);
    expect(
      await controller.handleRecordingStopped({ ...stopped, controllerLeaseId: lease })
    ).toEqual([
      expect.objectContaining({ type: 'extension.recording.ack', controllerLeaseId: lease }),
    ]);
    expect(
      (await database.get(NATIVE_TRANSFER_SESSIONS_STORE, stopped.recordingId)).metadata.history
        .operationId
    ).toBe(intent?.operationId);
  }
);

it('adopts a real nullable-SHA body after a crash before the first history intent on the old lease', async () => {
  const { stopped, recording } = await commit(false);
  const owner = createNativeRecordingHistoryStore();
  expect(await owner.read(stopped.recordingId)).toBeNull();
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-B',
    isHistoryEnabled: () => true,
  });
  const responses = await controller.handleHistory({
    type: 'app.recording.events.available',
    protocolVersion: 2,
    controllerLeaseId: 'lease-B',
    recordingId: stopped.recordingId,
    videoSha256: stopped.sha256,
    eventStreamId: stopped.recordingEvents.eventStreamId,
    descriptor: stopped.recordingEvents,
  });
  expect(responses).toEqual([
    expect.objectContaining({
      type: 'extension.recording.events.manifest.request',
      controllerLeaseId: 'lease-B',
    }),
  ]);
  expect(await owner.read(stopped.recordingId)).toMatchObject({
    recordingAssetId: recording.assetId,
    controllerLeaseId: 'lease-B',
  });
});
it(
  'refuses a delayed owned-body receipt after source deletion during bounded hashing and ' +
    'keeps the recovery parent',
  async () => {
    const { controller, stopped } = await commit();
    const before = await database.get(NATIVE_TRANSFER_SESSIONS_STORE, stopped.recordingId);
    vi.mocked(Date.now).mockReturnValue(200);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const read = Blob.prototype.arrayBuffer;
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementationOnce(async function (this: Blob) {
      entered.resolve();
      await release.promise;
      return read.call(this);
    });
    const recovering = controller.handleRecordingStopped(stopped);
    await entered.promise;
    await database.delete(STORE_NAME, stopped.recordingId);
    release.resolve();
    expect(await recovering).toEqual([]);
    expect(await database.get(NATIVE_TRANSFER_SESSIONS_STORE, stopped.recordingId)).toEqual(before);
  }
);

it('retries the video receipt after final history publication when the early video ACK was not accepted', async () => {
  const { controller, stopped, responses: first } = await commit();
  let responses = first.filter((message) => message.type.startsWith('extension.recording.events.'));
  for (let turn = 0; turn < 20; turn++) {
    const request = responses[0];
    if (!request || request.type === 'extension.recording.events.ack') break;
    let raw: unknown;
    if (request.type === 'extension.recording.events.manifest.request') {
      raw = {
        protocolVersion: 2,
        controllerLeaseId: request.controllerLeaseId,
        recordingId: request.recordingId,
        eventStreamId: request.eventStreamId,
        requestId: request.requestId,
        type: 'app.recording.events.manifest',
        descriptor: events.descriptor,
        fromSequence: request.nextSequence,
        entries: events.manifest.slice(request.nextSequence),
        nextSequence: null,
      };
    } else if (request.type === 'extension.recording.events.chunk.request') {
      const bytes = new TextEncoder().encode(events.blocks[request.sequence]!.utf8);
      const part = bytes.slice(request.chunkIndex * 32768, (request.chunkIndex + 1) * 32768);
      raw = {
        ...request,
        type: 'app.recording.events.chunk',
        blockBytes: bytes.length,
        blockSha256: events.manifest[request.sequence]!.blockSha256,
        chunkCount: Math.ceil(bytes.length / 32768),
        chunkByteOffset: request.chunkIndex * 32768,
        chunkRawBytes: part.length,
        chunkSha256: digest(part),
        base64: Buffer.from(part).toString('base64'),
      };
    } else throw new Error('Unexpected history request.');
    const parsed = parseNativeHistoryInboundMessage(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    responses = await controller.handleHistory(parsed.value);
  }
  expect(responses.map((message) => message.type)).toEqual([
    'extension.recording.events.ack',
    'extension.recording.ack',
  ]);
  expect(responses[1]).toMatchObject({
    receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
  });
  expect((await createNativeRecordingHistoryStore().read(stopped.recordingId))?.phase).toBe(
    'complete'
  );
});

it('resumes history with an independent video receipt and refuses stale recovery', async () => {
  const { controller, stopped, setLease } = await commit();
  const before = await createNativeRecordingHistoryStore().read(stopped.recordingId);
  const responses = await controller.resumePendingHistoryTransfers('lease-A');
  expect(responses.map((message) => message.type)).toEqual([
    'extension.recording.ack',
    'extension.recording.events.manifest.request',
  ]);
  expect(responses[0]).toMatchObject({
    receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
  });
  expect(
    await createNativeAppIngestionController().resumePendingHistoryTransfers('lease-A')
  ).toEqual([]);
  setLease('lease-B');
  expect(await controller.resumePendingHistoryTransfers('lease-A')).toEqual([]);
  expect(await createNativeRecordingHistoryStore().read(stopped.recordingId)).toEqual(before);
});

it('retains the independently verified video receipt when history recovery fails', async () => {
  const { stopped, recording } = await commit();
  const createHistory = historyIngestion.createNativeRecordingHistoryIngestion;
  const failedResume = vi.fn(async () => {
    throw new Error('history storage unavailable');
  });
  vi.spyOn(historyIngestion, 'createNativeRecordingHistoryIngestion').mockImplementationOnce(
    (deps) => ({
      ...createHistory(deps),
      resume: failedResume,
    })
  );
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-A',
    isHistoryEnabled: (kind) => kind === 'events',
  });
  expect(await controller.resumePendingHistoryTransfers('lease-A', true)).toEqual([
    expect.objectContaining({
      type: 'extension.recording.ack',
      receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
    }),
  ]);
  expect(failedResume).toHaveBeenCalledExactlyOnceWith(stopped.recordingId, 'lease-A', true);
  expect(await database.get(STORE_NAME, stopped.recordingId)).toEqual(recording);
  expect((await createNativeRecordingHistoryStore().read(stopped.recordingId))?.phase).toBe(
    'pending'
  );
});
