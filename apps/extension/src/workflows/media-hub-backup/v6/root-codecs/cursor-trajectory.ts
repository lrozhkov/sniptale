import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isCursorTrajectoryDescriptor,
  isTrajectoryInteger,
} from '../../../../features/video/project/cursor-trajectory/records';
import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';

/** Removes only the local native file identity; captured facts and the descriptor remain intact. */
export function portableRecordingTelemetry(
  entry: RecordingTelemetryEntry
): Omit<RecordingTelemetryEntry, 'cursorTrajectorySnapshot' | 'recordingEventsSnapshot'> {
  const {
    cursorTrajectorySnapshot: _localSnapshot,
    recordingEventsSnapshot: _localEventsSnapshot,
    ...portable
  } = entry;
  return portable;
}

export interface PortableCursorTrajectoryAttachment {
  recordingId: string;
  sourceRecordingId: string;
  width: number;
  height: number;
  descriptor: CursorTrajectoryDescriptor;
  objectId: string;
}

const objectIdPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const recordingIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

/** Portable references contain no local writer generation or source points. */
export function isPortableCursorTrajectoryAttachment(
  value: unknown
): value is PortableCursorTrajectoryAttachment {
  return (
    isPlainRecord(value) &&
    exact(value, [
      'recordingId',
      'sourceRecordingId',
      'width',
      'height',
      'descriptor',
      'objectId',
    ]) &&
    typeof value['recordingId'] === 'string' &&
    recordingIdPattern.test(value['recordingId']) &&
    typeof value['sourceRecordingId'] === 'string' &&
    recordingIdPattern.test(value['sourceRecordingId']) &&
    isTrajectoryInteger(value['width']) &&
    value['width'] > 0 &&
    value['width'] <= 0xffffffff &&
    isTrajectoryInteger(value['height']) &&
    value['height'] > 0 &&
    value['height'] <= 0xffffffff &&
    isCursorTrajectoryDescriptor(value['descriptor']) &&
    value['descriptor'].finalized &&
    value['descriptor'].totalBlocks > 0 &&
    typeof value['objectId'] === 'string' &&
    objectIdPattern.test(value['objectId']) &&
    Number.isSafeInteger(value['descriptor'].totalBytes + 4 * value['descriptor'].totalBlocks)
  );
}
