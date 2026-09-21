import { describe, expect, it } from 'vitest';
import {
  canPlaceOriginalAudioRange,
  originalAudioGainAt,
  parseOriginalAudioRanges,
} from './original-audio';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState } from './validation';
import { resolveQuickEditExportPlan } from './effective';
import type { ReviewEdit } from '../types';

const range = { id: 'gain', start: 4, end: 8, volume: 0.5 };
const speed: ReviewEdit = {
  id: 'speed',
  kind: 'speed',
  start: 5,
  end: 6,
  requestedStart: 5,
  requestedEnd: 6,
  rate: 2,
  audio: 'mute',
};

describe('source audio automation', () => {
  it('keeps half-open intervals and master gain, with speed mute taking priority', () => {
    const original = { muted: false, volume: 2, ranges: [range] };
    expect(originalAudioGainAt(original, 3)).toBe(2);
    expect(originalAudioGainAt(original, 4)).toBe(1);
    expect(originalAudioGainAt(original, 8)).toBe(2);
    expect(originalAudioGainAt(original, 5.5, [speed])).toBe(0);
    expect(originalAudioGainAt(original, 6, [speed])).toBe(1);
    expect(original.ranges).toEqual([range]);
    expect(originalAudioGainAt({ ...original, muted: true }, 4)).toBe(0);
  });
  it('rejects corrupt/overlapping ranges but accepts adjacent ranges and preserves parse roundtrip', () => {
    expect(parseOriginalAudioRanges([range, { ...range, id: 'other' }])).toBeNull();
    for (const volume of [-1, 3, NaN, Infinity])
      expect(parseOriginalAudioRanges([{ ...range, volume }])).toBeNull();
    expect(
      parseOriginalAudioRanges(Array.from({ length: 513 }, (_, i) => ({ ...range, id: String(i) })))
    ).toBeNull();
    const ranges = [range, { ...range, id: 'next', start: 8, end: 9, volume: 0 }];
    expect(parseOriginalAudioRanges(ranges)).toEqual(ranges);
    const state = createQuickEditAdvancedState();
    state.audio.original.ranges = ranges;
    expect(loadQuickEditAdvancedState(state)).toEqual(state);
  });
  it('allows gain under speed muting without allowing overlaps or entirely cut intervals', () => {
    expect(canPlaceOriginalAudioRange(range, [], [speed], 10)).toBe(true);
    expect(canPlaceOriginalAudioRange(range, [range], [], 10)).toBe(false);
    expect(canPlaceOriginalAudioRange(range, [range], [], 10, range.id)).toBe(true);
    const cut: ReviewEdit = {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
    };
    expect(canPlaceOriginalAudioRange(range, [], [cut], 10)).toBe(false);
    expect(canPlaceOriginalAudioRange({ start: 3, end: 8 }, [], [cut], 10)).toBe(true);
  });
  it('processes only audio for gain edits and does not reencode video merely for an empty enabled focus lane', () => {
    const advanced = createQuickEditAdvancedState();
    advanced.ui.mode = 'advanced';
    advanced.ui.tracks.zoom = true;
    advanced.zoom.enabled = true;
    advanced.audio.original.ranges = [range];
    expect(
      resolveQuickEditExportPlan({ advanced, document: { edits: [], canvasComments: [] } })
    ).toEqual({ kind: 'ready', video: 'copy', audio: 'process', reasons: ['original-audio'] });
    advanced.ui.mode = 'basic';
    expect(
      resolveQuickEditExportPlan({ advanced, document: { edits: [], canvasComments: [] } })
    ).toEqual({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
  });
});
