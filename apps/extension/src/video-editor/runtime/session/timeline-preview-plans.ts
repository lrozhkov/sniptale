import { normalizeClipPlaybackRate } from '../../../features/video/project/timeline/basics';
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
    (plan) =>
      plan.kind === 'video' && plan.slots.some((slot) => !generatedUrlCache.has(slot.cacheKey))
  );
  if (!firstMissingPlan) {
    return null;
  }

  const samples = firstMissingPlan.slots
    .filter((slot) => !generatedUrlCache.has(slot.cacheKey))
    .slice(0, TIMELINE_PREVIEW_BATCH_SIZE)
    .map((slot) => ({
      cacheKey: slot.cacheKey,
      sourceTime: slot.sourceStart,
    }));

  return { assetUrl: firstMissingPlan.assetUrl, samples };
}

export function getTimelinePreviewPlanKey(plans: readonly TimelinePreviewPlan[]): string {
  return plans
    .map((plan) =>
      [
        plan.clipId,
        plan.kind,
        plan.assetId,
        plan.assetUrl,
        ...plan.slots.flatMap((slot) => [slot.cacheKey, slot.sourceEnd]),
      ].join(',')
    )
    .join('|');
}

export function resolveTimelinePreviewFrameOwner(
  plans: readonly TimelinePreviewPlan[],
  cacheKey: string
): { assetId: string; assetUrl: string } | null {
  const plan = plans.find(
    (item) => item.kind === 'video' && item.slots.some((slot) => slot.cacheKey === cacheKey)
  );
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
    slots: [],
  };
}

function createVideoPreviewPlan(
  clip: VideoProjectVideoClip,
  assetUrl: string,
  viewport: TimelinePreviewViewport | null,
  assetDuration: number | null
): TimelinePreviewPlan {
  const sourceSlots = buildVideoPreviewSourceSlots(clip, viewport, assetDuration);
  const visibleStart = viewport
    ? getMediaClipSourceTime(clip, viewport.startTime)
    : clip.sourceStart;
  const visibleEnd = viewport
    ? getMediaClipSourceTime(clip, viewport.endTime)
    : clip.sourceStart + clip.sourceDuration;
  const isVisible = (slot: (typeof sourceSlots)[number]) =>
    slot.sourceEnd > visibleStart && slot.sourceStart < visibleEnd;
  const prioritizedSlots = [...sourceSlots].sort(
    (left, right) => Number(isVisible(right)) - Number(isVisible(left))
  );

  return {
    assetId: clip.assetId,
    assetUrl,
    clipId: clip.id,
    kind: 'video',
    slots: prioritizedSlots.map((slot) => ({
      ...slot,
      cacheKey: createTimelinePreviewFrameCacheKey(clip.assetId, assetUrl, slot.sourceStart),
    })),
  };
}

function buildVideoPreviewSourceSlots(
  clip: VideoProjectVideoClip,
  viewport: TimelinePreviewViewport | null,
  assetDuration: number | null
): readonly { sourceStart: number; sourceEnd: number }[] {
  const sourceRange = resolvePreviewSourceRange(clip, viewport);
  if (!sourceRange) {
    return [];
  }

  const start = Math.max(0, sourceRange.start);
  const end =
    assetDuration !== null && Number.isFinite(assetDuration)
      ? Math.min(sourceRange.end, assetDuration)
      : sourceRange.end;
  if (end <= start) {
    return [];
  }

  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const desiredStep = viewport
    ? Math.max(1 / 30, (64 / Math.max(1, viewport.pixelsPerSecond)) * rate)
    : STORYBOARD_SLOT_SECONDS;
  const step = viewport ? 2 ** Math.floor(Math.log2(desiredStep)) : desiredStep;
  const firstSlot = Math.floor(start / step);
  const lastSlot = Math.max(firstSlot, Math.ceil(end / step) - 1);
  const slots: number[] = [];
  const totalSlots = Math.max(1, lastSlot - firstSlot + 1);
  const stride = Math.max(1, Math.ceil(totalSlots / MAX_ASSET_STORYBOARD_FRAMES));

  for (
    let slot = firstSlot;
    slot <= lastSlot && slots.length < MAX_ASSET_STORYBOARD_FRAMES;
    slot += stride
  ) {
    slots.push(Math.max(start, slot * step));
  }

  slots.sort((left, right) => left - right);
  return slots.map((sourceStart, index) => ({ sourceStart, sourceEnd: slots[index + 1] ?? end }));
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

  const buffer = Math.min(
    TIMELINE_PREVIEW_VIEWPORT_BUFFER_SECONDS,
    (viewport.endTime - viewport.startTime) / 2
  );
  const projectStart = Math.max(clip.startTime, viewport.startTime - buffer);
  const projectEnd = Math.min(clip.startTime + clip.duration, viewport.endTime + buffer);
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

function normalizeSourceTimeKey(sourceTime: number): string {
  return String(sourceTime);
}
