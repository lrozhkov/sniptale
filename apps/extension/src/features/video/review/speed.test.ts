import { expect, it } from 'vitest';
import { REVIEW_SPEED_RATES, isReviewSpeedRate } from './speed';
import { createReviewSpeed, reviewPlaybackSettings } from './cuts';
import { buildReviewTimeMap } from './timeline';
import { encodeReviewProvenance, parseReviewProvenance } from './provenance';

it.each(REVIEW_SPEED_RATES)(
  'round-trips rate %s through edits, preview, time mapping and export metadata',
  (rate) => {
    const edit = createReviewSpeed({
      id: 'speed',
      selection: { kind: 'range', start: 0, end: 4 },
      boundaries: [0, 2, 4],
      duration: 4,
      edits: [],
      rate,
      audio: 'speed',
    })!;
    expect(edit).toMatchObject({ rate });
    expect(reviewPlaybackSettings(1, [edit]).rate).toBe(rate);
    expect(buildReviewTimeMap(4, [edit]).at(-1)?.resultEnd).toBe(4 / rate);
    const data = {
      format: 'sniptale.video-edit.v1' as const,
      timeUnit: 'seconds' as const,
      source: {
        duration: 4,
        width: 160,
        height: 90,
        size: 5,
        mimeType: 'video/webm',
        filename: 'clip.webm',
      },
      revision: 1,
      exportedAt: 1,
      edits: [edit],
      audioReencoded: true,
    };
    expect(parseReviewProvenance(encodeReviewProvenance(data))).toEqual(data);
  }
);
it('rejects unsupported and non-finite rates at the durable boundary', () => {
  for (const value of [0, -1, 1, 0.01, 7, 32, NaN, Infinity, '2', null])
    expect(isReviewSpeedRate(value)).toBe(false);
});
