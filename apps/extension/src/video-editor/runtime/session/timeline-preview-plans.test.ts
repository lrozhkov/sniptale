import { expect, it } from 'vitest';
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
  viewport: { startTime: number; endTime: number } | null = null
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

it('projects the buffered viewport through playback rate before selecting source frames', () => {
  expect(samplesFor(2, 200, { startTime: 50, endTime: 51 })).toEqual([42, 48, 60, 72, 84, 96]);
});

it('clips samples to the available asset and does not sample its terminal boundary', () => {
  expect(samplesFor(299.5, 2)).toEqual([299.5]);
  expect(samplesFor(300, 2)).toEqual([]);
});
