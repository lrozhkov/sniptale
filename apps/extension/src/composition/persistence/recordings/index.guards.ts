import type { RecordingEntry } from './contracts';
import type { ParsedStoredEntriesValue } from '../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';

type ParsedRecordingEntriesValue = ParsedStoredEntriesValue<RecordingEntry>;

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

function parseRecordingEntryValue(value: unknown): RecordingEntry | null {
  if (!isRecord(value)) return null;
  if (
    !(
      isString(value['id']) &&
      isBlob(value['blob']) &&
      isString(value['filename']) &&
      isNumber(value['createdAt']) &&
      isNumber(value['size'])
    )
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: value['createdAt'],
  });
  if (lifecycle === null) return null;
  return {
    blob: value['blob'],
    createdAt: value['createdAt'],
    filename: value['filename'],
    id: value['id'],
    ...(lifecycle === undefined ? {} : { lifecycle }),
    size: value['size'],
  };
}

export function parseRecordingEntry(value: unknown): RecordingEntry | null {
  return parseRecordingEntryValue(value);
}

export function parseRecordingEntries(value: unknown): ParsedRecordingEntriesValue {
  if (!Array.isArray(value)) {
    return { entries: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }
  const entries = value.map(parseRecordingEntryValue);
  return {
    entries: entries.filter((entry): entry is RecordingEntry => entry !== null),
    hasInvalidRoot: false,
    invalidEntryCount: entries.filter((entry) => entry === null).length,
  };
}
