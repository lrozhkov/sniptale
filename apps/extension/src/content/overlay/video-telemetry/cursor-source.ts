import {
  RECORDING_CURSOR_INPUT_QUEUE_CAPACITY,
  RECORDING_CURSOR_PACKET_MAX_RECORDS,
  type RecordingCursorObservation,
  type RecordingCursorObservationPacket,
  type RecordingCursorPointObservation,
} from '../../../contracts/video/cursor-observations';
import type { RecordingViewportGeometry } from '../../../features/video/project/types';

export interface CursorSourceMoment {
  sourceClockId: string;
  observationTimeSeconds: number;
  viewport: RecordingViewportGeometry;
}

type Projection = Pick<RecordingCursorObservationPacket, 'clock' | 'clockRevision'> & {
  activeTimeUs: number;
};
type PendingRecord = {
  moment: CursorSourceMoment;
  record: RecordingCursorObservation;
  endMoment?: CursorSourceMoment;
};

/** Bounded source input. The recording runtime owns normalization and durable storage. */
export function createCursorObservationSource(options: {
  recordingId: string;
  project(moment: CursorSourceMoment): Projection;
  send(packet: RecordingCursorObservationPacket): Promise<void>;
}) {
  const queue: PendingRecord[] = [];
  let loss: PendingRecord | null = null;
  let terminal: PendingRecord | null = null;
  let retry: RecordingCursorObservationPacket | null = null;
  let running: Promise<boolean> | null = null;
  let barrier: Promise<void> = Promise.resolve();
  let batchSequence = 0;
  let localSequence = 0;
  let closed = false;

  function snapshot(moment: CursorSourceMoment): CursorSourceMoment {
    return { ...moment, viewport: { ...moment.viewport } };
  }
  function lost(input: PendingRecord) {
    if (!loss) {
      loss = {
        moment: input.moment,
        endMoment: input.moment,
        record: {
          kind: 'gap',
          fromTimeUs: 0,
          toTimeUs: null,
          firstLostLocalSequence: null,
          lastLostLocalSequence: null,
          reason: 'input-overflow',
        },
      };
    }
    if (loss.record.kind !== 'gap') return;
    loss.endMoment = input.moment;
    if (input.record.kind === 'sample') {
      loss.record.firstLostLocalSequence ??= input.record.localSequence;
      loss.record.lastLostLocalSequence = input.record.localSequence;
      terminal = null;
    } else terminal = input;
  }
  function refill() {
    if (loss && queue.length < RECORDING_CURSOR_INPUT_QUEUE_CAPACITY) {
      queue.push(loss);
      loss = null;
    }
    if (!loss && terminal && queue.length < RECORDING_CURSOR_INPUT_QUEUE_CAPACITY) {
      queue.push(terminal);
      terminal = null;
    }
  }
  function encode(input: PendingRecord, projection: Projection): RecordingCursorObservation {
    if (input.record.kind !== 'gap')
      return { ...input.record, activeTimeUs: projection.activeTimeUs };
    const end = input.endMoment;
    const to =
      end?.sourceClockId === input.moment.sourceClockId ? options.project(end).activeTimeUs : null;
    return {
      ...input.record,
      fromTimeUs: projection.activeTimeUs,
      toTimeUs: to === null ? null : Math.max(projection.activeTimeUs, to),
    };
  }
  function packet(): RecordingCursorObservationPacket | null {
    refill();
    const first = queue[0];
    if (!first) return null;
    const projection = options.project(first.moment);
    const viewport = first.moment.viewport;
    const key = JSON.stringify([
      first.moment.sourceClockId,
      projection.clockRevision,
      projection.clock,
      viewport,
    ]);
    const records: RecordingCursorObservation[] = [];
    while (queue.length && records.length < RECORDING_CURSOR_PACKET_MAX_RECORDS) {
      const next = queue[0];
      if (!next) break;
      const timing = options.project(next.moment);
      if (
        JSON.stringify([
          next.moment.sourceClockId,
          timing.clockRevision,
          timing.clock,
          next.moment.viewport,
        ]) !== key
      )
        break;
      records.push(encode(next, timing));
      queue.shift();
    }
    return {
      version: 1,
      recordingId: options.recordingId,
      batchSequence: batchSequence++,
      sourceClockId: first.moment.sourceClockId,
      clockRevision: projection.clockRevision,
      clock: projection.clock,
      viewport,
      records,
    };
  }
  function pump(): Promise<boolean> {
    if (running) return running;
    const work = (async () => {
      await barrier;
      try {
        for (;;) {
          retry ??= packet();
          if (!retry) return true;
          // A transport refusal retains the exact packet and sequence for the next attempt.
          await options.send(structuredClone(retry));
          retry = null;
        }
      } catch {
        return false;
      }
    })();
    running = work;
    void work.finally(() => {
      if (running === work) running = null;
    });
    return work;
  }
  function append(input: PendingRecord) {
    if (closed) return;
    refill();
    if (loss || terminal || queue.length >= RECORDING_CURSOR_INPUT_QUEUE_CAPACITY) lost(input);
    else queue.push(input);
    void pump();
  }
  return {
    /** Set the initial calibration barrier before the browser can deliver another input task. */
    waitForCalibration(work: Promise<unknown>) {
      barrier = work.then(
        () => undefined,
        () => undefined
      );
    },
    sample(
      moment: CursorSourceMoment,
      sample: Omit<RecordingCursorPointObservation, 'kind' | 'localSequence' | 'activeTimeUs'>
    ): number {
      const sequence = localSequence++;
      append({
        moment: snapshot(moment),
        record: { ...sample, kind: 'sample', localSequence: sequence, activeTimeUs: 0 },
      });
      return sequence;
    },
    boundary(
      moment: CursorSourceMoment,
      reason: Extract<RecordingCursorObservation, { kind: 'boundary' }>['reason']
    ) {
      append({ moment: snapshot(moment), record: { kind: 'boundary', activeTimeUs: 0, reason } });
    },
    /** A failed flush keeps its pending packet. The caller must report incomplete coverage. */
    async flush(): Promise<boolean> {
      return pump();
    },
    close() {
      closed = true;
    },
    get pendingCount() {
      return queue.length;
    },
  };
}
