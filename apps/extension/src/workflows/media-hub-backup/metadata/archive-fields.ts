import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import { readString } from './readers';
import { safeBackupPathSegment } from './path-segments';

export function readSafeBackupPathSegment(value: unknown, label: string): string {
  return safeBackupPathSegment(readString(value), label);
}

export function readSafeExportFilename(value: unknown): string {
  const filename = readString(value);
  if (!isSafeArchiveEntryLeafFilename(filename)) {
    throw new Error('Invalid export filename in backup metadata.');
  }
  return filename;
}
