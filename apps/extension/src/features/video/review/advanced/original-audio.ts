import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ReviewEdit } from '../types';
import type { QuickEditOriginalAudio, QuickEditOriginalAudioRange } from './types';

/** Source-time gain intervals never move when cuts or speed edits change output time. */
export function parseOriginalAudioRanges(value: unknown): QuickEditOriginalAudioRange[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const ranges: QuickEditOriginalAudioRange[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, start, end, volume } = item;
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      id.trim() !== id ||
      id.length > 256 ||
      ids.has(id) ||
      typeof start !== 'number' ||
      !Number.isFinite(start) ||
      start < 0 ||
      typeof end !== 'number' ||
      !Number.isFinite(end) ||
      end > 86_400 ||
      end - start < 0.001 ||
      typeof volume !== 'number' ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 2
    )
      return null;
    ids.add(id);
    ranges.push({ id, start, end, volume });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges.some((range, i) => i > 0 && range.start < ranges[i - 1]!.end) ? null : ranges;
}

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
  const range = original.ranges?.find((item) => time >= item.start && time < item.end);
  return original.volume * (range?.volume ?? 1);
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
  return range.end - range.start - removed >= 0.001;
}
