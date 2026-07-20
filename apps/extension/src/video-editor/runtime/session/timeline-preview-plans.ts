import { getMediaClipSourceTime } from '../../../features/video/project/timeline';
import {
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types/index';
import type { TimelinePreviewViewport } from '../../contracts/timeline-preview';
import type { TimelineVideoFrameSample } from './timeline-frame-loader';
import type { TimelinePreviewFrame, TimelinePreviewPlan } from './timeline-preview-cache';

const STORYBOARD_SLOT_SECONDS = 12;
const MAX_ASSET_STORYBOARD_FRAMES = 60;
const TIMELINE_PREVIEW_BATCH_SIZE = 6;
const TIMELINE_PREVIEW_VIEWPORT_BUFFER_SECONDS = 20;

export function buildTimelinePreviewPlans(
  project: VideoProject | null,
  assetUrls: Record<string, string>,
  viewport: TimelinePreviewViewport | null
): TimelinePreviewPlan[] {
  if (!project) {
    return [];
  }

  return project.clips.flatMap((clip) => {
    if (clip.type !== VideoProjectClipType.IMAGE && clip.type !== VideoProjectClipType.VIDEO) {
      return [];
    }

    const assetUrl = assetUrls[clip.assetId];
    if (!assetUrl) {
      return [];
    }

    if (clip.type === VideoProjectClipType.IMAGE) {
      return [createImagePreviewPlan(clip.id, clip.assetId, assetUrl)];
    }

    const asset = project.assets.find((item) => item.id === clip.assetId);
    return [createVideoPreviewPlan(clip, assetUrl, viewport, asset?.metadata.duration ?? null)];
  });
}

export function getNextTimelinePreviewFrameBatch(
  plans: readonly TimelinePreviewPlan[],
  generatedUrlCache: Map<string, TimelinePreviewFrame>
): { assetUrl: string; samples: readonly TimelineVideoFrameSample[] } | null {
  const firstMissingPlan = plans.find(
    (plan) => plan.kind === 'video' && plan.slotKeys.some((key) => !generatedUrlCache.has(key))
  );
  if (!firstMissingPlan) {
    return null;
  }

  const samples = firstMissingPlan.slotKeys
    .filter((key) => !generatedUrlCache.has(key))
    .slice(0, TIMELINE_PREVIEW_BATCH_SIZE)
    .map((cacheKey) => ({
      cacheKey,
      sourceTime: parseTimelinePreviewFrameCacheKey(cacheKey).sourceTime,
    }));

  return { assetUrl: firstMissingPlan.assetUrl, samples };
}

export function getTimelinePreviewPlanKey(plans: readonly TimelinePreviewPlan[]): string {
  return plans
    .map((plan) =>
      [plan.clipId, plan.kind, plan.assetId, plan.assetUrl, ...plan.slotKeys].join(',')
    )
    .join('|');
}

export function resolveTimelinePreviewFrameOwner(
  plans: readonly TimelinePreviewPlan[],
  cacheKey: string
): { assetId: string; assetUrl: string } | null {
  const plan = plans.find((item) => item.kind === 'video' && item.slotKeys.includes(cacheKey));
  return plan ? { assetId: plan.assetId, assetUrl: plan.assetUrl } : null;
}

function createImagePreviewPlan(
  clipId: string,
  assetId: string,
  assetUrl: string
): TimelinePreviewPlan {
  return {
    assetId,
    assetUrl,
    clipId,
    kind: 'image',
    slotKeys: [],
  };
}

function createVideoPreviewPlan(
  clip: VideoProjectVideoClip,
  assetUrl: string,
  viewport: TimelinePreviewViewport | null,
  assetDuration: number | null
): TimelinePreviewPlan {
  const sourceSlots = buildVideoPreviewSourceSlots(clip, viewport, assetDuration);

  return {
    assetId: clip.assetId,
    assetUrl,
    clipId: clip.id,
    kind: 'video',
    slotKeys: sourceSlots.map((sourceTime) =>
      createTimelinePreviewFrameCacheKey(clip.assetId, assetUrl, sourceTime)
    ),
  };
}

function buildVideoPreviewSourceSlots(
  clip: VideoProjectVideoClip,
  viewport: TimelinePreviewViewport | null,
  assetDuration: number | null
): readonly number[] {
  const sourceRange = resolvePreviewSourceRange(clip, viewport);
  if (!sourceRange) {
    return [];
  }

  const firstSlot = Math.floor(sourceRange.start / STORYBOARD_SLOT_SECONDS);
  const lastSlot = Math.max(
    firstSlot,
    Math.ceil(Math.max(sourceRange.start, sourceRange.end) / STORYBOARD_SLOT_SECONDS) - 1
  );
  const slots: number[] = [];
  const totalSlots = Math.max(1, lastSlot - firstSlot + 1);
  const stride = Math.max(1, Math.ceil(totalSlots / MAX_ASSET_STORYBOARD_FRAMES));

  for (
    let slot = firstSlot;
    slot <= lastSlot && slots.length < MAX_ASSET_STORYBOARD_FRAMES;
    slot += stride
  ) {
    pushUniqueSourceTime(slots, clampSourceTime(slot * STORYBOARD_SLOT_SECONDS, assetDuration));
  }

  slots.sort((left, right) => left - right);
  return slots.slice(0, MAX_ASSET_STORYBOARD_FRAMES);
}

function resolvePreviewSourceRange(
  clip: VideoProjectVideoClip,
  viewport: TimelinePreviewViewport | null
): { end: number; start: number } | null {
  if (clip.duration <= 0 || clip.sourceDuration <= 0) {
    return null;
  }

  if (!viewport) {
    return { end: clip.sourceStart + clip.sourceDuration, start: clip.sourceStart };
  }

  const projectStart = Math.max(
    clip.startTime,
    viewport.startTime - TIMELINE_PREVIEW_VIEWPORT_BUFFER_SECONDS
  );
  const projectEnd = Math.min(
    clip.startTime + clip.duration,
    viewport.endTime + TIMELINE_PREVIEW_VIEWPORT_BUFFER_SECONDS
  );
  if (projectEnd <= projectStart) {
    return null;
  }

  return {
    start: getMediaClipSourceTime(clip, projectStart),
    end: getMediaClipSourceTime(clip, projectEnd),
  };
}

function createTimelinePreviewFrameCacheKey(
  assetId: string,
  assetUrl: string,
  sourceTime: number
): string {
  return ['video', assetId, assetUrl, normalizeSourceTimeKey(sourceTime)].join(':');
}

function parseTimelinePreviewFrameCacheKey(cacheKey: string): { sourceTime: number } {
  const sourceTime = Number(cacheKey.slice(cacheKey.lastIndexOf(':') + 1));
  return { sourceTime };
}

function normalizeSourceTimeKey(sourceTime: number): string {
  return sourceTime.toFixed(2);
}

function clampSourceTime(sourceTime: number, assetDuration: number | null): number {
  const upperBound =
    assetDuration !== null && Number.isFinite(assetDuration)
      ? Math.max(0, assetDuration)
      : sourceTime;
  return Math.min(upperBound, Math.max(0, sourceTime));
}

function pushUniqueSourceTime(sourceTimes: number[], sourceTime: number): void {
  const normalized = Number(normalizeSourceTimeKey(sourceTime));
  if (!sourceTimes.some((value) => Math.abs(value - normalized) <= 0.01)) {
    sourceTimes.push(normalized);
  }
}
