import { sha256 } from '@noble/hashes/sha2.js';
import type {
  NativeHistoryInboundMessage,
  NativeHistoryOutboundMessage,
} from '../../../contracts/native-app/attachment-message-types';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryManifestEntry,
} from '../../../features/video/project/cursor-trajectory/types';
import type {
  RecordingEventsDescriptor,
  RecordingEventsManifestEntry,
} from '../../../features/video/project/recording-events/types';
import type { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import {
  NativeRecordingHistoryError,
  type NativeRecordingHistoryIntent,
  type NativeHistoryPullState,
} from '../../../composition/persistence/recordings/native-history/contracts';
import type { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import type { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';

type Descriptor = CursorTrajectoryDescriptor | RecordingEventsDescriptor;
type Entry = RecordingEventsManifestEntry;
type Request = Exclude<
  NativeHistoryOutboundMessage,
  { type: 'extension.recording.attachment.ack' | 'extension.recording.events.ack' }
>;
type Chunk = Extract<
  NativeHistoryInboundMessage,
  { type: 'app.recording.attachment.chunk' | 'app.recording.events.chunk' }
>;
type Head = {
  totalBlocks: number;
  totalRecords: number;
  totalBytes: number;
  totalSamples?: number;
  streamSha256: string;
  finalized: boolean;
  state: Descriptor['state'];
  writerGeneration: string;
  sourceRecordingId: string;
  stagingJournalId?: string;
};
interface Driver<D extends Descriptor, E extends Entry> {
  kind: 'cursor' | 'events';
  descriptor: D;
  pull: NativeHistoryPullState<E> | null;
  head(): Promise<Head | null>;
  append(entry: E, bytes: Uint8Array): Promise<void>;
  finalize(descriptor: D): Promise<void>;
  save(descriptor: D, pull: NativeHistoryPullState<E>): Promise<NativeRecordingHistoryIntent>;
  request(pull: NativeHistoryPullState<E>): Request | null;
}
export interface NativeHistoryPullResult {
  messages: Request[];
  ready: ('cursor' | 'events')[];
  pending: boolean;
}
export interface NativeHistoryPullDependencies {
  intents: ReturnType<typeof createNativeRecordingHistoryStore>;
  cursor(
    generation: string
  ): Pick<
    ReturnType<typeof createRecordingCursorTrajectoryStore>,
    'begin' | 'getHead' | 'append' | 'finalize'
  >;
  events(
    generation: string
  ): Pick<
    ReturnType<typeof createRecordingEventsStore>,
    'begin' | 'getHead' | 'append' | 'finalize'
  >;
  currentLeaseId(): string | null;
  mintRequestId(): string;
}
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const hex = (bytes: Uint8Array) =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const pending = (request: Request | null): NativeHistoryPullResult => ({
  messages: request ? [request] : [],
  ready: [],
  pending: true,
});
const ready = (kind: 'cursor' | 'events'): NativeHistoryPullResult => ({
  messages: [],
  ready: [kind],
  pending: false,
});
const prefix = (head: Head | null) => ({
  nextSequence: head?.totalBlocks ?? 0,
  prefixSha256: head?.streamSha256 ?? EMPTY_SHA256,
});
function sameSummary(head: Head | null, descriptor: Descriptor) {
  return (
    (head?.totalBlocks ?? 0) === descriptor.totalBlocks &&
    (head?.totalRecords ?? 0) === descriptor.totalRecords &&
    (head?.totalBytes ?? 0) === descriptor.totalBytes &&
    (head?.streamSha256 ?? EMPTY_SHA256) === descriptor.streamSha256 &&
    (!('totalSamples' in descriptor) || (head?.totalSamples ?? 0) === descriptor.totalSamples)
  );
}

/** The ingestion controller serializes calls per recording. This owner never issues a durable ACK. */
export function createNativeRecordingHistoryPuller(deps: NativeHistoryPullDependencies) {
  function lease(intent: NativeRecordingHistoryIntent, incoming = intent.controllerLeaseId) {
    if (deps.currentLeaseId() !== incoming || incoming !== intent.controllerLeaseId)
      throw new NativeRecordingHistoryError('conflict');
  }
  async function bound(recordingId: string, incoming?: string) {
    const intent = await deps.intents.read(recordingId);
    if (!intent) throw new NativeRecordingHistoryError('missing');
    lease(intent, incoming);
    const admitted = await deps.intents.admit(intent);
    lease(admitted, incoming);
    return admitted;
  }
  async function commit(
    intent: NativeRecordingHistoryIntent,
    update: Parameters<NativeHistoryPullDependencies['intents']['savePull']>[1]
  ) {
    lease(intent);
    const saved = await deps.intents.savePull(intent, update);
    lease(saved);
    return saved;
  }
  function cursor(
    intent: NativeRecordingHistoryIntent
  ): Driver<CursorTrajectoryDescriptor, CursorTrajectoryManifestEntry> {
    const slot = intent.cursor;
    if (!slot) throw new NativeRecordingHistoryError('missing');
    const writer = slot.writer;
    const store = writer ? deps.cursor(writer.writerGeneration) : null;
    return {
      kind: 'cursor',
      descriptor: slot.descriptor,
      pull: slot.pull,
      async head() {
        if (!writer || !store) return null;
        let head = await store.getHead(writer);
        if (!head) {
          await store.begin(
            writer,
            { width: intent.width, height: intent.height },
            intent.recordingId,
            intent.operationId
          );
          head = await store.getHead(writer);
        }
        if (
          !head ||
          head.writerGeneration !== writer.writerGeneration ||
          head.sourceRecordingId !== intent.recordingId ||
          head.stagingJournalId !== intent.operationId
        )
          throw new NativeRecordingHistoryError('retired');
        return head;
      },
      async append(entry, bytes) {
        if (!writer || !store) throw new NativeRecordingHistoryError('invalid');
        await store.append(writer, { entry, bytes });
      },
      async finalize(descriptor) {
        if (writer && store) await store.finalize(writer, descriptor, descriptor.state);
      },
      save: (descriptor, pull) => commit(intent, { kind: 'cursor', descriptor, pull }),
      request(pull) {
        const identity = {
          protocolVersion: 2 as const,
          controllerLeaseId: intent.controllerLeaseId,
          recordingId: intent.recordingId,
          trajectoryId: slot.descriptor.trajectoryId,
        };
        if (pull.kind === 'manifest')
          return {
            ...identity,
            type: 'extension.recording.attachment.manifest.request',
            requestId: pull.requestId,
            nextSequence: pull.nextSequence,
            prefixSha256: pull.prefixSha256,
          };
        if (pull.kind === 'chunks')
          return {
            ...identity,
            type: 'extension.recording.attachment.chunk.request',
            requestId: pull.requestId,
            sequence: pull.entries[0]!.sequence,
            chunkIndex: pull.chunkIndex,
          };
        return null;
      },
    };
  }
  function events(
    intent: NativeRecordingHistoryIntent
  ): Driver<RecordingEventsDescriptor, RecordingEventsManifestEntry> {
    const slot = intent.events;
    if (!slot) throw new NativeRecordingHistoryError('missing');
    const writer = slot.writer;
    const store = writer ? deps.events(writer.writerGeneration) : null;
    return {
      kind: 'events',
      descriptor: slot.descriptor,
      pull: slot.pull,
      async head() {
        if (!writer || !store) return null;
        let head = await store.getHead(writer);
        if (!head) {
          await store.begin(writer, intent.recordingId, intent.operationId);
          head = await store.getHead(writer);
        }
        if (
          !head ||
          head.writerGeneration !== writer.writerGeneration ||
          head.sourceRecordingId !== intent.recordingId ||
          head.stagingJournalId !== intent.operationId
        )
          throw new NativeRecordingHistoryError('retired');
        return head;
      },
      async append(entry, bytes) {
        if (!writer || !store) throw new NativeRecordingHistoryError('invalid');
        await store.append(writer, { entry, bytes });
      },
      async finalize(descriptor) {
        if (writer && store) await store.finalize(writer, descriptor);
      },
      save: (descriptor, pull) => commit(intent, { kind: 'events', descriptor, pull }),
      request(pull) {
        const identity = {
          protocolVersion: 2 as const,
          controllerLeaseId: intent.controllerLeaseId,
          recordingId: intent.recordingId,
          eventStreamId: slot.descriptor.eventStreamId,
        };
        if (pull.kind === 'manifest')
          return {
            ...identity,
            type: 'extension.recording.events.manifest.request',
            requestId: pull.requestId,
            nextSequence: pull.nextSequence,
            prefixSha256: pull.prefixSha256,
          };
        if (pull.kind === 'chunks')
          return {
            ...identity,
            type: 'extension.recording.events.chunk.request',
            requestId: pull.requestId,
            sequence: pull.entries[0]!.sequence,
            chunkIndex: pull.chunkIndex,
          };
        return null;
      },
    };
  }
  async function manifestRequest<D extends Descriptor, E extends Entry>(
    driver: Driver<D, E>,
    head: Head | null,
    descriptor = driver.descriptor
  ) {
    const pull: NativeHistoryPullState<E> = {
      kind: 'manifest',
      requestId: deps.mintRequestId(),
      ...prefix(head),
    };
    await driver.save(descriptor, pull);
    return pending(driver.request(pull));
  }
  async function verify<D extends Descriptor, E extends Entry>(
    driver: Driver<D, E>,
    head: Head | null,
    descriptor: D
  ) {
    if (!descriptor.finalized || !sameSummary(head, descriptor))
      throw new NativeRecordingHistoryError('invalid');
    await driver.finalize(descriptor);
    await driver.save(descriptor, { kind: 'verified' });
    return ready(driver.kind);
  }
  async function resume<D extends Descriptor, E extends Entry>(
    driver: Driver<D, E>
  ): Promise<NativeHistoryPullResult> {
    if (
      driver.pull?.kind === 'verified' ||
      driver.pull?.kind === 'unavailable' ||
      driver.pull?.kind === 'published'
    )
      return ready(driver.kind);
    if (
      driver.descriptor.state === 'unavailable' &&
      driver.descriptor.finalized &&
      driver.descriptor.totalBlocks === 0
    ) {
      await driver.save(driver.descriptor, { kind: 'unavailable' });
      return ready(driver.kind);
    }
    const head = await driver.head();
    if (head?.finalized && driver.descriptor.finalized)
      return verify(driver, head, driver.descriptor);
    if (
      driver.pull?.kind === 'manifest' &&
      driver.pull.nextSequence === (head?.totalBlocks ?? 0) &&
      driver.pull.prefixSha256 === (head?.streamSha256 ?? EMPTY_SHA256)
    )
      return pending(driver.request(driver.pull));
    if (
      driver.pull?.kind === 'chunks' &&
      driver.pull.entries[0]!.sequence === (head?.totalBlocks ?? 0)
    )
      return pending(driver.request(driver.pull));
    return manifestRequest(driver, head);
  }
  async function acceptManifest<D extends Descriptor, E extends Entry>(
    driver: Driver<D, E>,
    message: { requestId: string; descriptor: D; fromSequence: number; entries: E[] }
  ) {
    const pull = driver.pull;
    if (pull?.kind !== 'manifest' || pull.requestId !== message.requestId) return resume(driver);
    const head = await driver.head();
    if ((head?.totalBlocks ?? 0) > pull.nextSequence) return manifestRequest(driver, head);
    if (
      message.fromSequence !== pull.nextSequence ||
      (head?.totalBlocks ?? 0) !== pull.nextSequence ||
      (head?.streamSha256 ?? EMPTY_SHA256) !== pull.prefixSha256
    )
      throw new NativeRecordingHistoryError('invalid');
    if (!message.entries.length) {
      if (message.descriptor.finalized) return verify(driver, head, message.descriptor);
      await driver.save(message.descriptor, { ...pull, requestId: deps.mintRequestId() });
      return pending(null);
    }
    const next: NativeHistoryPullState<E> = {
      kind: 'chunks',
      requestId: deps.mintRequestId(),
      entries: message.entries,
      chunkIndex: 0,
      firstChunk: null,
    };
    await driver.save(message.descriptor, next);
    return pending(driver.request(next));
  }
  async function acceptChunk<D extends Descriptor, E extends Entry>(
    driver: Driver<D, E>,
    message: Chunk
  ) {
    const pull = driver.pull;
    if (pull?.kind !== 'chunks' || pull.requestId !== message.requestId) return resume(driver);
    const entry = pull.entries[0]!;
    if (
      message.sequence !== entry.sequence ||
      message.blockBytes !== entry.byteLength ||
      message.blockSha256 !== entry.blockSha256 ||
      message.chunkIndex !== pull.chunkIndex
    )
      throw new NativeRecordingHistoryError('invalid');
    const raw = Uint8Array.from(atob(message.base64), (char) => char.charCodeAt(0));
    if (raw.byteLength !== message.chunkRawBytes || hex(raw) !== message.chunkSha256)
      throw new NativeRecordingHistoryError('invalid');
    if (message.chunkIndex === 0 && message.chunkCount === 2) {
      const next: NativeHistoryPullState<E> = {
        ...pull,
        requestId: deps.mintRequestId(),
        chunkIndex: 1,
        firstChunk: raw,
      };
      await driver.save(driver.descriptor, next);
      return pending(driver.request(next));
    }
    const bytes = new Uint8Array(entry.byteLength);
    if (pull.chunkIndex === 1) {
      if (!pull.firstChunk) throw new NativeRecordingHistoryError('invalid');
      bytes.set(pull.firstChunk);
    }
    bytes.set(raw, message.chunkByteOffset);
    if (hex(bytes) !== entry.blockSha256) throw new NativeRecordingHistoryError('invalid');
    await driver.append(entry, bytes);
    const head = await driver.head();
    if (pull.entries.length > 1) {
      const next: NativeHistoryPullState<E> = {
        kind: 'chunks',
        requestId: deps.mintRequestId(),
        entries: pull.entries.slice(1),
        chunkIndex: 0,
        firstChunk: null,
      };
      await driver.save(driver.descriptor, next);
      return pending(driver.request(next));
    }
    if ((head?.totalBlocks ?? 0) === driver.descriptor.totalBlocks && driver.descriptor.finalized)
      return verify(driver, head, driver.descriptor);
    return manifestRequest(driver, head);
  }
  return {
    async start(recordingId: string, kind?: 'cursor' | 'events'): Promise<NativeHistoryPullResult> {
      let intent = await bound(recordingId);
      const result: NativeHistoryPullResult = { messages: [], ready: [], pending: false };
      if (intent.cursor && kind !== 'events') {
        const next = await resume(cursor(intent));
        result.messages.push(...next.messages);
        result.ready.push(...next.ready);
        result.pending ||= next.pending;
        intent = await bound(recordingId);
      }
      if (intent.events && kind !== 'cursor') {
        const next = await resume(events(intent));
        result.messages.push(...next.messages);
        result.ready.push(...next.ready);
        result.pending ||= next.pending;
      }
      lease(intent);
      return result;
    },
    async handle(message: NativeHistoryInboundMessage): Promise<NativeHistoryPullResult> {
      const intent = await bound(message.recordingId, message.controllerLeaseId);
      let result: NativeHistoryPullResult;
      switch (message.type) {
        case 'app.recording.attachment.manifest':
          if (intent.cursor?.descriptor.trajectoryId !== message.trajectoryId)
            throw new NativeRecordingHistoryError('conflict');
          result = await acceptManifest(cursor(intent), message);
          break;
        case 'app.recording.events.manifest':
          if (intent.events?.descriptor.eventStreamId !== message.eventStreamId)
            throw new NativeRecordingHistoryError('conflict');
          result = await acceptManifest(events(intent), message);
          break;
        case 'app.recording.attachment.chunk':
          if (intent.cursor?.descriptor.trajectoryId !== message.trajectoryId)
            throw new NativeRecordingHistoryError('conflict');
          result = await acceptChunk(cursor(intent), message);
          break;
        case 'app.recording.events.chunk':
          if (intent.events?.descriptor.eventStreamId !== message.eventStreamId)
            throw new NativeRecordingHistoryError('conflict');
          result = await acceptChunk(events(intent), message);
          break;
        case 'app.recording.attachment.available':
          if (
            message.videoSha256 !== intent.videoSha256 ||
            intent.cursor?.descriptor.trajectoryId !== message.trajectoryId
          )
            throw new NativeRecordingHistoryError('conflict');
          result = await resume(cursor(intent));
          break;
        case 'app.recording.events.available':
          if (
            message.videoSha256 !== intent.videoSha256 ||
            intent.events?.descriptor.eventStreamId !== message.eventStreamId
          )
            throw new NativeRecordingHistoryError('conflict');
          result = await resume(events(intent));
          break;
      }
      lease(intent, message.controllerLeaseId);
      return result;
    },
  };
}
