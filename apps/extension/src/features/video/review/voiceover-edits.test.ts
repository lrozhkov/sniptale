import { expect, it } from 'vitest';
import {
  anchorReviewVoiceover,
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

it('keeps a completely cut recording intact and automatically restores its full audio', () => {
  const anchored = anchorReviewVoiceover(clip, original);
  expect(anchored).toMatchObject(clip);
  expect(projectReviewVoiceover([anchored], buildReviewTimeMap(12, [cut(2, 8)]))).toEqual([]);
  expect(projectReviewVoiceover([anchored], original)).toMatchObject([clip]);
  expect(anchorReviewVoiceover(anchored, buildReviewTimeMap(12, [cut(2, 8)]))).toBe(anchored);
  expect(clip).not.toHaveProperty('sourceAnchor');
});

it('suppresses intersected recordings but preserves later speech and touching boundaries', () => {
  const clips = [clip, { ...clip, id: 'later', timelineStart: 10, duration: 2 }].map((value) =>
    anchorReviewVoiceover(value, original)
  );
  const output = projectReviewVoiceover(clips, buildReviewTimeMap(12, [cut(3, 5)]));
  expect(output).toMatchObject([{ timelineStart: 8, duration: 2 }]);
  expect(projectReviewVoiceover([clips[0]!], buildReviewTimeMap(12, [cut(7, 8)]))).toMatchObject([
    clip,
  ]);
  expect(clips[0]).toMatchObject({ sourceOffset: 2, duration: 4 });
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
  expect(audible).toMatchObject([{ timelineStart: 2, sourceOffset: 2, duration: 4 }]);
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
