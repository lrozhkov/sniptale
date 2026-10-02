import { expect, it } from 'vitest';
import {
  anchorReviewVoiceover,
  normalizeReviewVoiceoverTempo,
  reviewVoiceoverPlaybackDuration,
  projectReviewVoiceover,
  moveReviewVoiceover,
  trimReviewVoiceover,
  reviewVoiceoverRange,
} from './voiceover-edits';
import { parseVoiceoverAnchors, parseVoiceoverSegments } from './voiceover-validation';
import { buildReviewTimeMap } from './timeline';
import type { ReviewEdit } from './types';
import type { QuickEditAudioClip } from './advanced/types';

const cut = (start: number, end: number): ReviewEdit => ({
  id: 'cut',
  kind: 'cut',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
});
const original = buildReviewTimeMap(12, []);
const clip: QuickEditAudioClip = {
  id: 'voice',
  assetId: 'asset',
  timelineStart: 3,
  sourceOffset: 2,
  duration: 4,
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
};

it.each([0.5, 0.75, 1.5, 2, 4] as const)(
  'creates parseable native audio across decimal Speed %sx boundaries',
  (rate) => {
    const map = buildReviewTimeMap(30, [{ ...cut(10, 20), kind: 'speed', rate, audio: 'speed' }]);
    for (const start of [0.4, 8.1, 9.7, 10, 10.1, 15.1]) {
      for (const duration of [0.3, 3.3, 7.3, 10.1]) {
        const recording = anchorReviewVoiceover({ ...clip, timelineStart: start, duration }, map);
        expect(
          parseVoiceoverAnchors(recording.sourceAnchor, recording.timelineStart, duration)
        ).toEqual(recording.sourceAnchor);
        const audible = projectReviewVoiceover([recording], map);
        expect(audible.every((slice) => Math.abs(slice.playbackRate! - 1) < 1e-7)).toBe(true);
        expect(audible.reduce((sum, slice) => sum + slice.duration, 0)).toBeCloseTo(
          Math.min(duration, map.at(-1)!.resultEnd - start)
        );
      }
    }
  }
);

it('extends a voice trim across Speed without moving the fixed edge or changing native tempo', () => {
  const map = buildReviewTimeMap(20, [{ ...cut(2, 6), kind: 'speed', rate: 2, audio: 'speed' }]);
  const recording = anchorReviewVoiceover({ ...clip, timelineStart: 4, duration: 2 }, map);
  const extended = trimReviewVoiceover(recording, 'start', 4, 20, 10, map);
  expect(reviewVoiceoverRange(extended)).toEqual({ start: 4, end: 8 });
  expect(extended).toMatchObject({ sourceOffset: 1, duration: 3 });
  expect(projectReviewVoiceover([extended], map)).toMatchObject([
    { timelineStart: 3, sourceOffset: 1, duration: 3, playbackRate: 1 },
  ]);
});

it('keeps a completely cut recording intact and automatically restores its full audio', () => {
  const anchored = anchorReviewVoiceover(clip, original);
  expect(anchored).toMatchObject(clip);
  expect(projectReviewVoiceover([anchored], buildReviewTimeMap(12, [cut(2, 8)]))).toEqual([]);
  expect(projectReviewVoiceover([anchored], original)).toMatchObject([clip]);
  expect(anchorReviewVoiceover(anchored, buildReviewTimeMap(12, [cut(2, 8)]))).toBe(anchored);
  expect(clip).not.toHaveProperty('sourceAnchor');
});

it('suppresses only the cut portion of a recording and preserves later speech', () => {
  const clips = [clip, { ...clip, id: 'later', timelineStart: 10, duration: 2 }].map((value) =>
    anchorReviewVoiceover(value, original)
  );
  const output = projectReviewVoiceover(clips, buildReviewTimeMap(12, [cut(3, 5)]));
  expect(output).toMatchObject([
    { timelineStart: 3, sourceOffset: 4, duration: 2 },
    { timelineStart: 8, duration: 2 },
  ]);
  expect(projectReviewVoiceover([clips[0]!], buildReviewTimeMap(12, [cut(7, 8)]))).toMatchObject([
    clip,
  ]);
  expect(clips[0]).toMatchObject({ sourceOffset: 2, duration: 4 });
});

it('keeps both audible sides of an interior cut at their original sample and fade phases', () => {
  const recording = anchorReviewVoiceover({ ...clip, fadeIn: 1, fadeOut: 1 }, original);
  const slices = projectReviewVoiceover([recording], buildReviewTimeMap(12, [cut(4, 5)]));
  expect(slices).toMatchObject([
    { timelineStart: 3, sourceOffset: 2, duration: 1, fadePhase: { offset: 0, duration: 4 } },
    { timelineStart: 4, sourceOffset: 4, duration: 2, fadePhase: { offset: 2, duration: 4 } },
  ]);
  expect(recording).toMatchObject({ sourceOffset: 2, duration: 4, fadeIn: 1, fadeOut: 1 });
});

it('preserves whole recordings authored over existing cuts and speeds', () => {
  const speed: ReviewEdit = { ...cut(0, 4), id: 'speed', kind: 'speed', rate: 2, audio: 'speed' };
  const previous = buildReviewTimeMap(12, [speed, cut(4, 6)]);
  const anchored = anchorReviewVoiceover({ ...clip, timelineStart: 1 }, previous);
  expect(anchored.sourceAnchor).toEqual([
    { start: 2, end: 4, offset: 0, duration: 1 },
    { start: 6, end: 9, offset: 1, duration: 3 },
  ]);
  expect(reviewVoiceoverRange(anchored)).toEqual({ start: 2, end: 9 });
  const audible = projectReviewVoiceover([anchored], original);
  expect(audible).toMatchObject([
    { timelineStart: 2, sourceOffset: 2, duration: 1 },
    { timelineStart: 5, sourceOffset: 3, duration: 3 },
  ]);
});

it('moves and explicitly trims retained recordings without cut-dependent clamping', () => {
  const anchored = anchorReviewVoiceover(clip, original);
  const moved = moveReviewVoiceover(anchored, 8, 12);
  expect(reviewVoiceoverRange(moved)).toEqual({ start: 8, end: 12 });
  expect(moved).toMatchObject({ duration: 4, sourceOffset: 2 });
  const left = trimReviewVoiceover(moved, 'start', 9, 12, 10);
  expect(left).toMatchObject({ timelineStart: 9, sourceOffset: 3, duration: 3 });
  const extended = trimReviewVoiceover(left, 'start', 7, 12, 10);
  expect(extended).toMatchObject({ timelineStart: 7, sourceOffset: 1, duration: 5 });
  expect(trimReviewVoiceover(anchored, 'end', 10, 12, 7)).toMatchObject({ duration: 5 });
  expect(trimReviewVoiceover(anchored, 'end', 1, 12)).toMatchObject({ duration: 0.001 });
});

it('preserves dormant and out-of-video audio instead of deleting records', () => {
  const dormant = { ...clip, dormant: true };
  expect(anchorReviewVoiceover(dormant, original)).toBe(dormant);
  const tail = anchorReviewVoiceover({ ...clip, timelineStart: 11 }, original);
  expect(tail.duration).toBe(4);
  expect(tail.sourceAnchor?.at(-1)?.end).toBe(15);
  const outside = anchorReviewVoiceover({ ...clip, timelineStart: 14 }, original);
  expect(outside.sourceAnchor).toEqual([{ start: 14, end: 18, offset: 0, duration: 4 }]);
  expect(projectReviewVoiceover([clip])).toEqual([clip]);
});

it('validates anchor coverage and mapping continuity without dropping malformed fields', () => {
  const anchored = anchorReviewVoiceover(clip, original);
  expect(parseVoiceoverAnchors(anchored.sourceAnchor, 3, 4)).toEqual(anchored.sourceAnchor);
  expect(parseVoiceoverSegments(original)).toEqual(original);
  for (const invalid of [
    null,
    [],
    [{}],
    [{ ...original[0], rate: 0 }],
    [{ ...original[0], sourceStart: 1 }],
    [{ ...original[0], resultEnd: 8 }],
    [{ ...original[0], kind: 'wrong' }],
  ])
    expect(parseVoiceoverSegments(invalid)).toBeNull();
  for (const invalid of [
    null,
    [],
    [{}],
    [{ start: 3, end: 3, offset: 0, duration: 4 }],
    [{ start: 3, end: 7, offset: 1, duration: 4 }],
    [{ start: 3, end: 7, offset: 0, duration: 2 }],
  ])
    expect(parseVoiceoverAnchors(invalid, 3, 4)).toBeNull();
});

it.each([2, 0.5] as const)(
  'matches playback geometry at %sx without changing the recording',
  (rate) => {
    const recording = anchorReviewVoiceover({ ...clip, timelineStart: 2, duration: 2 }, original);
    const map = buildReviewTimeMap(12, [{ ...cut(2, 8), kind: 'speed', rate, audio: 'speed' }]);
    expect(reviewVoiceoverRange(recording)).toEqual({ start: 2, end: 4 });
    expect(reviewVoiceoverPlaybackDuration(recording, map)).toBe(2);
    expect(projectReviewVoiceover([recording], map)[0]).toMatchObject({
      sourceOffset: clip.sourceOffset,
      playbackRate: 1,
    });
    const moved = moveReviewVoiceover(recording, 8, 12, map);
    expect(reviewVoiceoverRange(moved)).toEqual({ start: 8, end: 10 });
    expect(moved).toMatchObject({ duration: 2, sourceOffset: clip.sourceOffset });
    expect(reviewVoiceoverPlaybackDuration(moved, map)).toBe(2);
    expect(reviewVoiceoverPlaybackDuration(recording, original)).toBe(2);
  }
);

it('keeps native tempo across partial Speed boundaries and leaves authored source geometry unchanged', () => {
  const recording = anchorReviewVoiceover({ ...clip, timelineStart: 1, duration: 3 }, original);
  const map = buildReviewTimeMap(12, [{ ...cut(2, 4), kind: 'speed', rate: 2, audio: 'speed' }]);
  expect(reviewVoiceoverRange(recording)).toEqual({
    start: 1,
    end: 4,
  });
  expect(reviewVoiceoverPlaybackDuration(recording, map)).toBe(3);
  const later = anchorReviewVoiceover({ ...clip, timelineStart: 8, duration: 2 }, original);
  expect(reviewVoiceoverPlaybackDuration(later, map)).toBe(2);
  expect(reviewVoiceoverPlaybackDuration(recording, buildReviewTimeMap(12, [cut(2, 3)]))).toBe(2);
});

it('normalizes the whole affected voice and preserves sample coverage and source gaps', () => {
  const speed: ReviewEdit = { ...cut(0, 4), kind: 'speed', rate: 0.5, audio: 'speed' };
  const map = buildReviewTimeMap(12, [speed, cut(4, 6)]);
  const recording = anchorReviewVoiceover({ ...clip, timelineStart: 1, duration: 10 }, map);
  const normalized = normalizeReviewVoiceoverTempo(recording, speed, null);
  expect(normalized.sourceAnchor).toEqual([
    { start: 0.5, end: 7.5, offset: 0, duration: 7 },
    { start: 9.5, end: 12.5, offset: 7, duration: 3 },
  ]);
  expect(normalized).toMatchObject({ sourceOffset: 2, duration: 10, timelineStart: 0.5 });
  expect(parseVoiceoverAnchors(normalized.sourceAnchor, 0.5, 10)).toEqual(normalized.sourceAnchor);
  expect(recording.sourceAnchor?.[0]?.end).toBe(4);
  expect(normalizeReviewVoiceoverTempo(recording, speed, { ...speed, audio: 'mute' })).toBe(
    recording
  );
  const unrelated: ReviewEdit = { ...speed, start: 10, end: 12 };
  expect(normalizeReviewVoiceoverTempo(recording, unrelated, null)).toBe(recording);
  expect(normalizeReviewVoiceoverTempo(recording, cut(0, 4), null)).toBe(recording);
});

it('keeps continuous speech in one processing span across an obsolete creation-Speed boundary', () => {
  const speed: ReviewEdit = { ...cut(0, 8), kind: 'speed', rate: 2, audio: 'speed' };
  const map = buildReviewTimeMap(12, [speed]);
  const recording = anchorReviewVoiceover({ ...clip, timelineStart: 0, duration: 5.5 }, map);
  expect(projectReviewVoiceover([recording], map)).toMatchObject([
    { id: clip.id, playbackRate: 1, duration: 5.5, sourceOffset: 2 },
  ]);
  expect(projectReviewVoiceover([recording], map)).toHaveLength(1);
  const normalized = normalizeReviewVoiceoverTempo(recording, speed, null);
  expect(projectReviewVoiceover([normalized], original)).toHaveLength(1);
});

it.each([2, 0.5] as const)('video Speed %sx never changes a retained voice tempo', (rate) => {
  const recording = anchorReviewVoiceover({ ...clip, timelineStart: 2, duration: 2 }, original);
  const map = buildReviewTimeMap(12, [{ ...cut(2, 8), kind: 'speed', rate, audio: 'speed' }]);
  const audible = projectReviewVoiceover([recording], map);
  expect(audible.every((part) => part.playbackRate === 1)).toBe(true);
  expect(audible.reduce((sum, part) => sum + part.duration, 0)).toBeCloseTo(2);
});

it('moving a recording made under slow Speed out of a partial cut keeps its native tempo', () => {
  const speed: ReviewEdit = { ...cut(0, 4), kind: 'speed', rate: 0.5, audio: 'speed' };
  const recording = anchorReviewVoiceover(
    { ...clip, timelineStart: 6, duration: 2 },
    buildReviewTimeMap(12, [speed])
  );
  const map = buildReviewTimeMap(12, [speed, cut(3.5, 4)]);
  const moved = moveReviewVoiceover(recording, 8, 12, map);
  expect(projectReviewVoiceover([moved], map)).toMatchObject([
    { playbackRate: 1, duration: 2, sourceOffset: 2 },
  ]);
});

it.each([0.25, 0.5, 1, 2, 4])(
  'own tempo %sx survives Speed crossings, cuts and source-axis trims',
  (tempo) => {
    const map = buildReviewTimeMap(48, [{ ...cut(2, 8), kind: 'speed', rate: 2, audio: 'speed' }]);
    const recording = anchorReviewVoiceover({ ...clip, timelineStart: 1, duration: 4, tempo }, map);
    const audible = projectReviewVoiceover([recording], map);
    expect(audible).toHaveLength(1);
    expect(audible[0]).toMatchObject({ playbackRate: tempo, duration: 4 / tempo, sourceOffset: 2 });
    const moved = moveReviewVoiceover(recording, 9, 48, map);
    expect(projectReviewVoiceover([moved], map)[0]).toMatchObject({
      playbackRate: tempo,
      duration: 4 / tempo,
    });
    expect(projectReviewVoiceover([moved], buildReviewTimeMap(48, []))[0]).toMatchObject({
      playbackRate: tempo,
      duration: 4 / tempo,
    });
    const trimmed = trimReviewVoiceover(moved, 'start', 9 + 1 / tempo, 48, 10);
    expect(trimmed).toMatchObject({ sourceOffset: 3, duration: 3, tempo });
    expect(projectReviewVoiceover([trimmed], map)[0]?.duration).toBeCloseTo(3 / tempo);
  }
);
