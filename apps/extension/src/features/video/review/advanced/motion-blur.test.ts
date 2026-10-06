import { expect, it } from 'vitest';
import { quickEditMotionBlurCameras } from './motion-blur';
import { evaluateQuickEditCameraAtTime } from './scene';
import type { QuickEditZoomRegion } from './types';

const first: QuickEditZoomRegion = {
  id: 'a',
  start: 1,
  end: 5,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 1 },
  exit: { type: 'ease-in-out', duration: 1 },
};
const second: QuickEditZoomRegion = {
  ...first,
  id: 'b',
  start: 8,
  end: 12,
  transform: { scale: 1.15, centerX: 0.5, centerY: 0.5 },
};
const enabled = { enabled: true, strength: 0.5 };

it('keeps entrance, exit and outgoing link blur independent with sharp defaults and holds', () => {
  const enter = { ...first, motionBlur: { enter: enabled } };
  expect(quickEditMotionBlurCameras([first], 1.5)).toHaveLength(1);
  expect(quickEditMotionBlurCameras([enter], 1.5)).toHaveLength(5);
  expect(quickEditMotionBlurCameras([enter], 4.5)).toHaveLength(1);
  const exit = { ...first, motionBlur: { exit: enabled } };
  expect(quickEditMotionBlurCameras([exit], 1.5)).toHaveLength(1);
  expect(quickEditMotionBlurCameras([exit], 4.5)).toHaveLength(5);
  const linked = { ...enter, linkTo: 'b' };
  expect(quickEditMotionBlurCameras([linked, second], 6.5)).toHaveLength(1);
  const linkOnly = { ...first, linkTo: 'b', motionBlur: { link: enabled } };
  expect(quickEditMotionBlurCameras([linkOnly, second], 6.5)).toHaveLength(5);
  expect(quickEditMotionBlurCameras([linkOnly, second], 1.5)).toHaveLength(1);
  expect(quickEditMotionBlurCameras([linkOnly, second], 3)).toHaveLength(1);
});

it('does not smear hard jumps, dormant regions, static camera holds or another focus type', () => {
  const all = { enter: enabled, exit: enabled, link: enabled };
  const immediate = {
    ...first,
    motionBlur: all,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  for (const time of [0.999, 1, 1.001, 3, 4.999, 5, 5.001])
    expect(quickEditMotionBlurCameras([immediate], time)).toEqual([
      { camera: evaluateQuickEditCameraAtTime([immediate], time), alpha: 1 },
    ]);
  expect(
    quickEditMotionBlurCameras([{ ...first, dormant: true, motionBlur: all }], 1.5)
  ).toHaveLength(1);
});

it('samples centered zoom-out links monotonically at 30 FPS with exact center and bounded endpoints', () => {
  const regions = [{ ...first, linkTo: 'b', motionBlur: { link: enabled } }, second];
  let previous = 1.5;
  for (let n = 0; n < 90; n++) {
    const time = 5 + n / 30;
    const camera = evaluateQuickEditCameraAtTime(regions, time);
    expect(camera.scale).toBeLessThanOrEqual(previous);
    expect(camera.centerX).toBeCloseTo(0.5, 12);
    expect(camera.centerY).toBeCloseTo(0.5, 12);
    const passes = quickEditMotionBlurCameras(regions, time);
    expect(passes.reduce((sum, pass) => sum + pass.alpha, 0)).toBeCloseTo(1);
    for (const pass of passes) {
      expect(pass.camera.scale).toBeGreaterThanOrEqual(1.15);
      expect(pass.camera.scale).toBeLessThanOrEqual(1.5);
    }
    previous = camera.scale;
  }
});
