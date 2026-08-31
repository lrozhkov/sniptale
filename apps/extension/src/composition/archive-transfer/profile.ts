import {
  MAX_MEDIA_ARCHIVE_BYTES,
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
  MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES,
  type ArchiveResourceProfile,
} from './contracts';

interface ArchiveBudget {
  entries: number;
  inflatedBytes: number;
}

const DEFAULT_ARCHIVE_RESOURCE_PROFILE: ArchiveResourceProfile = {
  maxArchiveBytes: MAX_MEDIA_ARCHIVE_BYTES,
  maxEntries: MAX_MEDIA_ARCHIVE_ENTRIES,
  maxEntryBytes: MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
  maxInflatedBytes: MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
};

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Media archive ${label} must be a positive safe integer.`);
  }
}

export function normalizeArchiveResourceProfile(
  profile: ArchiveResourceProfile = DEFAULT_ARCHIVE_RESOURCE_PROFILE
): ArchiveResourceProfile {
  assertPositiveSafeInteger(profile.maxArchiveBytes, 'compressed byte budget');
  assertPositiveSafeInteger(profile.maxEntries, 'entry budget');
  assertPositiveSafeInteger(profile.maxEntryBytes, 'entry byte budget');
  assertPositiveSafeInteger(profile.maxInflatedBytes, 'inflated byte budget');
  if (profile.maxEntryBytes > profile.maxInflatedBytes) {
    throw new Error('Media archive entry byte budget exceeds its inflated byte budget.');
  }
  return { ...profile };
}

export function createArchiveBudget(): ArchiveBudget {
  return { entries: 0, inflatedBytes: 0 };
}

export function admitArchiveEntry(
  budget: ArchiveBudget,
  size: number,
  profile: ArchiveResourceProfile = DEFAULT_ARCHIVE_RESOURCE_PROFILE
): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > profile.maxEntryBytes) {
    throw new Error('Media archive entry has an invalid size.');
  }
  budget.entries += 1;
  budget.inflatedBytes += size;
  if (budget.entries > profile.maxEntries || budget.inflatedBytes > profile.maxInflatedBytes) {
    throw new Error('Media archive exceeds its resource profile.');
  }
}

export function assertArchiveFileSize(
  size: number,
  profile: ArchiveResourceProfile = DEFAULT_ARCHIVE_RESOURCE_PROFILE
): void {
  if (!Number.isSafeInteger(size) || size <= 0 || size > profile.maxArchiveBytes) {
    throw new Error('Media archive exceeds its compressed byte budget.');
  }
}

export function assertArchiveTextSize(size: number, maxBytes = MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES) {
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new Error('Media archive text entry exceeds its byte budget.');
  }
}
