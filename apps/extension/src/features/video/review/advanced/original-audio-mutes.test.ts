import { describe, expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState } from './validation';
import { originalAudioGainAt } from './original-audio';
import { resolveQuickEditEffectiveState } from './effective';
import { anchorReviewVoiceoverAtSource } from '../voiceover-edits';
import { buildReviewTimeMap } from '../timeline';
import type { ReviewEdit } from '../types';
import {
  changeOriginalAudioMute,
  originalAudioRangeViews,
  parseOriginalAudioMutes,
  resolveOriginalSourceAudio,
} from './original-audio-mutes';

function fixture(edits: ReviewEdit[] = [], duration = 6, tempo = 1) {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.audio = true;
  const map = buildReviewTimeMap(12, edits);
  state.audio.voiceoverSegments = map;
  state.audio.voiceover = [
    anchorReviewVoiceoverAtSource(
      {
        id: 'take',
        assetId: 'asset',
        timelineStart: 2,
        sourceOffset: 1,
        duration,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        tempo,
      },
      map
    ),
  ];
  state.audio.original.mutes = [{ id: 'binding', kind: 'take', clipId: 'take' }];
  return state;
}

describe('authored take source attenuation', () => {
  it('admits bounded metadata, rejects orphan/duplicate/aliased bindings and opens older projects', () => {
    const state = fixture();
    expect(loadQuickEditAdvancedState(state)).toEqual(state);
    expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 12 })?.audio).toEqual(state.audio);
    for (const invalid of [
      [{ id: '', kind: 'range', start: 0, end: 1, volume: 0 }],
      [{ id: 'm', kind: 'range', start: 0, end: 1, volume: 1.1 }],
      [{ id: 'm', kind: 'range', start: NaN, end: 1, volume: 0 }],
      [{ id: 'm', kind: 'range', start: 1, end: 1, volume: 0 }],
      [{ id: 'm', kind: 'range', start: 0, end: Infinity, volume: 0 }],
      Array.from({ length: 513 }, (_, i) => ({
        id: String(i),
        kind: 'range',
        start: 0,
        end: 1,
        volume: 0,
      })),
      [
        { id: 'a', kind: 'take', clipId: 'take' },
        { id: 'b', kind: 'take', clipId: 'take' },
      ],
    ])
      expect(parseOriginalAudioMutes(invalid)).toBeNull();
    state.audio.original.mutes = [{ id: 'binding', kind: 'take', clipId: 'absent' }];
    expect(loadQuickEditAdvancedState(state)).toBeNull();
    state.audio.original.mutes = [{ id: 'binding', kind: 'take', clipId: 'take' }];
    state.audio.original.ranges = [{ id: 'mute:binding:0', start: 0, end: 1, volume: 0.5 }];
    expect(loadQuickEditAdvancedState(state)).toBeNull();
  });

  it('uses actual native duration and tempo, excludes cut gaps and respects speed mapping', () => {
    const cut: ReviewEdit = {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
    };
    const speed: ReviewEdit = {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    };
    const state = fixture([cut, speed]);
    expect(originalAudioRangeViews(state.audio).map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 2, end: 4 },
      { start: 6, end: 10 },
    ]);
    const fast = fixture([], 6, 2);
    expect(originalAudioRangeViews(fast.audio).map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 2, end: 5 },
    ]);
    fast.audio.voiceover[0]!.dormant = true;
    expect(originalAudioRangeViews(fast.audio)).toEqual([]);
  });

  it('composes overlapping attenuation once, preserves authored/manual/master gain and half-open tails', () => {
    const state = fixture();
    state.audio.original.volume = 2;
    state.audio.original.ranges = [{ id: 'manual', start: 1, end: 10, volume: 0.75 }];
    state.audio.original.mutes!.push({
      id: 'overlay',
      kind: 'range',
      start: 7,
      end: 11,
      volume: 0.5,
    });
    const before = structuredClone(state);
    const original = resolveOriginalSourceAudio(state.audio);
    expect([0, 1, 2, 7, 8, 10, 11].map((time) => originalAudioGainAt(original, time))).toEqual([
      2, 1.5, 0, 0, 0.75, 1, 2,
    ]);
    expect(state).toEqual(before);
    state.ui.mode = 'basic';
    expect(originalAudioGainAt(resolveQuickEditEffectiveState(state).originalAudio, 3)).toBe(1.5);
    expect(originalAudioGainAt(resolveQuickEditEffectiveState(state).originalAudio, 8)).toBe(0.75);
  });

  it('freezes linked cut slices on editing and keeps them after deleting the take', () => {
    const cut: ReviewEdit = {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
    };
    const state = fixture([cut]);
    const id = originalAudioRangeViews(state.audio)[0]!.id;
    const detached = changeOriginalAudioMute({
      audio: state.audio,
      id,
      patch: { end: 3, volume: 0.25 },
      duration: 12,
    })!;
    expect(detached.original.mutes).toEqual([
      { id: 'mute:binding:0', kind: 'range', start: 2, end: 3, volume: 0.25 },
      { id: 'mute:binding:1', kind: 'range', start: 6, end: 8, volume: 0 },
    ]);
    detached.voiceover = [];
    expect(originalAudioRangeViews(detached)).toHaveLength(2);
    const removed = changeOriginalAudioMute({ audio: state.audio, id, patch: null, duration: 12 })!;
    expect(removed.original.mutes).toEqual([
      { id: 'mute:binding:1', kind: 'range', start: 6, end: 8, volume: 0 },
    ]);
    const { sourceAnchor: _anchor, ...unanchored } = state.audio.voiceover[0]!;
    state.audio.voiceover = [
      anchorReviewVoiceoverAtSource(
        { ...unanchored, timelineStart: 8 },
        state.audio.voiceoverSegments!
      ),
    ];
    expect(originalAudioRangeViews(state.audio)[0]?.start).toBe(8);
  });

  it('refuses invalid edits and bounded expansion without mutating the prior document', () => {
    const cut: ReviewEdit = {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
    };
    const state = fixture([cut]);
    state.audio.original.mutes!.push(
      ...Array.from({ length: 511 }, (_, i) => ({
        id: `manual-${i}`,
        kind: 'range' as const,
        start: 0,
        end: 1,
        volume: 0.5,
      }))
    );
    const before = structuredClone(state);
    const id = originalAudioRangeViews(state.audio).find((item) => item.origin === 'take')!.id;
    expect(
      changeOriginalAudioMute({ audio: state.audio, id, patch: { volume: 0.5 }, duration: 12 })
    ).toBeNull();
    expect(
      changeOriginalAudioMute({ audio: fixture().audio, id, patch: { start: -1 }, duration: 12 })
    ).toBeNull();
    expect(
      changeOriginalAudioMute({ audio: fixture().audio, id, patch: { end: 13 }, duration: 12 })
    ).toBeNull();
    expect(state).toEqual(before);
  });
});
