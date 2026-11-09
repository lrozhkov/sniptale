import type { PreviewScenePresentation } from '../../contracts/preview-runtime';
export const VIDEO_PREVIEW_EXACT_FRAME_CACHE_MAX_BYTES = 320 * 1024 * 1024;
const VIDEO_PREVIEW_EXACT_FRAME_CACHE_KEY_VERSION = 1;

interface ExactFrameEntry {
  bitmap: ImageBitmap;
  presentation: PreviewScenePresentation | undefined;
  byteLength: number;
  readers: number;
  retired: boolean;
}

/** A reader pins one cached bitmap and its matching geometry until completion. */
interface VideoPreviewExactFrameLease {
  readonly bitmap: ImageBitmap;
  readonly presentation: PreviewScenePresentation | undefined;
  release(): void;
}

export interface VideoPreviewExactFrameCache {
  /** Release the acquired reader after all asynchronous pixel use completes. */
  acquire(key: string): VideoPreviewExactFrameLease | null;
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

  function closeEntry(entry: ExactFrameEntry): void {
    retainedBytes -= entry.byteLength;
    entry.bitmap.close();
  }

  function touchEntry(key: string): ExactFrameEntry | undefined {
    const entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
    }
    return entry;
  }

  function deleteEntry(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entry.retired = true;
    if (entry.readers === 0) closeEntry(entry);
  }

  return {
    acquire(key) {
      const entry = touchEntry(key);
      if (!entry) return null;
      entry.readers += 1;
      let released = false;
      return {
        bitmap: entry.bitmap,
        presentation: entry.presentation,
        release() {
          if (released) return;
          released = true;
          entry.readers -= 1;
          if (entry.retired && entry.readers === 0) closeEntry(entry);
        },
      };
    },
    get byteLength() {
      return retainedBytes;
    },
    clear() {
      for (const key of entries.keys()) deleteEntry(key);
    },
    get(key) {
      return touchEntry(key)?.bitmap ?? null;
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
        if (oldestKey === undefined) break;
        deleteEntry(oldestKey);
      }
      if (retainedBytes + byteLength > maxBytes) {
        bitmap.close();
        return 'capacity-limited';
      }
      let metadata = presentation;
      if (presentation && 'output' in presentation) {
        metadata = { ...presentation };
        delete metadata.output;
      }
      entries.set(key, { bitmap, byteLength, presentation: metadata, readers: 0, retired: false });
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
