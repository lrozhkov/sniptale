import { sha256 } from '@noble/hashes/sha2.js';
import {
  isRecordingEventObservationPacket,
  type RecordingEventObservationPacket,
} from '../../../contracts/video/event-observations';
import { createRecordingEventsBlockPacker } from '../../../features/video/project/recording-events/blocks';
import { isTrajectoryInteger } from '../../../features/video/project/cursor-trajectory/records';
import type { CursorTrajectorySegment } from '../../../features/video/project/cursor-trajectory/types';
import type {
  RecordingEventPoint,
  RecordingEventRecord,
  RecordingEventsDescriptor,
} from '../../../features/video/project/recording-events/types';
import type { RecordingPointTransform } from '../../../features/video/project/types';
import type { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import type { RecordingEventsHead } from '../../../composition/persistence/recordings/recording-events/contracts';

function descriptor(head: RecordingEventsHead, state = head.state): RecordingEventsDescriptor {
  return {
    format: 'recording-events-v1',
    formatVersion: 1,
    algorithm: 'lossless-v1',
    encoding: 'json-utf8-v1',
    eventStreamId: head.eventStreamId,
    finalized: true,
    state,
    totalBlocks: head.totalBlocks,
    totalRecords: head.totalRecords,
    totalBytes: head.totalBytes,
    streamSha256: head.streamSha256,
  };
}

/** Only the recording controller's admitted browser source reaches this bounded writer. */
export async function createBrowserRecordingEventsWriter(options: {
  recordingId: string;
  eventStreamId: string;
  width: number;
  height: number;
  store: Pick<
    ReturnType<typeof createRecordingEventsStore>,
    'begin' | 'append' | 'getHead' | 'finalize' | 'retire'
  >;
  pointTransform(): RecordingPointTransform | null;
}) {
  if (
    ![options.width, options.height].every(
      (value) => isTrajectoryInteger(value) && value > 0 && value <= 0xffffffff
    )
  )
    throw new Error('RECORDING_EVENTS_INVALID_GEOMETRY');
  const { width, height } = options;
  const identity = { recordingId: options.recordingId, eventStreamId: options.eventStreamId };
  const writer = await options.store.begin(identity);
  const packer = createRecordingEventsBlockPacker(identity.recordingId, identity.eventStreamId);
  let active: { id: number; clock: CursorTrajectorySegment['clock'] } | null = null;
  let segmentId = -1;
  let recordSeq = 0;
  let lastTime = 0;
  let documentId: string | null = null;
  let sourceSegment = -1;
  let sourceActive = false;
  let sourceRecordSeq = -1;
  let lastBatch = -1;
  let lastDigest = '';
  let clockKey: string | null = null;
  let sourceStopped = false;
  let lastBoundary: Extract<RecordingEventRecord, { kind: 'boundary' }>['reason'] | null = null;
  let failed = false;
  let hadGap = false;
  let unknownGeometry = false;
  let geometryWarning = false;
  let closed = false;
  let queued = 0;
  let tail: Promise<void> = Promise.resolve();
  let finishing: Promise<RecordingEventsDescriptor> | null = null;
  let signalStopped!: () => void;
  const stopped = new Promise<void>((resolve) => {
    signalStopped = resolve;
  });

  async function emit(record: RecordingEventRecord) {
    if (record.recordSeq !== recordSeq || !isTrajectoryInteger(recordSeq + 1))
      throw new Error('RECORDING_EVENTS_INTEGER_RANGE');
    for (const block of packer.append(record)) await options.store.append(writer, block);
    recordSeq++;
    lastTime = Math.max(
      lastTime,
      record.activeTimeUs,
      record.kind === 'gap' ? (record.toTimeUs ?? record.activeTimeUs) : 0
    );
  }
  async function begin(
    time: number,
    clock: CursorTrajectorySegment['clock'],
    reason: Extract<RecordingEventRecord, { kind: 'segment' }>['reason']
  ) {
    if (active) throw new Error('RECORDING_EVENTS_SEGMENT_OPEN');
    segmentId++;
    lastTime = time;
    active = { id: segmentId, clock: { ...clock } };
    await emit({
      kind: 'segment',
      recordSeq,
      segmentId,
      activeTimeUs: time,
      reason,
      clock: { ...clock },
    });
  }
  async function boundary(
    time: number,
    reason: Extract<RecordingEventRecord, { kind: 'boundary' }>['reason']
  ) {
    if (!active) return;
    await emit({ kind: 'boundary', recordSeq, segmentId: active.id, activeTimeUs: time, reason });
    active = null;
  }
  async function gap(time: number, to: number | null, clock: CursorTrajectorySegment['clock']) {
    if (!active) await begin(time, clock, hadGap ? 'after-gap' : 'start');
    await emit({
      kind: 'gap',
      recordSeq,
      segmentId,
      activeTimeUs: time,
      source: 'producer',
      fromTimeUs: time,
      toTimeUs: to,
      firstLostSourceSeq: null,
      lastLostSourceSeq: null,
      lostCount: null,
      reason: 'source-unavailable',
    });
    active = null;
    hadGap = true;
  }
  function projectPoint(
    point: RecordingEventPoint | null,
    packet: RecordingEventObservationPacket,
    transform: RecordingPointTransform | null
  ): { point: RecordingEventPoint | null; unavailable: boolean } {
    if (point === null) return { point: null, unavailable: false };
    if (
      !transform ||
      !Object.entries(transform.viewport).every(([name, value]) =>
        Object.entries(packet.viewport).some(([key, actual]) => key === name && actual === value)
      )
    )
      return { point: null, unavailable: true };
    const x = point.x * packet.viewport.width;
    const y = point.y * packet.viewport.height;
    const rect = transform.visibleClientRect;
    if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height)
      return { point: null, unavailable: false };
    const xQ8 = Math.floor((x * transform.scaleX + transform.offsetX) * width * 256 + 0.5);
    const yQ8 = Math.floor((y * transform.scaleY + transform.offsetY) * height * 256 + 0.5);
    if (
      !isTrajectoryInteger(xQ8) ||
      !isTrajectoryInteger(yQ8) ||
      xQ8 >= width * 256 ||
      yQ8 >= height * 256
    )
      return { point: null, unavailable: true };
    return {
      point: { x: xQ8 / (width * 256), y: yQ8 / (height * 256) },
      unavailable: false,
    };
  }
  async function mapped(input: RecordingEventRecord, packet: RecordingEventObservationPacket) {
    const record = structuredClone(input);
    const transform = options.pointTransform();
    let unavailable = false;
    const point = (value: RecordingEventPoint | null) => {
      const result = projectPoint(value, packet, transform);
      unavailable ||= result.unavailable;
      return result.point;
    };
    if (record.kind === 'action') {
      record.action.point = point(record.action.point);
      if (record.action.kind === 'CLICK')
        record.action.data.upPoint = point(record.action.data.upPoint);
    } else if (record.kind === 'action-update' && 'upPoint' in record.data)
      record.data.upPoint = point(record.data.upPoint);
    else if (record.kind === 'signal') record.signal.point = point(record.signal.point);
    await emit({ ...record, recordSeq, segmentId });
    if (unavailable) {
      unknownGeometry = true;
      if (!geometryWarning) {
        geometryWarning = true;
        await emit({
          kind: 'signal',
          recordSeq,
          segmentId,
          activeTimeUs: input.activeTimeUs,
          signal: {
            id: crypto.randomUUID(),
            kind: 'static-frame',
            startTimeUs: input.activeTimeUs,
            endTimeUs: input.activeTimeUs,
            point: null,
            data: { source: 'recording-events', code: 'source-unavailable', severity: 'warning' },
          },
        });
      }
    }
  }
  async function process(
    packet: RecordingEventObservationPacket,
    nativeDocumentId: string,
    digest: string
  ) {
    if (failed) throw new Error('RECORDING_EVENTS_STORAGE_UNAVAILABLE');
    const changedDocument = documentId !== nativeDocumentId;
    if (!changedDocument && packet.batchSequence === lastBatch) {
      if (digest !== lastDigest) throw new Error('RECORDING_EVENTS_CONFLICT');
      return;
    }
    if (sourceStopped) throw new Error('RECORDING_EVENTS_SOURCE_STOPPED');
    if (packet.batchSequence !== (changedDocument ? 0 : lastBatch + 1))
      throw new Error('RECORDING_EVENTS_BATCH_SEQUENCE');
    const first = packet.records[0]!;
    if (changedDocument) {
      if (documentId !== null && active)
        await gap(
          lastTime,
          first.activeTimeUs >= lastTime ? first.activeTimeUs : null,
          active.clock
        );
      documentId = nativeDocumentId;
      sourceSegment = -1;
      sourceActive = false;
      sourceRecordSeq = -1;
      clockKey = null;
    }
    const nextClock = JSON.stringify([
      packet.sourceClockId,
      packet.clockRevision,
      packet.clock.source,
      packet.clock.timestampQuantumUs,
      packet.clock.resolutionBoundUs,
      packet.clock.mappingUncertaintyUs,
    ]);
    if (clockKey !== null && clockKey !== nextClock && active) {
      await boundary(lastTime, 'clock-discontinuity');
      if (first.kind !== 'segment')
        await begin(first.activeTimeUs, packet.clock, 'clock-discontinuity');
    }
    clockKey = nextClock;
    for (const input of packet.records) {
      if (input.recordSeq !== sourceRecordSeq + 1)
        throw new Error('RECORDING_EVENTS_SOURCE_SEQUENCE');
      sourceRecordSeq = input.recordSeq;
      if (input.kind === 'segment') {
        if (
          sourceActive ||
          (sourceSegment === -1 ? input.segmentId !== 0 : input.segmentId <= sourceSegment)
        )
          throw new Error('RECORDING_EVENTS_SOURCE_SEGMENT');
        sourceSegment = input.segmentId;
        sourceActive = true;
        await begin(
          input.activeTimeUs,
          packet.clock,
          hadGap && input.reason === 'start' ? 'after-gap' : input.reason
        );
      } else if (input.kind === 'boundary') {
        if (input.segmentId !== sourceSegment && !(sourceSegment === -1 && input.reason === 'stop'))
          throw new Error('RECORDING_EVENTS_SOURCE_SEGMENT');
        if (!sourceActive && input.reason !== 'stop')
          throw new Error('RECORDING_EVENTS_SOURCE_SEGMENT');
        await boundary(input.activeTimeUs, input.reason);
        sourceActive = false;
        lastBoundary = input.reason;
        if (input.reason === 'stop') {
          sourceStopped = true;
          signalStopped();
        }
      } else {
        if (!sourceActive || input.segmentId !== sourceSegment)
          throw new Error('RECORDING_EVENTS_SOURCE_SEGMENT');
        if (!active)
          await begin(
            input.activeTimeUs,
            packet.clock,
            hadGap ? 'after-gap' : 'clock-discontinuity'
          );
        await mapped(input, packet);
        if (input.kind === 'gap') {
          active = null;
          sourceActive = false;
          hadGap = true;
        }
      }
    }
    lastBatch = packet.batchSequence;
    lastDigest = digest;
  }

  return {
    append(value: unknown, nativeDocumentId: string): Promise<void> {
      if (closed) return Promise.reject(new Error('RECORDING_EVENTS_CLOSED'));
      if (queued >= 2) return Promise.reject(new Error('RECORDING_EVENTS_BACKPRESSURE'));
      if (
        !isRecordingEventObservationPacket(value) ||
        value.recordingId !== identity.recordingId ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(nativeDocumentId)
      )
        return Promise.reject(new Error('RECORDING_EVENTS_INVALID_INPUT'));
      const packet = structuredClone(value);
      const digest = Array.from(sha256(new TextEncoder().encode(JSON.stringify(packet))), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      queued++;
      const work = tail.then(() => process(packet, nativeDocumentId, digest));
      tail = work.catch(() => {
        failed = true;
      });
      return work.finally(() => {
        queued--;
      });
    },
    finish(
      stop: { waitForSourceStop?: boolean; stoppedWhilePaused?: boolean } = {}
    ): Promise<RecordingEventsDescriptor> {
      finishing ??= (async () => {
        if (stop.waitForSourceStop && !sourceStopped && !failed) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              stopped,
              new Promise<void>((resolve) => {
                timer = setTimeout(resolve, 2000);
              }),
            ]);
          } finally {
            if (timer !== undefined) clearTimeout(timer);
          }
        }
        closed = true;
        await tail;
        const confirmedPause = stop.stoppedWhilePaused && lastBoundary === 'pause' && !sourceActive;
        if (!failed) {
          try {
            if (!sourceStopped && !confirmedPause && active)
              await gap(lastTime, null, active.clock);
            for (const block of packer.finish()) await options.store.append(writer, block);
          } catch {
            failed = true;
          }
        }
        const head = await options.store.getHead(identity);
        if (!head) throw new Error('RECORDING_EVENTS_STORAGE_UNAVAILABLE');
        const state =
          head.totalBlocks === 0
            ? 'unavailable'
            : failed ||
                hadGap ||
                unknownGeometry ||
                head.activeInputs > 0 ||
                (!sourceStopped && !confirmedPause)
              ? 'incomplete'
              : 'complete';
        return descriptor(await options.store.finalize(writer, descriptor(head, state)));
      })();
      const attempt = finishing;
      return attempt.catch((error: unknown) => {
        if (finishing === attempt) finishing = null;
        throw error;
      });
    },
    async discard(): Promise<void> {
      closed = true;
      await tail;
      await options.store.retire(identity, writer.writerGeneration);
    },
  };
}
