import { expect, it } from 'vitest';
import { buildReviewTimeMap } from './timeline';
import { REVIEW_SPEED_RATES } from './speed';
import {
  anchorReviewVoiceover,
  projectReviewVoiceover,
  reviewVoiceoverRange,
} from './voiceover-edits';
import { parseVoiceoverAnchors } from './voiceover-validation';
import {
  retimeReviewVoiceover,
  reviewVoiceoverSampleDelta,
  reviewVoiceoverSourceAtOffset,
} from './voiceover-timing';

it.each(REVIEW_SPEED_RATES)(
  'keeps native samples and the start anchor across Speed %sx',
  (rate) => {
    const before = buildReviewTimeMap(60, []);
    const after = buildReviewTimeMap(60, [
      {
        id: 's',
        kind: 'speed',
        start: 10,
        end: 20,
        requestedStart: 10,
        requestedEnd: 20,
        rate,
        audio: 'speed',
      },
    ]);
    const recording = anchorReviewVoiceover(
      {
        id: 'v',
        assetId: 'asset',
        timelineStart: 9.7,
        sourceOffset: 0.3,
        duration: 2.3,
        volume: 1,
        muted: false,
        fadeIn: 0.2,
        fadeOut: 0.4,
      },
      before
    );
    const projected = retimeReviewVoiceover(recording, after);
    expect(projected.timelineStart).toBe(9.7);
    expect(
      parseVoiceoverAnchors(projected.sourceAnchor, projected.timelineStart, projected.duration)
    ).toEqual(projected.sourceAnchor);
    const audible = projectReviewVoiceover([projected], after);
    expect(audible).toMatchObject([{ timelineStart: 9.7, playbackRate: 1, sourceOffset: 0.3 }]);
    expect(audible[0]!.duration).toBeCloseTo(2.3);
    expect(reviewVoiceoverRange(retimeReviewVoiceover(projected, before)).end).toBeCloseTo(
      reviewVoiceoverRange(recording).end
    );
    expect(recording.sourceAnchor).toEqual([{ start: 9.7, end: 12, offset: 0, duration: 2.3 }]);
  }
);

it.each([0.25, 0.5, 1, 2, 4])(
  'inverts explicit edge extension at own tempo %sx through speeds and cut footprints',
  (tempo) => {
    const map = buildReviewTimeMap(30, [
      {
        id: 's1',
        kind: 'speed',
        start: 2,
        end: 6,
        requestedStart: 2,
        requestedEnd: 6,
        rate: 2,
        audio: 'speed',
      },
      { id: 'c', kind: 'cut', start: 8, end: 10, requestedStart: 8, requestedEnd: 10 },
      {
        id: 's2',
        kind: 'speed',
        start: 12,
        end: 16,
        requestedStart: 12,
        requestedEnd: 16,
        rate: 0.5,
        audio: 'speed',
      },
    ]);
    for (const [start, end] of [
      [0, 6],
      [4, 18],
      [6, 2],
      [20, 1],
      [29, 32],
    ]) {
      const samples = reviewVoiceoverSampleDelta(start!, end!, tempo, map);
      expect(reviewVoiceoverSourceAtOffset(start!, samples, tempo, map)).toBeCloseTo(end!);
    }
    expect(reviewVoiceoverSourceAtOffset(2, 1, tempo)).toBeCloseTo(2 + 1 / tempo);
  }
);
