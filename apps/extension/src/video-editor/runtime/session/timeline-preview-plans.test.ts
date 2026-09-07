import {
  createTimelinePreviewMap,
  pruneUnusedTimelineFrames,
  type TimelinePreviewFrame,
  type TimelinePreviewPlan,
} from './timeline-preview-cache';
import { expect, it, vi } from 'vitest';
import {
  VideoProjectAssetType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import {
  buildTimelinePreviewPlans,
  getNextTimelinePreviewFrameBatch,
} from './timeline-preview-plans';
import { createProjectWithVisualClip } from './timeline-previews.test-support';

function samplesFor(
  sourceStart: number,
  sourceDuration: number,
  viewport: { startTime: number; endTime: number; pixelsPerSecond: number } | null = null
) {
  const base = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 300 });
  const clip = base.clips[0] as VideoProjectVideoClip;
  const project = {
    ...base,
    clips: [
      {
        ...clip,
        sourceStart,
        sourceDuration,
        duration: sourceDuration / 2,
        playbackRate: 2,
        startTime: 10,
      },
    ],
  };
  const plans = buildTimelinePreviewPlans(project, { 'asset-video': 'blob:video' }, viewport);
  return (
    getNextTimelinePreviewFrameBatch(plans, new Map())?.samples.map(
      (sample) => sample.sourceTime
    ) ?? []
  );
}

it('starts at In and excludes Out while retaining reusable interior asset slots', () => {
  expect(samplesFor(2, 22)).toEqual([2, 12]);
  expect(samplesFor(12, 12)).toEqual([12]);
});

it('preserves fractional In without rounding a sample outside a short source range', () => {
  expect(samplesFor(2.004, 0.001)).toEqual([2.004]);
  expect(samplesFor(2.006, 0.001)).toEqual([2.006]);
});

it('loads visible source frames before buffered frames at the current playback rate', () => {
  expect(samplesFor(2, 200, { startTime: 50, endTime: 51, pixelsPerSecond: 64 })).toEqual([
    82, 81, 84,
  ]);
});

it('clips samples to the available asset and does not sample its terminal boundary', () => {
  expect(samplesFor(299.5, 2)).toEqual([299.5]);
  expect(samplesFor(300, 2)).toEqual([]);
});

it('samples a short visible clip at timeline density instead of one twelve-second frame', () => {
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO);
  const plans = buildTimelinePreviewPlans(
    project,
    { 'asset-video': 'blob:video' },
    {
      startTime: 0,
      endTime: 4,
      pixelsPerSecond: 64,
    }
  );
  expect(
    getNextTimelinePreviewFrameBatch(plans, new Map())?.samples.map((sample) => sample.sourceTime)
  ).toEqual([2, 3, 4, 5]);
});

it('retains source intervals when only a later frame has finished loading', () => {
  const plan: TimelinePreviewPlan = {
    kind: 'video',
    assetId: 'asset',
    assetUrl: 'blob:video',
    clipId: 'clip',
    slots: [
      { cacheKey: 'first', sourceStart: 20, sourceEnd: 21 },
      { cacheKey: 'second', sourceStart: 21, sourceEnd: 22 },
    ],
  };
  const cache = new Map([
    ['second', { assetId: 'asset', assetUrl: 'blob:video', sourceTime: 21, url: 'blob:second' }],
  ]);
  expect(createTimelinePreviewMap([plan], cache)).toEqual({
    clip: { kind: 'video', frames: [{ sourceStart: 21, sourceEnd: 22, url: 'blob:second' }] },
  });
});

it('bounds unused decoded frames while retaining every active viewport sample', () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  try {
    const cache = new Map<string, TimelinePreviewFrame>();
    for (let index = 0; index < 200; index++)
      cache.set(String(index), {
        assetId: 'asset',
        assetUrl: 'blob:video',
        sourceTime: index,
        url: `blob:${index}`,
      });
    const plan: TimelinePreviewPlan = {
      kind: 'video',
      assetId: 'asset',
      assetUrl: 'blob:video',
      clipId: 'clip',
      slots: Array.from({ length: 50 }, (_, index) => ({
        cacheKey: String(index),
        sourceStart: index,
        sourceEnd: index + 1,
      })),
    };
    pruneUnusedTimelineFrames(cache, [plan]);
    expect(cache.size).toBe(170);
    expect(plan.slots.every((slot) => cache.has(slot.cacheKey))).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(30);
    expect(revoke).toHaveBeenCalledWith('blob:50');
    expect(revoke).not.toHaveBeenCalledWith('blob:0');
  } finally {
    revoke.mockRestore();
  }
});

it('uses overview pixel density for sparse source samples', () => {
  expect(samplesFor(2, 200, { startTime: 0, endTime: 1000, pixelsPerSecond: 0.01 })).toEqual([2]);
});

it('samples distinct source positions within a high-fps detail viewport', () => {
  const samples = samplesFor(0, 100, {
    startTime: 20,
    endTime: 20 + 4 / 240,
    pixelsPerSecond: 23040,
  });
  const visible = samples.filter((time) => time >= 20 && time < 20 + 8 / 240).sort((a, b) => a - b);
  expect(visible.length).toBeGreaterThanOrEqual(4);
  expect(visible[1]! - visible[0]!).toBeLessThanOrEqual(2 / 240);
});
