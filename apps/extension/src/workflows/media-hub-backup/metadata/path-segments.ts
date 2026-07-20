import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';

function isSafeBackupPathSegment(value: string): boolean {
  return isSafeArchiveEntryLeafFilename(value) && encodeURIComponent(value) === value;
}

export function safeBackupPathSegment(value: string, label: string): string {
  if (!isSafeBackupPathSegment(value)) {
    throw new Error(`Invalid backup path segment: ${label}.`);
  }

  return value;
}
