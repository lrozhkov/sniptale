import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AudioGainRange } from './source-attenuation';

/** Authored gain in source seconds, independent of editor placement. */
export interface SourceAudioGainRange extends AudioGainRange {
  id: string;
}

/** Source-time gain intervals never move when cuts or speed edits change output time. */
export function parseSourceAudioGainRanges(value: unknown): SourceAudioGainRange[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const ranges: SourceAudioGainRange[] = [];
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

/** Admits static attenuation without sorting or merging overlapping intent. */
export function parseSourceAudioAttenuationRanges(value: unknown): SourceAudioGainRange[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const ranges: SourceAudioGainRange[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, start, end, volume } = item;
    if (
      typeof id !== 'string' ||
      !id ||
      id.trim() !== id ||
      id.length > 256 ||
      ids.has(id) ||
      typeof start !== 'number' ||
      !Number.isFinite(start) ||
      start < 0 ||
      typeof end !== 'number' ||
      !Number.isFinite(end) ||
      end > 86_400 ||
      end <= start ||
      typeof volume !== 'number' ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 1
    )
      return null;
    ids.add(id);
    ranges.push({ id, start, end, volume });
  }
  return ranges;
}
