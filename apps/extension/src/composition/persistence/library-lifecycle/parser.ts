import {
  isPlainRecord as isRecord,
  isNumber as isFiniteNumber,
} from '@sniptale/runtime-contracts/validation/primitives';
import type { LibraryLifecycle, LibraryStorageClass } from './contracts';

export function parseLibraryLifecycle(
  value: unknown,
  fallback: { storageClass: LibraryStorageClass; updatedAt: number }
): LibraryLifecycle | null | undefined {
  if (value === undefined) {
    return {
      storageClass: fallback.storageClass,
      updatedAt: fallback.updatedAt,
      savedAt: fallback.storageClass === 'library' ? fallback.updatedAt : null,
    };
  }
  if (!isRecord(value)) return null;
  const storageClass = value['storageClass'];
  const updatedAt = value['updatedAt'];
  const savedAt = value['savedAt'];
  const trashedAt = value['trashedAt'];
  if (
    (storageClass !== 'temporary' && storageClass !== 'library') ||
    !isFiniteNumber(updatedAt) ||
    (trashedAt !== undefined && (!isFiniteNumber(trashedAt) || trashedAt < 0)) ||
    (savedAt !== null && !isFiniteNumber(savedAt)) ||
    (storageClass === 'temporary' && savedAt !== null) ||
    (storageClass === 'library' && savedAt === null)
  ) {
    return null;
  }
  return { storageClass, updatedAt, savedAt, ...(trashedAt === undefined ? {} : { trashedAt }) };
}
