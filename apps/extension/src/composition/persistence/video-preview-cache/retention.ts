import type { VideoPreviewCacheRecord } from './model';
import {
  VIDEO_PREVIEW_CACHE_MAX_AGE_MS,
  VIDEO_PREVIEW_CACHE_MAX_BYTES,
  VIDEO_PREVIEW_CACHE_MAX_RECORDS,
} from './constants';

export function selectVideoPreviewCacheEvictions(
  records: readonly VideoPreviewCacheRecord[],
  now: number,
  protectedStorageKey?: string
): string[] {
  const retained = [...records];
  const evictions = new Set(
    retained
      .filter(
        (record) =>
          record.lastAccessedAt > now ||
          now - record.lastAccessedAt >= VIDEO_PREVIEW_CACHE_MAX_AGE_MS
      )
      .map((record) => record.storageKey)
  );
  const protectedRecord = retained.find((record) => record.storageKey === protectedStorageKey);
  if (protectedRecord && protectedRecord.byteLength > VIDEO_PREVIEW_CACHE_MAX_BYTES) {
    throw new Error('Video preview cache record exceeds the retained byte limit');
  }

  const active = retained
    .filter((record) => !evictions.has(record.storageKey))
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  let byteLength = active.reduce((sum, record) => sum + record.byteLength, 0);
  let recordCount = active.length;
  for (const record of active) {
    if (
      recordCount <= VIDEO_PREVIEW_CACHE_MAX_RECORDS &&
      byteLength <= VIDEO_PREVIEW_CACHE_MAX_BYTES
    ) {
      break;
    }
    if (record.storageKey === protectedStorageKey) continue;
    evictions.add(record.storageKey);
    byteLength -= record.byteLength;
    recordCount -= 1;
  }

  if (recordCount > VIDEO_PREVIEW_CACHE_MAX_RECORDS || byteLength > VIDEO_PREVIEW_CACHE_MAX_BYTES) {
    throw new Error('Video preview cache record exceeds the retained byte limit');
  }
  return [...evictions];
}
