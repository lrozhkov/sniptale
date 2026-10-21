import { sourceAudioGainAtTime } from '../../audio/source-attenuation';
import type { ReviewEdit } from '../types';
import type { QuickEditOriginalAudio, QuickEditOriginalAudioRange } from './types';

/** Master gain multiplies the selected range; explicit speed/cut muting always wins. */
export function originalAudioGainAt(
  original: QuickEditOriginalAudio,
  time: number,
  edits: readonly ReviewEdit[] = []
): number {
  if (
    original.muted ||
    edits.some(
      (edit) =>
        time >= edit.start && time < edit.end && (edit.kind === 'cut' || edit.audio === 'mute')
    )
  )
    return 0;
  return original.volume * sourceAudioGainAtTime(original.ranges ?? [], time);
}

/** A range must retain audible video and must not overlap another manually controlled range. */
export function canPlaceOriginalAudioRange(
  range: { start: number; end: number },
  ranges: readonly QuickEditOriginalAudioRange[],
  edits: readonly ReviewEdit[],
  duration: number,
  exceptId?: string
): boolean {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end > duration ||
    range.end - range.start < 0.001 ||
    ranges.some((item) => item.id !== exceptId && item.start < range.end && item.end > range.start)
  )
    return false;
  const removed = edits
    .filter((edit) => edit.kind === 'cut')
    .reduce(
      (sum, edit) =>
        sum + Math.max(0, Math.min(range.end, edit.end) - Math.max(range.start, edit.start)),
      0
    );
  // Existing authored ranges remain editable when a later cut hides them completely.
  return (
    (exceptId !== undefined && ranges.some((item) => item.id === exceptId)) ||
    range.end - range.start - removed >= 0.001
  );
}
