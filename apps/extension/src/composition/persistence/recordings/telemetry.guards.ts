import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import { isRecordingEventsSnapshot } from './recording-events/guards';
import type { RecordingTelemetryEntry } from './contracts';
import { isRecordingCursorTrajectorySnapshot } from './cursor-trajectory/guards';
import { isCursorTrajectoryDescriptor } from '../../../features/video/project/cursor-trajectory/records';
import { parseStoredEntry } from '../infrastructure/indexed-db/guards/entries';
import {
  isRecordingTelemetrySnapshot,
  isRecordingTelemetryProvenance,
} from '../../../features/video/project/validation/recording-telemetry';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type StoredRecordingTelemetryEntry = Omit<RecordingTelemetryEntry, 'signals'> & {
  signals?: RecordingTelemetryEntry['signals'];
};

function isRecordingTelemetryEntry(value: unknown): value is StoredRecordingTelemetryEntry {
  return (
    isRecord(value) &&
    (value['recordingEvents'] === undefined ||
      isRecordingEventsDescriptor(value['recordingEvents'])) &&
    (value['recordingEventsSnapshot'] === undefined ||
      isRecordingEventsSnapshot(value['recordingEventsSnapshot'], value['recordingEvents'])) &&
    (value['cursorTrajectorySnapshot'] === undefined ||
      isRecordingCursorTrajectorySnapshot(
        value['cursorTrajectorySnapshot'],
        value['cursorTrajectory']
      )) &&
    (value['cursorTrajectory'] === undefined ||
      isCursorTrajectoryDescriptor(value['cursorTrajectory'])) &&
    (value['provenance'] === undefined || isRecordingTelemetryProvenance(value['provenance'])) &&
    isString(value['recordingId']) &&
    value['recordingId'].trim().length > 0 &&
    isNumber(value['createdAt']) &&
    value['createdAt'] >= 0 &&
    isNumber(value['updatedAt']) &&
    value['updatedAt'] >= value['createdAt'] &&
    (value['captureMode'] === null || isString(value['captureMode'])) &&
    (value['displaySurface'] === undefined ||
      value['displaySurface'] === null ||
      isString(value['displaySurface'])) &&
    isRecordingTelemetrySnapshot(value)
  );
}

export function parseRecordingTelemetryEntry(value: unknown): RecordingTelemetryEntry | null {
  const entry = parseStoredEntry(value, isRecordingTelemetryEntry);
  return entry === null ? null : { ...entry, signals: entry.signals ?? [] };
}
