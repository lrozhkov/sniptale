import {
  anchorReviewVoiceoverAtSource,
  moveReviewVoiceover,
  reviewVoiceoverOffset,
  trimReviewVoiceoverNative,
} from '../review/voiceover-edits';
import { retimeReviewVoiceover } from '../review/voiceover-timing';
import { parseReviewAudioClip } from '../review/audio-clip-validation';
import type { QuickEditAudioClip } from '../review/advanced/types';
import type { VideoProjectSourceVoiceoverDocument } from './source-voiceover';

type TimingEdit = { kind: 'position' | 'start' | 'end'; time: number };

/** Native file bounds use the capture clock, never an overlapping montage's global map. */
export function getSourceVoiceoverTimingBounds(
  document: VideoProjectSourceVoiceoverDocument,
  assetDuration: number | null
) {
  const take = document.take;
  const normalized = retimeReviewVoiceover(take, document.reference);
  const earliest = normalized.sourceAnchor?.length
    ? take.sourceOffset + reviewVoiceoverOffset(normalized, 0, document.reference)
    : 0;
  return {
    positionMax: Math.min(
      86_400,
      Math.max(take.timelineStart, document.reference.at(-1)!.sourceEnd)
    ),
    startMin: Math.max(0, earliest),
    startMax: Math.min(86_400, take.sourceOffset + take.duration - 0.001),
    endMin: take.sourceOffset + 0.001,
    endMax: Math.min(
      assetDuration ?? take.sourceOffset + take.duration,
      take.sourceOffset + 86_400
    ),
  };
}

/** Returns authored whole samples; the caller retains exact-root admission and history. */
export function editSourceVoiceoverTiming(
  document: VideoProjectSourceVoiceoverDocument,
  edit: TimingEdit,
  assetDuration: number | null
): QuickEditAudioClip | null {
  if (
    !Number.isFinite(edit.time) ||
    (assetDuration !== null && (!Number.isFinite(assetDuration) || assetDuration <= 0))
  )
    return null;
  const take = document.take;
  const bounds = getSourceVoiceoverTimingBounds(document, assetDuration);
  if (edit.kind === 'position') {
    if (edit.time < 0 || edit.time > bounds.positionMax) return null;
    if (edit.time === take.timelineStart && !take.dormant) return take;
    const placed = take.sourceAnchor?.length
      ? moveReviewVoiceover(take, edit.time, bounds.positionMax)
      : anchorReviewVoiceoverAtSource(
          { ...take, dormant: false, timelineStart: edit.time },
          document.reference
        );
    const next = { ...placed, ...(take.dormant ? { dormant: false } : {}) };
    return parseReviewAudioClip(next) ? next : null;
  }
  const current = edit.kind === 'start' ? take.sourceOffset : take.sourceOffset + take.duration;
  if (edit.time === current) return take;
  const min = edit.kind === 'start' ? bounds.startMin : bounds.endMin;
  const max = edit.kind === 'start' ? Math.min(86_400, bounds.startMax) : bounds.endMax;
  if (edit.time < min || edit.time > max) return null;
  let next: QuickEditAudioClip;
  if (take.sourceAnchor?.length) {
    const normalized = retimeReviewVoiceover(take, document.reference);
    next = trimReviewVoiceoverNative(
      normalized,
      edit.kind,
      edit.time - take.sourceOffset,
      assetDuration ?? undefined,
      document.reference
    );
  } else {
    // Dormant samples have no source placement to move when an edge changes.
    const from = edit.kind === 'start' ? edit.time : take.sourceOffset;
    const to = edit.kind === 'end' ? edit.time : take.sourceOffset + take.duration;
    const duration = to - from;
    next = {
      ...take,
      sourceOffset: from,
      duration,
      fadeIn: Math.min(take.fadeIn, duration),
      fadeOut: Math.min(take.fadeOut, duration),
    };
  }
  return parseReviewAudioClip(next) ? next : null;
}
