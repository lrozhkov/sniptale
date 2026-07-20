import type { TimelineClipPreviewMap } from '../../contracts/timeline-preview';

export interface TimelinePreviewPlan {
  assetId: string;
  assetUrl: string;
  clipId: string;
  kind: 'image' | 'video';
  slotKeys: readonly string[];
}

export function createTimelinePreviewMap(
  plans: readonly TimelinePreviewPlan[],
  generatedUrlCache: Map<string, TimelinePreviewFrame>
): TimelineClipPreviewMap {
  const previews: TimelineClipPreviewMap = {};

  for (const plan of plans) {
    if (plan.kind === 'image') {
      previews[plan.clipId] = { kind: 'image', urls: [plan.assetUrl] };
      continue;
    }

    const urls = plan.slotKeys.flatMap((key) => generatedUrlCache.get(key)?.url ?? []);
    if (urls.length > 0) {
      previews[plan.clipId] = { kind: 'video', urls };
    }
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
