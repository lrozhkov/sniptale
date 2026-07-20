import {
  getFrameDrivenKeyframeInterval,
  getRenderLoopCurrentTime,
  getRenderLoopDuration,
  getRenderLoopFps,
  getRenderLoopFrameDurationUs,
  getRenderLoopTotalFrames,
} from '../shared/timing';

export function getFrameDrivenRenderTiming(duration: number, fps: number) {
  const normalizedDuration = getRenderLoopDuration(duration);
  const normalizedFps = getRenderLoopFps(fps);

  return {
    duration: normalizedDuration,
    fps: normalizedFps,
    frameDurationUs: getRenderLoopFrameDurationUs(normalizedFps),
    keyframeInterval: getFrameDrivenKeyframeInterval(normalizedFps),
    totalFrames: getRenderLoopTotalFrames(normalizedDuration, normalizedFps),
  };
}

export function getFrameDrivenRenderCurrentTime(
  frameIndex: number,
  fps: number,
  duration: number
): number {
  return getRenderLoopCurrentTime(frameIndex, fps, duration);
}
