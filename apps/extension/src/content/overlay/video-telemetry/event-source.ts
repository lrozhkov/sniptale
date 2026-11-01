import {
  RECORDING_EVENTS_INPUT_QUEUE_CAPACITY,
  RECORDING_EVENTS_PACKET_MAX_BYTES,
  RECORDING_EVENTS_PACKET_MAX_RECORDS,
  isRecordingEventObservationPacket,
  type RecordingEventObservationPacket,
} from '../../../contracts/video/event-observations';
import {
  decodeRecordingEventCadence,
  encodeRecordingEventCadence,
  isRecordingEventRecord,
} from '../../../features/video/project/recording-events/records';
import type { RecordingEventRecord } from '../../../features/video/project/recording-events/types';
import type { CursorTrajectorySegment } from '../../../features/video/project/cursor-trajectory/types';
import type { RecordingViewportGeometry } from '../../../features/video/project/types';
import { isTrajectoryInteger } from '../../../features/video/project/cursor-trajectory/records';

type FactRecord = Extract<
  RecordingEventRecord,
  { kind: 'action' | 'action-update' | 'signal' | 'keyboard-repeat-block' }
>;
type Payload<T> = T extends FactRecord
  ? Omit<T, 'recordSeq' | 'segmentId' | 'activeTimeUs'>
  : never;
/** Absolute payload times use the document observation clock until packet projection. */
export type RecordingEventSourceFact = Payload<FactRecord>;
interface EventSourceMoment {
  sourceClockId: string;
  observationTimeSeconds: number;
  viewport: RecordingViewportGeometry;
}
type Pending = { moment: EventSourceMoment; record: RecordingEventRecord };
type Projection = {
  activeTimeUs: number;
  clockRevision: number;
  clock: CursorTrajectorySegment['clock'];
};
const sourceClock: CursorTrajectorySegment['clock'] = {
  source: 'dom-event-time',
  timestampQuantumUs: null,
  resolutionBoundUs: null,
  mappingUncertaintyUs: null,
};
const copyMoment = (moment: EventSourceMoment): EventSourceMoment => ({
  ...moment,
  viewport: { ...moment.viewport },
});
const protectedRecord = (record: RecordingEventRecord) =>
  record.kind === 'signal' &&
  record.signal.kind === 'typing' &&
  record.signal.data.privacy === 'protected';

/** Owns bounded source input and exact retry. The recording runtime owns durable publication. */
export function createRecordingEventSource(options: {
  recordingId: string;
  project(moment: EventSourceMoment): Projection;
  send(packet: RecordingEventObservationPacket): Promise<void>;
}) {
  const queue: Pending[] = [];
  let pendingProtected: Pending | null = null;
  let loss: Pending | null = null;
  let terminal: Pending | null = null;
  let retry: RecordingEventObservationPacket | null = null;
  let running: Promise<boolean> | null = null;
  let barrier: Promise<void> = Promise.resolve();
  let sequence = 0;
  let batch = 0;
  let segmentId = -1;
  let active = false;
  let paused = false;
  let closed = false;
  let failed = false;

  const time = (moment: EventSourceMoment) => Math.round(moment.observationTimeSeconds * 1000000);
  const refill = () => {
    if (loss && queue.length < RECORDING_EVENTS_INPUT_QUEUE_CAPACITY) {
      queue.push(loss);
      loss = null;
    }
    if (!loss && terminal && queue.length < RECORDING_EVENTS_INPUT_QUEUE_CAPACITY) {
      queue.push(terminal);
      terminal = null;
    }
  };
  function fail(
    moment: EventSourceMoment,
    reason: Extract<RecordingEventRecord, { kind: 'gap' }>['reason']
  ): false {
    if (failed || closed) return false;
    failed = true;
    active = false;
    pendingProtected = null;
    const at = time(moment);
    if (isTrajectoryInteger(at) && isTrajectoryInteger(sequence))
      loss = {
        moment: copyMoment(moment),
        record: {
          kind: 'gap',
          recordSeq: sequence++,
          segmentId: Math.max(0, segmentId),
          activeTimeUs: at,
          source: 'producer',
          fromTimeUs: at,
          toTimeUs: null,
          firstLostSourceSeq: null,
          lastLostSourceSeq: null,
          lostCount: null,
          reason,
        },
      };
    void pump();
    return false;
  }
  function accept(moment: EventSourceMoment, record: RecordingEventRecord): boolean {
    refill();
    if (queue.length >= RECORDING_EVENTS_INPUT_QUEUE_CAPACITY || loss || terminal)
      return fail(moment, 'input-overflow');
    if (!isRecordingEventRecord(record)) return fail(moment, 'unknown-record');
    if (!isTrajectoryInteger(sequence + 1)) return fail(moment, 'counter-overflow');
    queue.push({ moment: copyMoment(moment), record: structuredClone(record) });
    sequence++;
    void pump();
    return true;
  }
  function flushProtected() {
    const pending = pendingProtected;
    pendingProtected = null;
    if (pending && !failed) accept(pending.moment, { ...pending.record, recordSeq: sequence });
  }
  function open(
    moment: EventSourceMoment,
    reason: Extract<RecordingEventRecord, { kind: 'segment' }>['reason'] = 'start'
  ): boolean {
    if (closed || failed) return false;
    if (active) return true;
    paused = false;
    segmentId++;
    if (!isTrajectoryInteger(segmentId)) return fail(moment, 'counter-overflow');
    active = true;
    return accept(moment, {
      kind: 'segment',
      recordSeq: sequence,
      segmentId,
      activeTimeUs: time(moment),
      clock: sourceClock,
      reason,
    });
  }
  function project(input: Pending): RecordingEventRecord {
    const moment = input.moment;
    const at = (value: number) =>
      options.project({ ...moment, observationTimeSeconds: value / 1000000 }).activeTimeUs;
    const nullable = (value: number | null) => (value === null ? null : at(value));
    const record = structuredClone(input.record);
    record.activeTimeUs = at(record.activeTimeUs);
    if (record.kind === 'segment') record.clock = { ...options.project(moment).clock };
    if (record.kind === 'action') {
      record.action.timeUs = at(record.action.timeUs);
      if (record.action.kind === 'KEY' || record.action.kind === 'CLICK') {
        const data = record.action.data;
        data.downTimeUs = nullable(data.downTimeUs);
        data.upTimeUs = nullable(data.upTimeUs);
        data.lastObservedTimeUs = nullable(data.lastObservedTimeUs);
        if (record.action.kind === 'KEY')
          record.action.data.keyboardOnsetTimeUs = nullable(record.action.data.keyboardOnsetTimeUs);
        else {
          record.action.data.semanticEndTimeUs = nullable(record.action.data.semanticEndTimeUs);
          record.action.data.dragStartTimeUs = nullable(record.action.data.dragStartTimeUs);
        }
      }
    } else if (record.kind === 'action-update') {
      record.data.upTimeUs = nullable(record.data.upTimeUs);
      record.data.lastObservedTimeUs = nullable(record.data.lastObservedTimeUs);
      if ('semanticEndTimeUs' in record.data) {
        record.data.semanticEndTimeUs = nullable(record.data.semanticEndTimeUs);
        record.data.dragStartTimeUs = nullable(record.data.dragStartTimeUs);
      }
    } else if (record.kind === 'signal') {
      record.signal.startTimeUs = at(record.signal.startTimeUs);
      record.signal.endTimeUs = at(record.signal.endTimeUs);
      if (record.signal.kind === 'keyboard-hold') {
        const data = record.signal.data;
        data.downTimeUs = nullable(data.downTimeUs);
        data.upTimeUs = nullable(data.upTimeUs);
        data.lastObservedTimeUs = nullable(data.lastObservedTimeUs);
        if (data.pressDurationUs !== null && data.downTimeUs !== null && data.upTimeUs !== null)
          data.pressDurationUs = data.upTimeUs - data.downTimeUs;
      }
      if (protectedRecord(record)) {
        record.signal.startTimeUs = Math.floor(record.signal.startTimeUs / 1000000) * 1000000;
        record.signal.endTimeUs = Math.ceil(record.signal.endTimeUs / 1000000) * 1000000;
        record.activeTimeUs = Math.floor(record.activeTimeUs / 1000000) * 1000000;
      }
    } else if (record.kind === 'keyboard-repeat-block') {
      const times = decodeRecordingEventCadence(record.cadence);
      if (!times) throw new Error('Invalid source cadence.');
      record.cadence = encodeRecordingEventCadence(record.cadence.id, times.map(at));
    } else if (record.kind === 'gap') {
      record.fromTimeUs = at(record.fromTimeUs);
      record.toTimeUs = nullable(record.toTimeUs);
    }
    if (!isRecordingEventRecord(record)) throw new Error('Event projection is unavailable.');
    return record;
  }
  function packet(): RecordingEventObservationPacket | null {
    refill();
    const first = queue[0];
    if (!first) return null;
    const timing = options.project(first.moment);
    const viewport = first.moment.viewport;
    const key = JSON.stringify([
      first.moment.sourceClockId,
      timing.clockRevision,
      timing.clock,
      viewport,
    ]);
    const header = {
      version: 1 as const,
      recordingId: options.recordingId,
      batchSequence: batch,
      sourceClockId: first.moment.sourceClockId,
      clockRevision: timing.clockRevision,
      clock: timing.clock,
      viewport,
    };
    const records: RecordingEventRecord[] = [];
    for (const input of queue) {
      if (records.length === RECORDING_EVENTS_PACKET_MAX_RECORDS) break;
      const nextTiming = options.project(input.moment);
      if (
        JSON.stringify([
          input.moment.sourceClockId,
          nextTiming.clockRevision,
          nextTiming.clock,
          input.moment.viewport,
        ]) !== key
      )
        break;
      const record = project(input);
      const next = { ...header, records: [...records, record] };
      if (
        new TextEncoder().encode(JSON.stringify(next)).byteLength >
        RECORDING_EVENTS_PACKET_MAX_BYTES
      ) {
        if (!records.length) throw new Error('Source event exceeds the packet budget.');
        break;
      }
      records.push(record);
    }
    const result = { ...header, records };
    if (!isRecordingEventObservationPacket(result)) throw new Error('Invalid source event packet.');
    if (!isTrajectoryInteger(batch + 1))
      throw new Error('Source batch counter exceeded the integer range.');
    queue.splice(0, records.length);
    batch++;
    return result;
  }
  function pump(): Promise<boolean> {
    if (running) return running;
    const work = (async () => {
      try {
        for (;;) {
          let waited: Promise<void>;
          do {
            waited = barrier;
            await waited;
          } while (waited !== barrier);
          retry ??= packet();
          if (!retry) return true;
          await options.send(structuredClone(retry));
          retry = null;
        }
      } catch {
        return false;
      }
    })();
    running = work;
    void work.then((drained) => {
      if (running !== work) return;
      running = null;
      if (drained && (queue.length || loss || terminal)) void pump();
    });
    return work;
  }
  return {
    open,
    emit(moment: EventSourceMoment, fact: RecordingEventSourceFact): boolean {
      if (closed || failed || paused) return false;
      const isProtected =
        fact.kind === 'signal' &&
        fact.signal.kind === 'typing' &&
        fact.signal.data.privacy === 'protected';
      const observed = isProtected
        ? { ...moment, observationTimeSeconds: Math.floor(moment.observationTimeSeconds) }
        : moment;
      if (!active && !open(observed, 'visibility')) return false;
      const record: RecordingEventRecord = {
        ...structuredClone(fact),
        recordSeq: sequence,
        segmentId,
        activeTimeUs: time(observed),
      };
      if (!isRecordingEventRecord(record)) return fail(observed, 'unknown-record');
      if (isProtected && record.kind === 'signal') {
        const previous = pendingProtected;
        if (
          previous?.record.kind === 'signal' &&
          previous.moment.sourceClockId === observed.sourceClockId &&
          record.signal.startTimeUs <= previous.record.signal.endTimeUs &&
          record.signal.endTimeUs >= previous.record.signal.startTimeUs
        ) {
          previous.record.signal.startTimeUs = Math.min(
            previous.record.signal.startTimeUs,
            record.signal.startTimeUs
          );
          previous.record.signal.endTimeUs = Math.max(
            previous.record.signal.endTimeUs,
            record.signal.endTimeUs
          );
        } else {
          flushProtected();
          if (!failed) pendingProtected = { moment: copyMoment(observed), record };
        }
        return !failed;
      }
      flushProtected();
      if (failed) return false;
      return accept(observed, { ...record, recordSeq: sequence });
    },
    contextGap(
      moment: EventSourceMoment,
      source: 'keyboard' | 'signal' | 'producer',
      reason: Extract<RecordingEventRecord, { kind: 'gap' }>['reason']
    ) {
      if (closed || failed || paused) return false;
      flushProtected();
      if (!active && !open(moment, 'after-gap')) return false;
      const at = time(moment);
      const accepted = accept(moment, {
        kind: 'gap',
        recordSeq: sequence,
        segmentId,
        activeTimeUs: at,
        source,
        fromTimeUs: at,
        toTimeUs: at,
        firstLostSourceSeq: null,
        lastLostSourceSeq: null,
        lostCount: null,
        reason,
      });
      active = false;
      return accepted && open(moment, 'after-gap');
    },
    boundary(
      moment: EventSourceMoment,
      reason: Extract<RecordingEventRecord, { kind: 'boundary' }>['reason']
    ) {
      if (closed) return;
      flushProtected();
      if (!active && reason !== 'stop') return;
      const record: RecordingEventRecord = {
        kind: 'boundary',
        recordSeq: sequence,
        segmentId: Math.max(0, segmentId),
        activeTimeUs: time(moment),
        reason,
      };
      if (failed && reason === 'stop') {
        if (!terminal && isRecordingEventRecord(record)) {
          terminal = { moment: copyMoment(moment), record };
          sequence++;
          void pump();
        }
      } else accept(moment, record);
      active = false;
      paused = reason === 'pause';
    },
    waitForCalibration(work: Promise<unknown>) {
      barrier = work.then(
        () => undefined,
        () => undefined
      );
    },
    flush: () => pump(),
    close() {
      flushProtected();
      closed = true;
    },
    get failed() {
      return failed;
    },
    get pendingCount() {
      return queue.length + Number(loss !== null) + Number(terminal !== null);
    },
  };
}
