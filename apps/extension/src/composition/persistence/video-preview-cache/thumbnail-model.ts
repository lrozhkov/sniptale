/** Advisory source rasters, independently disposable from projects and rendered video previews. */
export const TIMELINE_THUMBNAIL_MAX_BYTES = 32 * 1024 * 1024;
export const TIMELINE_THUMBNAIL_MAX_FRAMES = 2048;
export const TIMELINE_THUMBNAIL_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const TIMELINE_THUMBNAIL_MAX_FRAME_BYTES = 256 * 1024;

export interface TimelineThumbnail {
  projectId: string;
  sourceKey: string;
  sourceTime: number;
  blob: Blob;
  createdAt: number;
}

export function timelineThumbnailKey(
  frame: Pick<TimelineThumbnail, 'projectId' | 'sourceKey' | 'sourceTime'>
): string {
  return JSON.stringify([frame.projectId, frame.sourceKey, frame.sourceTime]);
}

export function parseTimelineThumbnail(value: unknown): TimelineThumbnail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = Object.fromEntries(Object.entries(value));
  const { projectId, sourceKey, sourceTime, blob, createdAt } = record;
  if (
    typeof projectId !== 'string' ||
    !projectId.length ||
    projectId.length > 512 ||
    typeof sourceKey !== 'string' ||
    !sourceKey.length ||
    sourceKey.length > 2048 ||
    typeof sourceTime !== 'number' ||
    !Number.isFinite(sourceTime) ||
    sourceTime < 0 ||
    typeof createdAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !(blob instanceof Blob) ||
    blob.type !== 'image/webp' ||
    blob.size <= 0 ||
    blob.size > TIMELINE_THUMBNAIL_MAX_FRAME_BYTES
  )
    return null;
  return { projectId, sourceKey, sourceTime, blob, createdAt };
}
