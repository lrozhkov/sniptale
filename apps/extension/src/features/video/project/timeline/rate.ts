import type { VideoProjectAudioClip, VideoProjectVideoClip } from '../types/index';

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampClipPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return clampValue(value, 1, 4);
}

export function normalizeClipPlaybackRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

export function getMediaClipSourceTime(
  clip: VideoProjectVideoClip | VideoProjectAudioClip,
  currentTime: number
): number {
  const projectOffset = clampValue(currentTime - clip.startTime, 0, clip.duration);
  return clip.sourceStart + projectOffset * normalizeClipPlaybackRate(clip.playbackRate ?? 1);
}

export function getVideoClipSourceTime(clip: VideoProjectVideoClip, currentTime: number): number {
  return getMediaClipSourceTime(clip, currentTime);
}

export function getSourceTimedClipProjectDuration(
  clip: Pick<VideoProjectVideoClip | VideoProjectAudioClip, 'playbackRate' | 'sourceDuration'>
): number {
  return clip.sourceDuration / normalizeClipPlaybackRate(clip.playbackRate ?? 1);
}

export function getSourceTimedClipProjectOffset(
  clip: Pick<VideoProjectVideoClip | VideoProjectAudioClip, 'playbackRate' | 'sourceDuration'>,
  sourceOffset: number
): number {
  return (
    clampValue(sourceOffset, 0, clip.sourceDuration) /
    normalizeClipPlaybackRate(clip.playbackRate ?? 1)
  );
}

export function getSourceTimedClipSourceOffset(
  clip: Pick<VideoProjectVideoClip | VideoProjectAudioClip, 'duration' | 'playbackRate'>,
  projectOffset: number
): number {
  return (
    clampValue(projectOffset, -clip.duration, clip.duration) *
    normalizeClipPlaybackRate(clip.playbackRate ?? 1)
  );
}
