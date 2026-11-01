import '../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createNativeRecordingHistoryPuller } from './history-pull';
import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import { installPersistenceLockManagerForTests } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  STORE_NAME,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
} from '../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { parseNativeHistoryInboundMessage } from '../../../contracts/native-app/parser-attachments';
import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import { createCursorTrajectoryBlockPacker } from '../../../features/video/project/cursor-trajectory/blocks';
import type { CursorTrajectoryDescriptor } from '../../../features/video/project/cursor-trajectory/types';
import type { NativeHistoryPullResult, NativeHistoryPullDependencies } from './history-pull';
import type { NativeRecordingHistoryOffer } from '../../../composition/persistence/recordings/native-history/contracts';

let db: IDBPDatabase;
let name: string;
let generation: number;
let lease: string | null;
beforeEach(async () => {
  generation = 0;
  lease = 'lease';
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  name = `native-history-pull-${crypto.randomUUID()}`;
  db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const assetId = 'video-asset';
  await db.put(STORE_NAME, {
    id: eventsFixture.recordingId,
    assetId,
    filename: 'source.mp4',
    mimeType: 'video/mp4',
    size: 1000,
    createdAt: 1,
  });
  await db.put(ASSET_REFS_STORE, {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/mp4',
    sha256: 'd'.repeat(64),
    size: 1000,
  });
  await db.put(ASSET_OWNERS_STORE, {
    assetId,
    ownerKind: 'recording',
    ownerId: eventsFixture.recordingId,
    role: 'body',
  });
  await db.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    id: eventsFixture.recordingId,
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
  db.close();
  await deleteDB(name);
  installPersistenceLockManagerForTests(null);
});
const hash = (bytes: Uint8Array) =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
function fixture(cursorSamples = 0, includeEvents = true) {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
  const intents = createNativeRecordingHistoryStore({
    database: async () => db,
    mintGeneration: () => `generation-${++generation}`,
    now: () => 100,
  });
  const cursorWriter = createCursorTrajectoryBlockPacker(eventsFixture.recordingId, 'a'.repeat(32));
  const cursorBlocks = cursorWriter.append({
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    width: 640,
    height: 360,
    reason: 'start',
    clock: {
      source: 'windows-message-time',
      timestampQuantumUs: 1000,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  });
  for (let i = 0; i < cursorSamples; i++)
    cursorBlocks.push(
      ...cursorWriter.append({
        kind: 'sample',
        segmentId: 0,
        observationSeq: i,
        activeTimeUs: i * 2000,
        xQ8: (20 + (i % 600)) * 256,
        yQ8: 120 * 256,
        visible: true,
        observed: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
  cursorBlocks.push(
    ...cursorWriter.append({
      kind: 'boundary',
      segmentId: 0,
      activeTimeUs: Math.max(1, cursorSamples) * 2000,
      reason: 'stop',
    }),
    ...cursorWriter.finish()
  );
  const cursorDescriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: 'a'.repeat(32),
    state: 'complete',
    finalized: true,
    ...cursorWriter.summary(),
  };
  const offer: NativeRecordingHistoryOffer = {
    recordingId: eventsFixture.recordingId,
    controllerLeaseId: 'lease',
    videoSha256: 'd'.repeat(64),
    width: 640,
    height: 360,
    ...(cursorSamples ? { cursorTrajectory: cursorDescriptor } : {}),
    ...(includeEvents ? { recordingEvents: eventsFixture.descriptor } : {}),
  };
  const eventBlocks = eventsFixture.blocks.map((block, index) => ({
    bytes: new TextEncoder().encode(block.utf8),
    entry: eventsFixture.manifest[index]!,
  }));
  let refuseStateWrite = false;
  const dependencies: NativeHistoryPullDependencies = {
    intents: {
      ...intents,
      async savePull(...args) {
        if (refuseStateWrite) {
          refuseStateWrite = false;
          throw new Error('Transport state write failed.');
        }
        return intents.savePull(...args);
      },
    },
    cursor: (token) =>
      createRecordingCursorTrajectoryStore({
        database: async () => db,
        mintGeneration: () => token,
      }),
    events: (token) =>
      createRecordingEventsStore({ database: async () => db, mintGeneration: () => token }),
    currentLeaseId: () => lease,
    mintRequestId: () => `request-${++generation}`,
  };
  function reply(request: NativeHistoryPullResult['messages'][number], pageSize = 32) {
    const isCursor = 'trajectoryId' in request;
    const blocks = isCursor ? cursorBlocks : eventBlocks;
    const descriptor = isCursor ? cursorDescriptor : eventsFixture.descriptor;
    const identity = {
      protocolVersion: 2,
      controllerLeaseId: request.controllerLeaseId,
      recordingId: request.recordingId,
      requestId: request.requestId,
      ...(isCursor
        ? { trajectoryId: request.trajectoryId }
        : { eventStreamId: request.eventStreamId }),
    };
    let message: unknown;
    if (
      request.type === 'extension.recording.attachment.manifest.request' ||
      request.type === 'extension.recording.events.manifest.request'
    ) {
      expect(request.prefixSha256).toBe(
        request.nextSequence === 0
          ? eventsFixture.emptyStreamSha256
          : blocks[request.nextSequence - 1]!.entry.prefixSha256
      );
      const page = blocks.slice(request.nextSequence, request.nextSequence + pageSize);
      const end = request.nextSequence + page.length;
      message = {
        ...identity,
        type: isCursor ? 'app.recording.attachment.manifest' : 'app.recording.events.manifest',
        descriptor,
        fromSequence: request.nextSequence,
        entries: page.map((block) => block.entry),
        nextSequence: end < blocks.length ? end : null,
      };
    } else {
      const block = blocks[request.sequence]!;
      const offset = request.chunkIndex * 32768;
      const bytes = block.bytes.slice(offset, offset + 32768);
      message = {
        ...identity,
        type: isCursor ? 'app.recording.attachment.chunk' : 'app.recording.events.chunk',
        sequence: request.sequence,
        blockBytes: block.bytes.byteLength,
        blockSha256: block.entry.blockSha256,
        chunkIndex: request.chunkIndex,
        chunkCount: Math.ceil(block.bytes.byteLength / 32768),
        chunkByteOffset: offset,
        chunkRawBytes: bytes.byteLength,
        chunkSha256: hash(bytes),
        base64: btoa(String.fromCharCode(...bytes)),
      };
    }
    const parsed = parseNativeHistoryInboundMessage(message);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  }
  return {
    intents,
    offer,
    dependencies,
    reply,
    cursorDescriptor,
    cursorBlocks,
    eventBlocks,
    failNextStateWrite() {
      refuseStateWrite = true;
    },
  };
}
async function drive(
  puller: ReturnType<typeof createNativeRecordingHistoryPuller>,
  initial: NativeHistoryPullResult,
  reply: ReturnType<typeof fixture>['reply'],
  pageSize = 32
) {
  const requests = [...initial.messages];
  const ready = new Set(initial.ready);
  while (requests.length) {
    const request = requests.shift()!;
    expect(request.type.endsWith('.ack')).toBe(false);
    const result = await puller.handle(reply(request, pageSize));
    requests.push(...result.messages);
    result.ready.forEach((kind) => ready.add(kind));
  }
  return ready;
}
it('verifies independent original event blocks without publishing a source head or issuing an ACK', async () => {
  const f = fixture();
  const intent = await f.intents.plan(f.offer);
  const puller = createNativeRecordingHistoryPuller(f.dependencies);
  expect(await drive(puller, await puller.start(intent.recordingId), f.reply, 1)).toEqual(
    new Set(['events'])
  );
  const completed = await f.intents.read(intent.recordingId);
  expect(completed?.events?.pull).toEqual({ kind: 'verified' });
  expect(
    await db.get(RECORDING_EVENTS_STORE, [
      intent.recordingId,
      eventsFixture.eventStreamId,
      'head',
      0,
    ])
  ).toBeUndefined();
  const store = f.dependencies.events(intent.events!.writer!.writerGeneration);
  expect(await store.getHead(intent.events!.writer!)).toMatchObject({
    finalized: true,
    streamSha256: eventsFixture.descriptor.streamSha256,
    totalRecords: 18,
  });
  expect(await db.get(STORE_NAME, intent.recordingId)).toBeDefined();
});
it('recovers the accepted prefix after append commits but the outbox update fails', async () => {
  const f = fixture();
  const intent = await f.intents.plan(f.offer);
  let puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const chunks = await puller.handle(f.reply(initial.messages[0]!));
  f.failNextStateWrite();
  await expect(puller.handle(f.reply(chunks.messages[0]!))).rejects.toThrow(
    'Transport state write failed.'
  );
  puller = createNativeRecordingHistoryPuller(f.dependencies);
  const resumed = await puller.start(intent.recordingId);
  expect(resumed.messages[0]).toMatchObject({
    type: 'extension.recording.events.manifest.request',
    nextSequence: 1,
    prefixSha256: f.eventBlocks[0]!.entry.prefixSha256,
  });
  expect(await drive(puller, resumed, f.reply)).toEqual(new Set(['events']));
});
it('retains the partial first chunk across restart and preserves all 6000 cursor samples', async () => {
  const f = fixture(6000, false);
  const intent = await f.intents.plan(f.offer);
  let puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const first = await puller.handle(f.reply(initial.messages[0]!));
  const second = await puller.handle(f.reply(first.messages[0]!));
  expect(second.messages[0]).toMatchObject({
    type: 'extension.recording.attachment.chunk.request',
    sequence: 0,
    chunkIndex: 1,
  });
  puller = createNativeRecordingHistoryPuller(f.dependencies);
  const resumed = await puller.start(intent.recordingId);
  expect(resumed.messages).toEqual(second.messages);
  expect(await drive(puller, resumed, f.reply, 1)).toEqual(new Set(['cursor']));
  const head = await f.dependencies
    .cursor(intent.cursor!.writer!.writerGeneration)
    .getHead(intent.cursor!.writer!);
  expect(head).toMatchObject({
    finalized: true,
    totalSamples: 6000,
    streamSha256: f.cursorDescriptor.streamSha256,
  });
  expect(
    await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [
      intent.recordingId,
      f.cursorDescriptor.trajectoryId,
    ])
  ).toBeUndefined();
}, 30000);
it('refuses a wrong chunk hash and lease while preserving the valid private prefix', async () => {
  const f = fixture();
  const intent = await f.intents.plan(f.offer);
  const puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const chunks = await puller.handle(f.reply(initial.messages[0]!));
  const message = f.reply(chunks.messages[0]!);
  if (message.type !== 'app.recording.events.chunk') throw new Error('Expected a chunk.');
  await expect(puller.handle({ ...message, chunkSha256: '0'.repeat(64) })).rejects.toMatchObject({
    code: 'invalid',
  });
  expect(
    (
      await f.dependencies
        .events(intent.events!.writer!.writerGeneration)
        .getHead(intent.events!.writer!)
    )?.totalBlocks
  ).toBe(0);
  lease = 'another-lease';
  await expect(puller.handle(message)).rejects.toMatchObject({ code: 'conflict' });
  lease = 'lease';
  expect(await drive(puller, chunks, f.reply)).toEqual(new Set(['events']));
});

it('keeps events independent when a cursor block fails integrity checks', async () => {
  const f = fixture(1, true);
  const intent = await f.intents.plan(f.offer);
  const puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const cursorRequest = initial.messages.find((request) => 'trajectoryId' in request)!;
  const eventRequest = initial.messages.find((request) => 'eventStreamId' in request)!;
  const cursorChunks = await puller.handle(f.reply(cursorRequest));
  const chunk = f.reply(cursorChunks.messages[0]!);
  if (chunk.type !== 'app.recording.attachment.chunk') throw new Error('Expected a cursor chunk.');
  await expect(puller.handle({ ...chunk, chunkSha256: '0'.repeat(64) })).rejects.toMatchObject({
    code: 'invalid',
  });
  expect(
    await drive(puller, { messages: [eventRequest], ready: [], pending: true }, f.reply)
  ).toEqual(new Set(['events']));
  const state = await f.intents.read(intent.recordingId);
  expect(state?.cursor?.pull?.kind).toBe('chunks');
  expect(state?.events?.pull?.kind).toBe('verified');
  expect(state?.phase).toBe('pending');
});

it('preserves a provisional zero-block head until a paced manifest retry returns the final stream', async () => {
  const f = fixture();
  f.offer.recordingEvents = {
    ...f.offer.recordingEvents!,
    finalized: false,
    state: 'incomplete',
    totalBlocks: 0,
    totalRecords: 0,
    totalBytes: 0,
    streamSha256: eventsFixture.emptyStreamSha256,
  };
  const intent = await f.intents.plan(f.offer);
  const puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const message = f.reply(initial.messages[0]!);
  if (message.type !== 'app.recording.events.manifest')
    throw new Error('Expected an event manifest.');
  const parsed = parseNativeHistoryInboundMessage({
    ...message,
    descriptor: f.offer.recordingEvents,
    entries: [],
    nextSequence: null,
  });
  if (!parsed.ok) throw new Error('Invalid provisional fixture.');
  const waiting = await puller.handle(parsed.value);
  expect(waiting).toEqual({ messages: [], ready: [], pending: true });
  const resumed = await puller.start(intent.recordingId);
  expect(resumed.messages).toHaveLength(1);
  expect(await drive(puller, resumed, f.reply)).toEqual(new Set(['events']));
});

it('does not request or open an unavailable zero-block archive', async () => {
  const f = fixture();
  f.offer.recordingEvents = {
    ...f.offer.recordingEvents!,
    finalized: true,
    state: 'unavailable',
    totalBlocks: 0,
    totalRecords: 0,
    totalBytes: 0,
    streamSha256: eventsFixture.emptyStreamSha256,
  };
  let opened = false;
  const original = f.dependencies.events;
  f.dependencies.events = (token) => {
    opened = true;
    return original(token);
  };
  const intent = await f.intents.plan(f.offer);
  const result = await createNativeRecordingHistoryPuller(f.dependencies).start(intent.recordingId);
  expect(result).toEqual({ messages: [], ready: ['events'], pending: false });
  expect(opened).toBe(false);
  expect(await db.get(STORE_NAME, intent.recordingId)).toBeDefined();
});

it('retains an accepted block but emits no stale request when the lease changes during append', async () => {
  const f = fixture();
  const intent = await f.intents.plan(f.offer);
  const original = f.dependencies.events;
  let changeLease = true;
  f.dependencies.events = (token) => {
    const store = original(token);
    return {
      ...store,
      async append(...args) {
        await store.append(...args);
        if (changeLease) {
          changeLease = false;
          lease = 'another-lease';
        }
      },
    };
  };
  const puller = createNativeRecordingHistoryPuller(f.dependencies);
  const initial = await puller.start(intent.recordingId);
  const chunks = await puller.handle(f.reply(initial.messages[0]!));
  await expect(puller.handle(f.reply(chunks.messages[0]!))).rejects.toMatchObject({
    code: 'conflict',
  });
  expect(
    (await original(intent.events!.writer!.writerGeneration).getHead(intent.events!.writer!))
      ?.totalBlocks
  ).toBe(1);
  lease = 'lease';
  const resumed = await puller.start(intent.recordingId);
  expect(resumed.messages[0]).toMatchObject({ nextSequence: 1 });
  expect(await drive(puller, resumed, f.reply)).toEqual(new Set(['events']));
});
