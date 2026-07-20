import type { RecordingEntry } from './contracts';
import {
  parseStoredEntries,
  parseStoredEntry,
  type ParsedStoredEntriesValue,
} from '../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type ParsedRecordingEntriesValue = ParsedStoredEntriesValue<RecordingEntry>;

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

function isRecordingEntry(value: unknown): value is RecordingEntry {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isBlob(value['blob']) &&
    isString(value['filename']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['size'])
  );
}

export function parseRecordingEntry(value: unknown): RecordingEntry | null {
  return parseStoredEntry(value, isRecordingEntry);
}

export function parseRecordingEntries(value: unknown): ParsedRecordingEntriesValue {
  return parseStoredEntries(value, isRecordingEntry);
}
