import type { StoredRecordingEntry } from './contracts';
import type { ParsedStoredEntriesValue } from '../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';

type ParsedRecordingEntriesValue = ParsedStoredEntriesValue<StoredRecordingEntry>;

function parseRecordingEntryValue(value: unknown): StoredRecordingEntry | null {
  if (!isRecord(value)) return null;
  if (
    !(
      isString(value['assetId']) &&
      isString(value['id']) &&
      isString(value['filename']) &&
      isString(value['mimeType']) &&
      isNumber(value['createdAt']) &&
      isNumber(value['size']) &&
      value['assetId'].length > 0 &&
      value['id'].length > 0 &&
      value['filename'].length > 0 &&
      value['mimeType'].length > 0 &&
      Number.isFinite(value['createdAt']) &&
      Number.isSafeInteger(value['size']) &&
      value['size'] >= 0
    )
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: value['createdAt'],
  });
  if (lifecycle === null) return null;
  return {
    assetId: value['assetId'],
    createdAt: value['createdAt'],
    filename: value['filename'],
    id: value['id'],
    mimeType: value['mimeType'],
    ...(lifecycle === undefined ? {} : { lifecycle }),
    size: value['size'],
  };
}

export function parseRecordingEntry(value: unknown): StoredRecordingEntry | null {
  return parseRecordingEntryValue(value);
}

export function parseRecordingEntries(value: unknown): ParsedRecordingEntriesValue {
  if (!Array.isArray(value)) {
    return { entries: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }
  const entries = value.map(parseRecordingEntryValue);
  return {
    entries: entries.filter((entry): entry is StoredRecordingEntry => entry !== null),
    hasInvalidRoot: false,
    invalidEntryCount: entries.filter((entry) => entry === null).length,
  };
}
