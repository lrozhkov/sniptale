import { isFinalObservationBatch } from './observation-batches';
import { isRecordingObservationHeader } from './observation-header';
import { isRecordingEventRecord } from '../../features/video/project/recording-events/records';
import type { RecordingEventRecord } from '../../features/video/project/recording-events/types';
import type { CursorTrajectorySegment } from '../../features/video/project/cursor-trajectory/types';
import type { RecordingViewportGeometry } from '../../features/video/project/types';

export const RECORDING_EVENTS_PACKET_MAX_RECORDS = 64;
export const RECORDING_EVENTS_PACKET_MAX_BYTES = 65536;
export const RECORDING_EVENTS_INPUT_QUEUE_CAPACITY = 512;

/** Internal DOM transport. Sender metadata supplies the native document identity.
 * Times are projected video microseconds. Record/segment numbers are document-local.
 * Points refer to the normalized browser viewport, not the captured video frame.
 */
export interface RecordingEventObservationPacket {
  version: 1;
  recordingId: string;
  batchSequence: number;
  /** Stable producer instance. Legacy packets omit this field. */
  sourceInstanceId?: string;
  /** Observation phase identity, which can change on Resume. */
  sourceClockId: string;
  clockRevision: number;
  clock: CursorTrajectorySegment['clock'];
  viewport: RecordingViewportGeometry;
  records: RecordingEventRecord[];
}
/** Closed packet admission precedes any sender binding or durable source processing. */
export function isRecordingEventObservationPacket(
  value: unknown
): value is RecordingEventObservationPacket {
  if (!isRecordingObservationHeader(value)) return false;
  const records = value['records'];
  if (
    !Array.isArray(records) ||
    records.length < 1 ||
    records.length > RECORDING_EVENTS_PACKET_MAX_RECORDS ||
    !records.every(isRecordingEventRecord)
  )
    return false;
  let previous: number | null = null;
  for (const record of records) {
    if (previous !== null && record.recordSeq !== previous + 1) return false;
    previous = record.recordSeq;
    if (
      record.kind === 'segment' &&
      (record.clock.source !== 'dom-event-time' ||
        record.clock.timestampQuantumUs !== value['clock'].timestampQuantumUs ||
        record.clock.resolutionBoundUs !== value['clock'].resolutionBoundUs ||
        record.clock.mappingUncertaintyUs !== value['clock'].mappingUncertaintyUs)
    )
      return false;
  }
  return (
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= RECORDING_EVENTS_PACKET_MAX_BYTES
  );
}

/** Validates a bounded final packet batch from one producer incarnation. */
export function isFinalRecordingEventPackets(
  value: unknown
): value is RecordingEventObservationPacket[] {
  if (
    !isFinalObservationBatch(
      value,
      isRecordingEventObservationPacket,
      RECORDING_EVENTS_INPUT_QUEUE_CAPACITY + RECORDING_EVENTS_PACKET_MAX_RECORDS + 2
    )
  )
    return false;
  let previous: number | null = null;
  for (const packet of value)
    for (const record of packet.records) {
      if (previous !== null && record.recordSeq !== previous + 1) return false;
      previous = record.recordSeq;
    }
  return true;
}
