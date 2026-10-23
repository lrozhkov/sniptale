import {
  MIN_VIDEO_PROJECT_PLAYBACK_RATE,
  MAX_VIDEO_PROJECT_PLAYBACK_RATE,
} from '../validation/primitives';
import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
  VideoProjectClip,
} from '../types/index';

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampClipPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return clampValue(value, MIN_VIDEO_PROJECT_PLAYBACK_RATE, MAX_VIDEO_PROJECT_PLAYBACK_RATE);
}

export function normalizeClipPlaybackRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

/** Returns elapsed content time independently from the physical placement. */
export function getClipPlaybackOffset(
  clip: Pick<VideoProjectClip, 'startTime' | 'duration' | 'playbackWindow'>,
  currentTime: number
): number {
  return (
    (clip.playbackWindow?.offset ?? 0) + clampValue(currentTime - clip.startTime, 0, clip.duration)
  );
}

/** A sliced placement retains its original envelope clocks instead of restarting them. */
export function sliceClipPlaybackWindow(
  clip: Pick<VideoProjectClip, 'duration' | 'playbackWindow'>,
  offset: number
): NonNullable<VideoProjectClip['playbackWindow']> {
  const window = clip.playbackWindow;
  const phase = (value: { offset: number; duration: number } | undefined) => ({
    offset: (value?.offset ?? 0) + offset,
    duration: value?.duration ?? (clip.duration > 0 ? clip.duration : (window?.extent ?? 0)),
  });
  return {
    ...window,
    offset: (window?.offset ?? 0) + offset,
    extent: window?.extent ?? (window?.offset ?? 0) + clip.duration,
    fadePhase: phase(window?.fadePhase),
    gainPhase: phase(window?.gainPhase),
  };
}

/** Content and envelope clocks scale together when the source playback rate changes. */
export function scaleClipPlaybackWindow(
  window: NonNullable<VideoProjectClip['playbackWindow']>,
  factor: number
): NonNullable<VideoProjectClip['playbackWindow']> {
  const phase = (value: { offset: number; duration: number }) => ({
    offset: value.offset * factor,
    duration: value.duration * factor,
  });
  return {
    offset: window.offset * factor,
    ...(window.extent === undefined ? {} : { extent: window.extent * factor }),
    ...(window.holdAt === undefined ? {} : { holdAt: window.holdAt * factor }),
    ...(window.fadePhase ? { fadePhase: phase(window.fadePhase) } : {}),
    ...(window.gainPhase ? { gainPhase: phase(window.gainPhase) } : {}),
  };
}

export function getMediaClipSourceTime(
  clip: VideoProjectVideoClip | VideoProjectAudioClip,
  currentTime: number
): number {
  const projectOffset = getClipPlaybackOffset(clip, currentTime);
  return (
    clip.sourceStart +
    projectOffset * normalizeClipPlaybackRate(clip.playbackRate ?? 1) -
    (clip.type === 'VIDEO' ? (clip.cameraTiming?.offsetSeconds ?? 0) : 0)
  );
}

export function getVideoClipSourceTime(clip: VideoProjectVideoClip, currentTime: number): number {
  if (clip.playbackWindow?.holdAt === undefined) return getMediaClipSourceTime(clip, currentTime);
  const offset = Math.min(getClipPlaybackOffset(clip, currentTime), clip.playbackWindow.holdAt);
  return (
    clip.sourceStart +
    offset * normalizeClipPlaybackRate(clip.playbackRate ?? 1) -
    (clip.cameraTiming?.offsetSeconds ?? 0)
  );
}

export function getSourceTimedClipProjectDuration(
  clip: Pick<VideoProjectVideoClip | VideoProjectAudioClip, 'playbackRate' | 'sourceDuration'>
): number {
  return clip.sourceDuration / normalizeClipPlaybackRate(clip.playbackRate ?? 1);
}

export function getSourceTimedClipProjectOffset(
  clip: Pick<
    VideoProjectVideoClip | VideoProjectAudioClip,
    'playbackRate' | 'sourceDuration' | 'playbackWindow'
  >,
  sourceOffset: number
): number {
  return (
    clampValue(sourceOffset, 0, clip.sourceDuration) /
      normalizeClipPlaybackRate(clip.playbackRate ?? 1) -
    (clip.playbackWindow?.offset ?? 0)
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

/** Returns the retained visual presentation clock in project seconds for a source clip. */
export function getVideoClipPresentationTime(
  clip: VideoProjectVideoClip,
  currentTime: number
): number {
  return (
    clip.startTime +
    getSourceTimedClipProjectOffset(
      clip,
      getVideoClipSourceTime(clip, currentTime) -
        clip.sourceStart +
        (clip.cameraTiming?.offsetSeconds ?? 0)
    )
  );
}

/** Checks retained source and visual clock continuity at adjacent video edges. */
export function areVideoClipSourceClocksContinuous(
  left: VideoProjectVideoClip,
  right: VideoProjectVideoClip
): boolean {
  if (!left.playbackWindow && !right.playbackWindow)
    return Math.abs(left.sourceStart + left.sourceDuration - right.sourceStart) <= 0.000_001;
  if ((left.playbackRate ?? 1) !== (right.playbackRate ?? 1)) return false;
  const source = (clip: VideoProjectVideoClip, time: number, visual: boolean) => {
    const value =
      (visual ? getVideoClipSourceTime(clip, time) : getMediaClipSourceTime(clip, time)) +
      (clip.cameraTiming?.offsetSeconds ?? 0);
    return visual ? Math.min(clip.sourceStart + clip.sourceDuration, value) : value;
  };
  const end = left.startTime + left.duration;
  return (
    Math.abs(source(left, end, false) - source(right, right.startTime, false)) <= 0.000_001 &&
    Math.abs(source(left, end, true) - source(right, right.startTime, true)) <= 0.000_001
  );
}
