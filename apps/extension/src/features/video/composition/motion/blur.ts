import type { VideoProjectMotionRegion } from '../../project/types';
import { motionTransitionSettings, getMotionAnimationTime } from '../../project/motion/timing';
import { motionBlurPhaseSetting } from '../../project/motion/blur';

/** Camera exposure in seconds: 100% spans one 30 FPS frame, independent of playback refresh. */
export function motionBlurSamples(time: number, strength: number, start: number, end: number) {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  if (amount === 0 || end <= start) return [{ time, alpha: 1 }];
  const exposure = amount / 30;
  const weights = [1, 2, 3, 2, 1];
  return weights.map((weight, index) => ({
    time: Math.max(start, Math.min(end, time + (index / 4 - 0.5) * exposure)),
    alpha: weight / 9,
  }));
}

/** Phase clocks follow the retained animation, including source-bound trims and speed changes. */
export function motionRegionBlurPhase(
  region: VideoProjectMotionRegion,
  time: number,
  edges: { connectedIn: boolean; connectedOut: boolean }
): 'enter' | 'exit' | 'hold' {
  const local = getMotionAnimationTime(region, time - region.startTime);
  const duration = region.animation?.duration ?? region.duration;
  const enter = Math.min(motionTransitionSettings(region, 'enter').duration, duration);
  if (!edges.connectedIn && enter > 0 && local < enter) return 'enter';
  const out = motionTransitionSettings(region, 'exit').duration;
  const exit = Math.max(0, duration - out);
  if (!edges.connectedOut && out > 0 && local >= exit) return 'exit';
  return 'hold';
}

/** Legacy projects keep their scalar until explicit phase authoring. */
export function regionMotionBlurAmount(
  region: VideoProjectMotionRegion,
  time: number,
  edges: { connectedIn: boolean; connectedOut: boolean }
) {
  if (region.motionBlur === undefined) return region.motionBlurAmount ?? 0;
  const phase = motionRegionBlurPhase(region, time, edges);
  if (phase === 'hold' || motionTransitionSettings(region, phase).instant) return 0;
  const setting = motionBlurPhaseSetting(region.motionBlur, phase);
  return setting.enabled ? setting.strength : 0;
}
