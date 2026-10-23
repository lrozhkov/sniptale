const MP4_KEYFRAME_INTERVAL_SECONDS = 2;

/** Preserves positive work intervals; empty intervals retain the existing minimum. */
export function getRenderLoopDuration(duration: number): number {
  return duration > 0 ? duration : Math.max(0.1, duration);
}

/** Normalizes render-loop fps to the minimum supported rate. */
export function getRenderLoopFps(fps: number): number {
  return Math.max(1, fps);
}

/** Calculates the total number of frames the render loop should emit. */
export function getRenderLoopTotalFrames(duration: number, fps: number): number {
  // Rounded encoder timestamps must remain strictly before the rounded interval end.
  const endUs = Math.round(duration * 1_000_000);
  return Math.max(1, Math.ceil(((endUs - 0.5) * fps) / 1_000_000));
}

/** Converts the normalized fps into a frame duration in microseconds. */
export function getRenderLoopFrameDurationUs(fps: number): number {
  return Math.round(1_000_000 / Math.max(1, fps));
}

/** Converts fps into the render-loop keyframe cadence used for MP4 output. */
export function getFrameDrivenKeyframeInterval(fps: number): number {
  return Math.max(1, Math.round(fps * MP4_KEYFRAME_INTERVAL_SECONDS));
}

/** Maps a frame index to the current render time and clamps it to duration. */
export function getRenderLoopCurrentTime(
  frameIndex: number,
  fps: number,
  duration: number
): number {
  return Math.min(duration, frameIndex / fps);
}
