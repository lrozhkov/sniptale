import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import type { VideoPreviewCacheDatabasePort, VideoPreviewCacheTransaction } from './database';
import {
  beginVideoPreviewCacheJob,
  hasCurrentVideoPreviewCacheInstance,
  isVideoPreviewCacheJobToken,
  type VideoPreviewCacheJobToken,
} from './jobs';
import {
  parseTimelineThumbnail,
  timelineThumbnailKey,
  TIMELINE_THUMBNAIL_MAX_AGE_MS,
  TIMELINE_THUMBNAIL_MAX_BYTES,
  TIMELINE_THUMBNAIL_MAX_FRAMES,
  type TimelineThumbnail,
} from './thumbnail-model';

export interface TimelineThumbnailStore {
  begin(): Promise<VideoPreviewCacheJobToken>;
  load(
    projectId: string,
    sourceKey: string,
    times: readonly number[]
  ): Promise<TimelineThumbnail[]>;
  commit(token: VideoPreviewCacheJobToken, frames: readonly TimelineThumbnail[]): Promise<void>;
}

/** Cache writes are batched and immutable on hits; reads never touch timestamps or rewrite pixels. */
export function createTimelineThumbnailStore(deps: {
  database: VideoPreviewCacheDatabasePort;
  now(): number;
  randomUUID(): string;
}): TimelineThumbnailStore {
  return {
    begin: () => beginVideoPreviewCacheJob(deps),
    async load(projectId, sourceKey, times) {
      return (
        (await deps.database.readExisting(async (transaction) => {
          const values = await Promise.all(
            times.map((sourceTime) =>
              transaction.getThumbnail(timelineThumbnailKey({ projectId, sourceKey, sourceTime }))
            )
          );
          return values.flatMap((value, index) => {
            const frame = parseTimelineThumbnail(value);
            return frame &&
              frame.projectId === projectId &&
              frame.sourceKey === sourceKey &&
              frame.sourceTime === times[index] &&
              deps.now() - frame.createdAt < TIMELINE_THUMBNAIL_MAX_AGE_MS
              ? [frame]
              : [];
          });
        })) ?? []
      );
    },
    async commit(token, frames) {
      if (!isVideoPreviewCacheJobToken(token)) return;
      await runWithPersistenceMutationPermit(() =>
        deps.database.mutateExisting(async (transaction) => {
          if (!(await hasCurrentVideoPreviewCacheInstance(transaction, token))) return;
          const now = deps.now();
          for (const value of frames) {
            const frame = parseTimelineThumbnail({ ...value, createdAt: now });
            if (!frame) continue;
            const key = timelineThumbnailKey(frame);
            const existing = parseTimelineThumbnail(await transaction.getThumbnail(key));
            if (existing && now - existing.createdAt < TIMELINE_THUMBNAIL_MAX_AGE_MS) continue;
            await transaction.putThumbnail(key, frame);
          }
          await pruneTimelineThumbnails(transaction, now);
        })
      );
    },
  };
}

export async function pruneTimelineThumbnails(
  transaction: VideoPreviewCacheTransaction,
  now: number
): Promise<void> {
  const entries = await transaction.listThumbnailEntries();
  const valid = [];
  for (const entry of entries) {
    const frame = parseTimelineThumbnail(entry.value);
    if (
      !frame ||
      timelineThumbnailKey(frame) !== entry.key ||
      now - frame.createdAt >= TIMELINE_THUMBNAIL_MAX_AGE_MS
    ) {
      await transaction.deleteThumbnail(entry.key);
    } else valid.push({ key: entry.key, frame });
  }
  valid.sort((a, b) => b.frame.createdAt - a.frame.createdAt || a.key.localeCompare(b.key));
  let bytes = 0;
  for (const [index, { key, frame }] of valid.entries()) {
    bytes += frame.blob.size;
    if (index >= TIMELINE_THUMBNAIL_MAX_FRAMES || bytes > TIMELINE_THUMBNAIL_MAX_BYTES)
      await transaction.deleteThumbnail(key);
  }
}

export async function deleteProjectThumbnails(
  transaction: VideoPreviewCacheTransaction,
  projectId: string
): Promise<number> {
  const entries = await transaction.listThumbnailEntries();
  let removed = 0;
  for (const entry of entries) {
    const frame = parseTimelineThumbnail(entry.value);
    if (!frame || frame.projectId === projectId) {
      await transaction.deleteThumbnail(entry.key);
      removed++;
    }
  }
  return removed;
}
