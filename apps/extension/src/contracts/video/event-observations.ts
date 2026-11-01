import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryClock,
  isTrajectoryInteger,
} from '../../features/video/project/cursor-trajectory/records';
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
  sourceClockId: string;
  clockRevision: number;
  clock: CursorTrajectorySegment['clock'];
  viewport: RecordingViewportGeometry;
  records: RecordingEventRecord[];
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const identifier = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);

/** Closed packet admission precedes any sender binding or durable source processing. */
export function isRecordingEventObservationPacket(
  value: unknown
): value is RecordingEventObservationPacket {
  if (
    !isPlainRecord(value) ||
    !exact(value, [
      'version',
      'recordingId',
      'batchSequence',
      'sourceClockId',
      'clockRevision',
      'clock',
      'viewport',
      'records',
    ])
  )
    return false;
  const viewport = value['viewport'];
  const records = value['records'];
  if (
    value['version'] !== 1 ||
    !identifier(value['recordingId']) ||
    !identifier(value['sourceClockId']) ||
    !isTrajectoryInteger(value['batchSequence']) ||
    !isTrajectoryInteger(value['clockRevision']) ||
    !isCursorTrajectoryClock(value['clock']) ||
    value['clock'].source !== 'dom-event-time' ||
    !isPlainRecord(viewport) ||
    !exact(viewport, [
      'width',
      'height',
      'devicePixelRatio',
      'visualViewportScale',
      'visualViewportOffsetX',
      'visualViewportOffsetY',
    ]) ||
    !['width', 'height', 'devicePixelRatio', 'visualViewportScale'].every(
      (key) => finite(viewport[key]) && viewport[key] > 0
    ) ||
    !finite(viewport['visualViewportOffsetX']) ||
    !finite(viewport['visualViewportOffsetY']) ||
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
