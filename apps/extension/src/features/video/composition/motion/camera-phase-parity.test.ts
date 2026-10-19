import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { evaluateQuickEditCameraAtTime } from '../../review/advanced/scene';
import type { QuickEditZoomRegion, QuickEditZoomTransition } from '../../review/advanced/types';
import { resolveVideoCompositionCamera } from './index';

function fixture(
  enter: QuickEditZoomTransition['type'],
  exit: QuickEditZoomTransition['type'],
  duration = 2,
  inOut = 0.5
) {
  const gallery: QuickEditZoomRegion = {
    id: 'camera',
    start: 1,
    end: 1 + duration,
    transform: { scale: 3, centerX: 0.35, centerY: 0.65 },
    enter: { type: enter, duration: inOut },
    exit: { type: exit, duration: inOut },
  };
  const base = createEmptyVideoProject('Camera phases', 1280, 720);
  const region = {
    ...createVideoProjectMotionRegion(base, 1, { enter, exit }),
    id: 'camera',
    duration,
    scale: 3,
    focusMode: 'MANUAL' as const,
    focusPoint: { x: 448, y: 468 },
    zoomInDuration: inOut,
    zoomOutDuration: inOut,
  };
  const project = applyVideoProjectMutationPatch(base, { duration: 8, motionRegions: [region] });
  return {
    project,
    gallery: (time: number) => evaluateQuickEditCameraAtTime([gallery], time),
    montage: (time: number) =>
      resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      }),
  };
}

it.each([
  ['linear', 'linear'],
  ['ease-in-out', 'linear'],
  ['linear', 'ease-in-out'],
  ['none', 'none'],
] as const)('matches Gallery %s entrance and %s exit', (enter, exit) => {
  const f = fixture(enter, exit);
  for (const time of [1, 1.125, 1.25, 1.499, 2, 2.501, 2.75, 2.875, 2.999]) {
    const actual = f.montage(time);
    const expected = f.gallery(time);
    expect(actual.scale, `at ${time}`).toBeCloseTo(expected.scale, 9);
    const offset = (center: number) =>
      Math.max(0, Math.min(expected.scale - 1, center * expected.scale - 0.5));
    expect((actual.viewportX * actual.scale) / f.project.width).toBeCloseTo(
      offset(expected.centerX),
      9
    );
    expect((actual.viewportY * actual.scale) / f.project.height).toBeCloseTo(
      offset(expected.centerY),
      9
    );
  }
});

it('fits the active pair against the retained animation duration', () => {
  const f = fixture('linear', 'linear', 4, 3);
  for (const time of [1, 2, 3, 3.5, 4, 4.75])
    expect(f.montage(time).scale).toBeCloseTo(f.gallery(time).scale, 9);
});

it('keeps legacy curves when independent phase settings are absent', () => {
  const project = createEmptyVideoProject('Legacy camera', 1280, 720);
  project.duration = 6;
  const region = {
    ...createVideoProjectMotionRegion(project, 1),
    duration: 2,
    scale: 3,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
  };
  project.motionRegions = [region];
  const sample = (time: number) =>
    resolveVideoCompositionCamera({ project, currentTime: time, actions: [], cursorSample: null });
  expect(sample(1.125).scale).toBe(1.125);
  region.easing = 'INSTANT';
  expect(sample(1).scale).toBe(1);
  expect(sample(2.5).scale).toBe(3);
  expect(sample(2.501).scale).toBe(1);
});
