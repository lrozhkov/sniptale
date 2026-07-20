import { isSha256Digest } from '@sniptale/platform/security/digest';

import type { VideoPreviewCacheRecordEntry } from './database';
import {
  parseVideoPreviewCacheRecord,
  type VideoPreviewCacheRecord,
  type VideoPreviewCacheSegment,
} from './model';

export function validateVideoPreviewStorageKey(storageKey: string): void {
  if (!isSha256Digest(storageKey)) throw new Error('Video preview cache storage key is invalid');
}

export function parseVideoPreviewCacheEntry(
  entry: VideoPreviewCacheRecordEntry
): VideoPreviewCacheRecord | null {
  const record = parseVideoPreviewCacheRecord(entry.value);
  return record?.storageKey === entry.key ? record : null;
}

function sameRecordIdentity(
  left: VideoPreviewCacheRecord,
  right: VideoPreviewCacheRecord
): boolean {
  return (
    left.contentRevision === right.contentRevision &&
    left.codec === right.codec &&
    left.projectId === right.projectId &&
    left.fps === right.fps &&
    left.width === right.width &&
    left.height === right.height &&
    left.range.startFrame === right.range.startFrame &&
    left.range.endFrame === right.range.endFrame
  );
}

function mergeSegments(
  current: VideoPreviewCacheRecord | null,
  incoming: VideoPreviewCacheRecord
): VideoPreviewCacheSegment[] {
  if (!current || !sameRecordIdentity(current, incoming)) return incoming.segments;
  const segments = new Map(current.segments.map((segment) => [segment.index, segment]));
  for (const segment of incoming.segments) segments.set(segment.index, segment);
  return [...segments.values()].sort((left, right) => left.index - right.index);
}

export function createCommittedVideoPreviewRecord(
  current: VideoPreviewCacheRecord | null,
  incoming: VideoPreviewCacheRecord,
  now: number
): VideoPreviewCacheRecord {
  const candidate = {
    ...incoming,
    createdAt:
      current && sameRecordIdentity(current, incoming)
        ? Math.min(current.createdAt, incoming.createdAt)
        : incoming.createdAt,
    lastAccessedAt: now,
    segments: mergeSegments(current, incoming),
  };
  const parsed = parseVideoPreviewCacheRecord(candidate);
  if (!parsed) throw new Error('Invalid video preview cache record');
  return parsed;
}

export async function deleteVideoPreviewRecordKeys(
  entries: readonly VideoPreviewCacheRecordEntry[],
  keys: ReadonlySet<string>,
  remove: (key: string) => Promise<void>
): Promise<number> {
  let removedCount = 0;
  for (const { key } of entries) {
    if (!keys.has(key)) continue;
    await remove(key);
    removedCount += 1;
  }
  return removedCount;
}
