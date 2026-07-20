export interface VideoEditorPlaybackRange {
  end: number;
  start: number;
}

const MIN_PLAYBACK_RANGE_DURATION = 0.05;

export function createPlaybackRange(
  anchorTime: number,
  targetTime: number
): VideoEditorPlaybackRange | null {
  const start = Math.min(anchorTime, targetTime);
  const end = Math.max(anchorTime, targetTime);
  if (end - start < MIN_PLAYBACK_RANGE_DURATION) {
    return null;
  }

  return { start, end };
}

export function clampPlaybackRange(
  range: VideoEditorPlaybackRange,
  duration: number
): VideoEditorPlaybackRange | null {
  const maxTime = Math.max(0, duration);
  const start = clampToProject(range.start, maxTime);
  const end = clampToProject(range.end, maxTime);
  if (end - start < MIN_PLAYBACK_RANGE_DURATION) {
    return null;
  }

  return { start, end };
}

function clampToProject(value: number, duration: number): number {
  return Math.min(duration, Math.max(0, value));
}
