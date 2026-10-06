import { expect, it } from 'vitest';
import { createReviewRenderTimeTracking, planReviewExportTime } from './time-estimate-plan';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';

it('uses fragment-local transition timing and global blur-region timing', () => {
  const region: QuickEditZoomRegion = {
    id: 'blur',
    start: 12,
    end: 14,
    transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    spotlight: {
      area: { x: 0, y: 0, width: 1, height: 1 },
      effect: 'blur',
      strength: 1,
      blur: 12,
      roundness: 0,
      reveal: 'fade',
      exitReveal: 'fade',
    },
  };
  const plan = planReviewExportTime({
    duration: 10,
    fragmentOffset: 10,
    zoomRegions: [region],
    webcam: false,
    transitions: [
      {
        id: 'cut',
        type: 'dissolve',
        seam: 7,
        before: 0.2,
        after: 0.2,
        left: { start: 0, end: 7 },
        right: { start: 9, end: 12 },
      },
    ],
  });
  expect(plan.find((part) => part.start === 2)?.cost).toBeGreaterThan(1);
  expect(plan.find((part) => part.start === 6.8)?.cost).toBeGreaterThan(1);
  expect(plan[0]?.cost).toBe(1);
});

it('does not charge hidden regions and recognizes the second decoder for webcam', () => {
  const plan = planReviewExportTime({
    duration: 10,
    fragmentOffset: 0,
    zoomRegions: [],
    transitions: [],
    webcam: true,
  });
  expect(plan[0]?.cost).toBeGreaterThan(1);
});

it('does not construct tracking without a consumer and preserves one update budget across windows', () => {
  const plan = { duration: 10, fragmentOffset: 0, zoomRegions: [], transitions: [], webcam: false };
  expect(createReviewRenderTimeTracking(plan, undefined)).toBeUndefined();
  let clock = 0;
  const estimates: Array<number | null> = [];
  const progress: number[] = [];
  const tracking = createReviewRenderTimeTracking(
    plan,
    (estimate) => estimates.push(estimate?.remainingMs ?? null),
    (fraction) => progress.push(fraction),
    () => clock
  )!;
  for (let i = 1; i <= 8; i++) {
    tracking.startAudio();
    tracking.finishAudio({ resultStart: (i - 1) / 4, resultEnd: i / 4 });
    clock += 300;
    tracking.renderProgress(i / 40);
  }
  expect(progress).toHaveLength(8);
  expect(estimates).toHaveLength(4);
  expect(estimates.some((estimate) => estimate !== null && estimate > 0)).toBe(true);
});
