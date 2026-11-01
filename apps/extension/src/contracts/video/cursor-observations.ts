import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryClock,
  isTrajectoryInteger,
} from '../../features/video/project/cursor-trajectory/records';
import type {
  CursorTrajectoryBoundaryReason,
  CursorTrajectorySample,
  CursorTrajectorySegment,
} from '../../features/video/project/cursor-trajectory/types';
import type { RecordingViewportGeometry } from '../../features/video/project/types';

export const RECORDING_CURSOR_PACKET_MAX_RECORDS = 64;
export const RECORDING_CURSOR_PACKET_MAX_BYTES = 65_536;
export const RECORDING_CURSOR_INPUT_QUEUE_CAPACITY = 512;

export interface RecordingCursorPointObservation {
  kind: 'sample';
  localSequence: number;
  activeTimeUs: number;
  x: number | null;
  y: number | null;
  observed: boolean;
  visible: boolean;
  event: CursorTrajectorySample['event'];
  button: CursorTrajectorySample['button'];
  relatedLocalSequence: number | null;
}

export interface RecordingCursorBoundaryObservation {
  kind: 'boundary';
  activeTimeUs: number;
  reason: CursorTrajectoryBoundaryReason;
}

export interface RecordingCursorGapObservation {
  kind: 'gap';
  fromTimeUs: number;
  toTimeUs: number | null;
  firstLostLocalSequence: number | null;
  lastLostLocalSequence: number | null;
  reason: 'input-overflow' | 'source-unavailable';
}

export type RecordingCursorObservation =
  | RecordingCursorPointObservation
  | RecordingCursorBoundaryObservation
  | RecordingCursorGapObservation;

/** Internal browser transport. Native sender metadata supplies the document identity separately. */
export interface RecordingCursorObservationPacket {
  version: 1;
  recordingId: string;
  batchSequence: number;
  sourceClockId: string;
  clockRevision: number;
  clock: CursorTrajectorySegment['clock'];
  viewport: RecordingViewportGeometry;
  records: RecordingCursorObservation[];
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function member(value: unknown, keys: readonly string[]): boolean {
  return typeof value === 'string' && keys.includes(value);
}

/** Only geometric pointer facts enter this transport. */
export function isRecordingCursorObservation(value: unknown): value is RecordingCursorObservation {
  if (!isPlainRecord(value)) return false;
  if (value['kind'] === 'sample') {
    const seq = value['localSequence'];
    const related = value['relatedLocalSequence'];
    return (
      exact(value, [
        'kind',
        'localSequence',
        'activeTimeUs',
        'x',
        'y',
        'observed',
        'visible',
        'event',
        'button',
        'relatedLocalSequence',
      ]) &&
      isTrajectoryInteger(seq) &&
      isTrajectoryInteger(value['activeTimeUs']) &&
      typeof value['observed'] === 'boolean' &&
      typeof value['visible'] === 'boolean' &&
      (value['observed']
        ? finite(value['x']) && finite(value['y'])
        : value['x'] === null && value['y'] === null) &&
      member(value['event'], ['move', 'down', 'up', 'click']) &&
      member(value['button'], ['none', 'left', 'middle', 'right', 'x1', 'x2']) &&
      (related === null ||
        (value['event'] === 'click' && isTrajectoryInteger(related) && related < seq))
    );
  }
  if (value['kind'] === 'boundary')
    return (
      exact(value, ['kind', 'activeTimeUs', 'reason']) &&
      isTrajectoryInteger(value['activeTimeUs']) &&
      member(value['reason'], [
        'pause',
        'stop',
        'visibility',
        'observation',
        'geometry',
        'clock-discontinuity',
        'zero-time-discontinuity',
      ])
    );
  if (value['kind'] !== 'gap') return false;
  const from = value['fromTimeUs'];
  const to = value['toTimeUs'];
  const first = value['firstLostLocalSequence'];
  const last = value['lastLostLocalSequence'];
  return (
    exact(value, [
      'kind',
      'fromTimeUs',
      'toTimeUs',
      'firstLostLocalSequence',
      'lastLostLocalSequence',
      'reason',
    ]) &&
    isTrajectoryInteger(from) &&
    (to === null || (isTrajectoryInteger(to) && to >= from)) &&
    ((first === null && last === null) ||
      (isTrajectoryInteger(first) && isTrajectoryInteger(last) && last >= first)) &&
    member(value['reason'], ['input-overflow', 'source-unavailable'])
  );
}

/** Closed shapes and per-packet budgets apply before the source adapter receives any facts. */
export function isRecordingCursorObservationPacket(
  value: unknown
): value is RecordingCursorObservationPacket {
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
  const shape =
    value['version'] === 1 &&
    typeof value['recordingId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['recordingId']) &&
    typeof value['sourceClockId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value['sourceClockId']) &&
    isTrajectoryInteger(value['batchSequence']) &&
    isTrajectoryInteger(value['clockRevision']) &&
    isCursorTrajectoryClock(value['clock']) &&
    value['clock'].source === 'dom-event-time' &&
    isPlainRecord(viewport) &&
    exact(viewport, [
      'width',
      'height',
      'devicePixelRatio',
      'visualViewportScale',
      'visualViewportOffsetX',
      'visualViewportOffsetY',
    ]) &&
    ['width', 'height', 'devicePixelRatio', 'visualViewportScale'].every(
      (key) => finite(viewport[key]) && viewport[key] > 0
    ) &&
    finite(viewport['visualViewportOffsetX']) &&
    finite(viewport['visualViewportOffsetY']) &&
    Array.isArray(records) &&
    records.length > 0 &&
    records.length <= RECORDING_CURSOR_PACKET_MAX_RECORDS &&
    records.every(isRecordingCursorObservation);
  if (!shape) return false;
  return (
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= RECORDING_CURSOR_PACKET_MAX_BYTES
  );
}
