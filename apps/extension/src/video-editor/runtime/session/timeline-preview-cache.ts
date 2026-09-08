import type { TimelineClipPreviewMap } from '../../contracts/timeline-preview';

export interface TimelinePreviewPlan {
  assetId: string;
  assetUrl: string;
  clipId: string;
  kind: 'image' | 'video';
  slots: readonly { cacheKey: string; sourceStart: number; sourceEnd: number }[];
}

export function createTimelinePreviewMap(
  plans: readonly TimelinePreviewPlan[],
  generatedUrlCache: Map<string, TimelinePreviewFrame>
): TimelineClipPreviewMap {
  const previews: TimelineClipPreviewMap = {};

  for (const plan of plans) {
    if (plan.kind === 'image') {
      previews[plan.clipId] = { kind: 'image', url: plan.assetUrl };
      continue;
    }

    const frames = plan.slots.flatMap((slot) => {
      const frame = generatedUrlCache.get(slot.cacheKey);
      return frame
        ? [{ sourceStart: slot.sourceStart, sourceEnd: slot.sourceEnd, url: frame.url }]
        : [];
    });
    if (frames.length > 0) previews[plan.clipId] = { kind: 'video', frames };
  }

  return previews;
}

export interface TimelinePreviewFrame {
  assetId: string;
  assetUrl: string;
  sourceTime: number;
  url: string;
}

export function cleanupRemovedPreviewAssets(
  generatedUrlCache: Map<string, TimelinePreviewFrame>,
  assetUrls: Record<string, string>
): void {
  for (const [key, frame] of generatedUrlCache) {
    if (assetUrls[frame.assetId] !== frame.assetUrl) {
      URL.revokeObjectURL(frame.url);
      generatedUrlCache.delete(key);
    }
  }
}

export function revokeCachedPreviewUrls(
  generatedUrlCache: Map<string, TimelinePreviewFrame>
): void {
  for (const frame of generatedUrlCache.values()) {
    URL.revokeObjectURL(frame.url);
  }
  generatedUrlCache.clear();
}

export function revokePreviewUrls(urls: readonly string[]): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

/** Keep current viewport frames and a bounded reserve for nearby edits and zoom levels. */
export function pruneUnusedTimelineFrames(
  cache: Map<string, TimelinePreviewFrame>,
  plans: readonly TimelinePreviewPlan[]
): void {
  const active = new Set(plans.flatMap((plan) => plan.slots.map((slot) => slot.cacheKey)));
  const unused = [...cache.keys()].filter((key) => !active.has(key));
  for (const key of unused.slice(0, Math.max(0, unused.length - 120))) {
    const frame = cache.get(key);
    if (frame) URL.revokeObjectURL(frame.url);
    cache.delete(key);
  }
}
