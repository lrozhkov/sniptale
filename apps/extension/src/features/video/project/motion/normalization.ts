import { VideoMotionFocusMode, type VideoProjectMotionRegion } from '../types/index';

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveMotionFocusMode(focusMode: VideoProjectMotionRegion['focusMode']) {
  return Object.values(VideoMotionFocusMode).includes(focusMode)
    ? focusMode
    : VideoMotionFocusMode.MANUAL;
}

export function resolveMotionScale(scale: number) {
  return clampNumber(Number.isFinite(scale) ? scale : 1, 0.1, 4);
}

export function resolveMotionBlurAmount(
  motionBlurAmount: VideoProjectMotionRegion['motionBlurAmount']
) {
  return clampNumber(
    typeof motionBlurAmount === 'number' && Number.isFinite(motionBlurAmount)
      ? motionBlurAmount
      : 0,
    0,
    1
  );
}

export function resolveMotionStartTime(
  projectDuration: number,
  startTime: number,
  duration: number
) {
  return clampNumber(
    Number.isFinite(startTime) ? startTime : 0,
    0,
    Math.max(0, projectDuration - duration)
  );
}
