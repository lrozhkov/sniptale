import { fitQuickEditZoomTransitions } from './zoom';
import { motionBlurSamples } from '../../composition/motion/blur';
import { quickEditFocusType } from './focus-layout';
import { evaluateQuickEditCameraAtTime, sampleQuickEditFocusAtTime } from './scene';
import type { QuickEditCameraTransform, QuickEditZoomRegion } from './types';

/** One source raster, sampled camera exposure. Outgoing Zoom owns blur across its link. */
export function quickEditMotionBlurCameras(regions: readonly QuickEditZoomRegion[], time: number) {
  const camera = evaluateQuickEditCameraAtTime(regions, time);
  const single = [{ camera, alpha: 1 }];
  const phase = sampleQuickEditFocusAtTime(
    regions.filter((region) => quickEditFocusType(region) === 'zoom'),
    time,
    regions
  );
  if (!phase) return single;
  const owner = phase.from ?? phase.to;
  const setting = owner.motionBlur?.[phase.phase];
  if (!setting?.enabled || setting.strength <= 0) return single;
  const timed = fitQuickEditZoomTransitions(owner, owner.end - owner.start);
  const start = phase.from
    ? phase.from.end
    : phase.phase === 'exit'
      ? owner.end - timed.exit.duration
      : owner.start;
  const end = phase.from
    ? phase.to.start
    : phase.phase === 'exit'
      ? owner.end
      : owner.start + timed.enter.duration;
  if (time < start || time >= end) return single;
  // Stay on the represented side of a hard region boundary; never blur a jump into another focus.
  const samples = motionBlurSamples(time, setting.strength, start, Math.max(start, end - 1e-9));
  const frames = samples.map((sample) => ({
    camera: evaluateQuickEditCameraAtTime(regions, sample.time),
    alpha: sample.alpha,
  }));
  return frames.some((frame) => !sameQuickEditCamera(frame.camera, camera)) ? frames : single;
}

/** Suppresses the exposure during explicit target/gesture overrides as well as static holds. */
export function sameQuickEditCamera(a: QuickEditCameraTransform, b: QuickEditCameraTransform) {
  return (
    JSON.stringify(a.spatial) === JSON.stringify(b.spatial) &&
    Math.abs(a.scale - b.scale) < 1e-7 &&
    Math.abs(a.centerX - b.centerX) < 1e-7 &&
    Math.abs(a.centerY - b.centerY) < 1e-7
  );
}

/** Fast admission for the optional raster path; disabled workspaces retain native rendering. */
export function hasQuickEditMotionBlur(regions: readonly QuickEditZoomRegion[]) {
  return regions.some(
    (region) =>
      !region.dormant &&
      quickEditFocusType(region) === 'zoom' &&
      Object.values(region.motionBlur ?? {}).some(
        (setting) => setting.enabled && setting.strength > 0
      )
  );
}
