import type { QuickEditAudioClip, QuickEditOriginalAudio } from './types';

/** Renderer-consistent clip bounds, matching the persisted validation. */
const MIN_CLIP_SECONDS = 0.001;
const MAX_CLIP_VOLUME = 2;
const MAX_CLIP_FADE = 60;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** One clip reference; assetId resolves through the shared media library. */
export function createQuickEditAudioClip(args: {
  id: string;
  assetId: string;
  timelineStart: number;
  duration: number;
  endMax: number;
}): QuickEditAudioClip {
  const timelineStart = clamp(args.timelineStart, 0, Math.max(0, args.endMax - MIN_CLIP_SECONDS));
  return {
    id: args.id,
    assetId: args.assetId,
    timelineStart,
    sourceOffset: 0,
    duration: Math.max(MIN_CLIP_SECONDS, Math.min(args.duration, args.endMax - timelineStart)),
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

/** Applies a bounded patch; edits never move a clip outside the asset or the timeline. */
export function updateQuickEditAudioClip(
  clip: QuickEditAudioClip,
  patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>
): QuickEditAudioClip {
  const next = { ...clip, ...patch };
  return {
    ...next,
    timelineStart: Math.max(0, next.timelineStart),
    duration: Math.max(MIN_CLIP_SECONDS, next.duration),
    sourceOffset: Math.max(0, next.sourceOffset),
    volume: clamp(next.volume, 0, MAX_CLIP_VOLUME),
    fadeIn: clamp(next.fadeIn, 0, MAX_CLIP_FADE),
    fadeOut: clamp(next.fadeOut, 0, MAX_CLIP_FADE),
  };
}

/** Clips stay inside the output timeline; the UI never renders past the end. */
export function clampQuickEditAudioClip(
  clip: QuickEditAudioClip,
  timelineDuration: number
): QuickEditAudioClip {
  const timelineStart = clamp(
    clip.timelineStart,
    0,
    Math.max(0, timelineDuration - MIN_CLIP_SECONDS)
  );
  const duration = clamp(clip.duration, MIN_CLIP_SECONDS, timelineDuration - timelineStart);
  return { ...clip, timelineStart, duration };
}

/** Trims one timeline edge; a left trim advances into the asset instead of shortening it. */
export function trimQuickEditAudioClip(
  clip: QuickEditAudioClip,
  edge: 'start' | 'end',
  timelineTime: number,
  timelineDuration: number
): QuickEditAudioClip {
  if (edge === 'start') {
    const nextStart = clamp(timelineTime, 0, clip.timelineStart + clip.duration - MIN_CLIP_SECONDS);
    const shift = nextStart - clip.timelineStart;
    return clampQuickEditAudioClip(
      updateQuickEditAudioClip(clip, {
        timelineStart: nextStart,
        sourceOffset: clip.sourceOffset + shift,
        duration: clip.duration - shift,
      }),
      timelineDuration
    );
  }
  const duration = Math.max(MIN_CLIP_SECONDS, timelineTime - clip.timelineStart);
  return clampQuickEditAudioClip(updateQuickEditAudioClip(clip, { duration }), timelineDuration);
}

/** Preview and export share one original-audio gate: speed muting wins over the original flag. */
export function resolveOriginalAudioPlayback(
  original: QuickEditOriginalAudio,
  speedMuted: boolean
): QuickEditOriginalAudio {
  return { muted: speedMuted || original.muted, volume: original.volume };
}
