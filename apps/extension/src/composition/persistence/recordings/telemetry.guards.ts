import type { RecordingTelemetryEntry } from './contracts';
import { parseStoredEntry } from '../infrastructure/indexed-db/guards/entries';
import { isRecordingTelemetrySnapshot } from '../../../features/video/project/validation/recording-telemetry';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type StoredRecordingTelemetryEntry = Omit<RecordingTelemetryEntry, 'signals'> & {
  signals?: RecordingTelemetryEntry['signals'];
};

function isTelemetryProvenance(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      value['source'] === 'native' &&
      value['normalizationVersion'] === 1 &&
      value['timeUnit'] === 'seconds' &&
      value['coordinateSpace'] === 'desktop' &&
      Object.keys(value).every((key) =>
        ['source', 'normalizationVersion', 'timeUnit', 'coordinateSpace'].includes(key)
      ))
  );
}

function isRecordingTelemetryEntry(value: unknown): value is StoredRecordingTelemetryEntry {
  return (
    isRecord(value) &&
    isTelemetryProvenance(value['provenance']) &&
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
