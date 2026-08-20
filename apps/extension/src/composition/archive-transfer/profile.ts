import {
  MAX_MEDIA_ARCHIVE_BYTES,
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
  MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES,
} from './contracts';

interface ArchiveBudget {
  entries: number;
  inflatedBytes: number;
}

export function createArchiveBudget(): ArchiveBudget {
  return { entries: 0, inflatedBytes: 0 };
}

export function admitArchiveEntry(budget: ArchiveBudget, size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MEDIA_ARCHIVE_INFLATED_BYTES) {
    throw new Error('Media archive entry has an invalid size.');
  }
  budget.entries += 1;
  budget.inflatedBytes += size;
  if (
    budget.entries > MAX_MEDIA_ARCHIVE_ENTRIES ||
    budget.inflatedBytes > MAX_MEDIA_ARCHIVE_INFLATED_BYTES
  ) {
    throw new Error('Media archive exceeds its resource profile.');
  }
}

export function assertArchiveFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_MEDIA_ARCHIVE_BYTES) {
    throw new Error('Media archive exceeds its compressed byte budget.');
  }
}

export function assertArchiveTextSize(size: number, maxBytes = MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES) {
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new Error('Media archive text entry exceeds its byte budget.');
  }
}
