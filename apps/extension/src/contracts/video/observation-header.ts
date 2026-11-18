import {
  hasExactKeys,
  isNumber,
  isPlainRecord,
} from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryClock,
  isTrajectoryInteger,
} from '../../features/video/project/cursor-trajectory/records';
import type { CursorTrajectorySegment } from '../../features/video/project/cursor-trajectory/types';

function isIdentifier(value: unknown): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

/** Cursor and event packets use the same closed observation envelope and clock. */
export function isRecordingObservationHeader(
  value: unknown
): value is Record<string, unknown> & { clock: CursorTrajectorySegment['clock'] } {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'recordingId',
      'batchSequence',
      'sourceClockId',
      'clockRevision',
      'clock',
      'viewport',
      'records',
      ...(Object.hasOwn(value, 'sourceInstanceId') ? ['sourceInstanceId'] : []),
    ])
  )
    return false;
  const viewport = value['viewport'];
  return (
    value['version'] === 1 &&
    isIdentifier(value['recordingId']) &&
    isIdentifier(value['sourceClockId']) &&
    (!Object.hasOwn(value, 'sourceInstanceId') || isIdentifier(value['sourceInstanceId'])) &&
    isTrajectoryInteger(value['batchSequence']) &&
    isTrajectoryInteger(value['clockRevision']) &&
    isCursorTrajectoryClock(value['clock']) &&
    value['clock'].source === 'dom-event-time' &&
    isPlainRecord(viewport) &&
    hasExactKeys(viewport, [
      'width',
      'height',
      'devicePixelRatio',
      'visualViewportScale',
      'visualViewportOffsetX',
      'visualViewportOffsetY',
    ]) &&
    ['width', 'height', 'devicePixelRatio', 'visualViewportScale'].every(
      (key) => isNumber(viewport[key]) && viewport[key] > 0
    ) &&
    isNumber(viewport['visualViewportOffsetX']) &&
    isNumber(viewport['visualViewportOffsetY'])
  );
}
