import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { parseRecordingTelemetryEntry } from '../../../composition/persistence/recordings/telemetry.guards.ts';
import type { BackupBlobDescriptor } from '../contracts/types';
import { failMetadata, field, type JsonRecord, readPath, readRecord } from './readers';

export function normalizeRecordingTelemetry(value: unknown): RecordingTelemetryEntry {
  const parsed = parseRecordingTelemetryEntry(value);
  if (!parsed) {
    failMetadata();
  }
  return parsed;
}

function normalizeBlobEntry(value: unknown): BackupBlobDescriptor['entry'] {
  const entry = readRecord(value);
  if ('blob' in entry) {
    failMetadata();
  }

  const normalized: JsonRecord = {};
  const keys = [
    'assetId',
    'createdAt',
    'duration',
    'filename',
    'format',
    'fps',
    'galleryAssetId',
    'height',
    'id',
    'mimeType',
    'projectId',
    'recordingId',
    'size',
    'updatedAt',
    'width',
  ];
  for (const key of keys) {
    if (key in entry) {
      normalized[key] = field(entry, key);
    }
  }

  if (
    typeof field(normalized, 'id') !== 'string' &&
    typeof field(normalized, 'assetId') !== 'string'
  ) {
    failMetadata();
  }

  return normalized as BackupBlobDescriptor['entry'];
}

export function normalizeBlobDescriptor(
  value: unknown,
  prefixes: readonly string[]
): BackupBlobDescriptor {
  const descriptor = readRecord(value);
  return {
    blobPath: readPath(field(descriptor, 'blobPath'), prefixes),
    entry: normalizeBlobEntry(field(descriptor, 'entry')),
  };
}
