import type { PreviewScenePresentation } from '../stage/scene/types';
export const VIDEO_PREVIEW_EXACT_FRAME_CACHE_MAX_BYTES = 320 * 1024 * 1024;
const VIDEO_PREVIEW_EXACT_FRAME_CACHE_KEY_VERSION = 1;

interface ExactFrameEntry {
  bitmap: ImageBitmap;
  presentation: PreviewScenePresentation | undefined;
  byteLength: number;
}

export interface VideoPreviewExactFrameCache {
  clear(): void;
  get(key: string): ImageBitmap | null;
  getPresentation(key: string): PreviewScenePresentation | null;
  set(
    key: string,
    bitmap: ImageBitmap,
    presentation?: PreviewScenePresentation
  ): 'stored' | 'capacity-limited';
  readonly byteLength: number;
}

export function createVideoPreviewExactFrameCache(
  maxBytes = VIDEO_PREVIEW_EXACT_FRAME_CACHE_MAX_BYTES
): VideoPreviewExactFrameCache {
  const entries = new Map<string, ExactFrameEntry>();
  let retainedBytes = 0;

  function deleteEntry(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    retainedBytes -= entry.byteLength;
    entry.bitmap.close();
  }

  return {
    get byteLength() {
      return retainedBytes;
    },
    clear() {
      for (const key of entries.keys()) deleteEntry(key);
    },
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return entry.bitmap;
    },
    getPresentation(key) {
      return entries.get(key)?.presentation ?? null;
    },
    set(key, bitmap, presentation) {
      const byteLength = bitmap.width * bitmap.height * 4;
      if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > maxBytes) {
        bitmap.close();
        return 'capacity-limited';
      }
      deleteEntry(key);
      while (retainedBytes + byteLength > maxBytes) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (!oldestKey) break;
        deleteEntry(oldestKey);
      }
      entries.set(key, { bitmap, byteLength, presentation });
      retainedBytes += byteLength;
      return 'stored';
    },
  };
}

export function createVideoPreviewExactFrameKey(params: {
  fps: number;
  frameIndex: number;
  height: number;
  renderRevision: string;
  width: number;
}): string {
  return [
    `preview-frame-v${VIDEO_PREVIEW_EXACT_FRAME_CACHE_KEY_VERSION}`,
    params.renderRevision,
    params.fps,
    `${params.width}x${params.height}`,
    params.frameIndex,
  ].join(':');
}
