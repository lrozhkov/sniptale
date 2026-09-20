import { moveReviewVoiceover, trimReviewVoiceover } from '../voiceover-edits';
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
  if (clip.sourceAnchor) return clip;
  const timelineStart = clamp(
    clip.timelineStart,
    0,
    Math.max(0, timelineDuration - MIN_CLIP_SECONDS)
  );
  const duration = clamp(clip.duration, MIN_CLIP_SECONDS, timelineDuration - timelineStart);
  return { ...clip, timelineStart, duration };
}

/** Fades never exceed the clip and share its length proportionally when it shrinks. */
function normalizeFades(clip: QuickEditAudioClip): QuickEditAudioClip {
  const sum = clip.fadeIn + clip.fadeOut;
  const factor = sum > clip.duration && sum > 0 ? clip.duration / sum : 1;
  return { ...clip, fadeIn: clip.fadeIn * factor, fadeOut: clip.fadeOut * factor };
}

/**
 * Bounded edge trim: a left trim advances into the asset instead of inventing
 * audio before the file, and a right trim is bounded by the known asset length
 * as well as the timeline. Unknown assets conservatively retain their existing source end.
 */
export function trimQuickEditAudioClip(
  clip: QuickEditAudioClip,
  edge: 'start' | 'end',
  timelineTime: number,
  timelineDuration: number,
  assetDuration?: number
): QuickEditAudioClip {
  if (clip.sourceAnchor)
    return trimReviewVoiceover(clip, edge, timelineTime, timelineDuration, assetDuration);
  if (edge === 'start') {
    const minStart = Math.max(0, clip.timelineStart - clip.sourceOffset);
    const nextStart = clamp(
      timelineTime,
      minStart,
      clip.timelineStart + clip.duration - MIN_CLIP_SECONDS
    );
    const shift = nextStart - clip.timelineStart;
    return normalizeFades(
      clampQuickEditAudioClip(
        {
          ...clip,
          timelineStart: nextStart,
          sourceOffset: clip.sourceOffset + shift,
          duration: clip.duration - shift,
        },
        timelineDuration
      )
    );
  }
  const assetMax =
    assetDuration === undefined
      ? clip.duration
      : Math.max(MIN_CLIP_SECONDS, assetDuration - clip.sourceOffset);
  const maxDuration = Math.min(assetMax, timelineDuration - clip.timelineStart);
  const duration = clamp(timelineTime - clip.timelineStart, MIN_CLIP_SECONDS, maxDuration);
  return normalizeFades(clampQuickEditAudioClip({ ...clip, duration }, timelineDuration));
}

/** Moving never trims: the requested start clamps to the free timeline window. */
export function moveQuickEditAudioClip(
  clip: QuickEditAudioClip,
  requestedStart: number,
  timelineDuration: number
): QuickEditAudioClip {
  if (clip.sourceAnchor) return moveReviewVoiceover(clip, requestedStart, timelineDuration);
  return {
    ...clip,
    timelineStart: clamp(requestedStart, 0, Math.max(0, timelineDuration - clip.duration)),
  };
}

/** Preview and export share one original-audio gate: speed muting wins over the original flag. */
export function resolveOriginalAudioPlayback(
  original: QuickEditOriginalAudio,
  speedMuted: boolean
): QuickEditOriginalAudio {
  return { muted: speedMuted || original.muted, volume: original.volume };
}
