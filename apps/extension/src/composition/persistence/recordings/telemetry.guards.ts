import type { RecordingTelemetryEntry } from './contracts';
import { parseStoredEntry } from '../infrastructure/indexed-db/guards/entries';
import { isRecordingTelemetrySnapshot } from '../../../features/video/project/validation/recording-telemetry';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type StoredRecordingTelemetryEntry = Omit<RecordingTelemetryEntry, 'signals'> & {
  signals?: RecordingTelemetryEntry['signals'];
};

function isRecordingTelemetryEntry(value: unknown): value is StoredRecordingTelemetryEntry {
  return (
    isRecord(value) &&
    isString(value['recordingId']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt']) &&
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
