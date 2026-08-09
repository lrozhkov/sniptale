import type { LibraryLifecycle, LibraryStorageClass } from './contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

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
  if (
    (storageClass !== 'temporary' && storageClass !== 'library') ||
    !isFiniteNumber(updatedAt) ||
    (savedAt !== null && !isFiniteNumber(savedAt)) ||
    (storageClass === 'temporary' && savedAt !== null) ||
    (storageClass === 'library' && savedAt === null)
  ) {
    return null;
  }
  return { storageClass, updatedAt, savedAt };
}
