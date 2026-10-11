import { describe, expect, it } from 'vitest';
import { buildReviewTimeMap } from '../timeline';
import { projectReviewAnnotationEffect, sampleReviewAnnotationEffect } from './timing';

describe('annotation clock over the complete result video', () => {
  it('keeps phase across a removed middle interval and half-open slice boundaries', () => {
    const segments = buildReviewTimeMap(12, [
      { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
    ]);
    const projected = projectReviewAnnotationEffect({ start: 2, end: 10 }, segments);
    expect(projected.duration).toBe(6);
    expect(projected.slices).toEqual([
      { sourceStart: 2, sourceEnd: 5, start: 2, end: 5, offset: 0 },
      { sourceStart: 7, sourceEnd: 10, start: 5, end: 8, offset: 3 },
    ]);
    expect(sampleReviewAnnotationEffect(projected, 4, 5)).toEqual({
      time: 2,
      progress: 0.5,
      playbackRate: 2 / 3,
    });
    expect(sampleReviewAnnotationEffect(projected, 4, 8)).toBeNull();
    expect(sampleReviewAnnotationEffect(projected, 4, 1.9)).toBeNull();
  });

  it('weights retained intervals by result duration rather than source duration', () => {
    const projected = projectReviewAnnotationEffect(
      { start: 2, end: 10 },
      buildReviewTimeMap(12, [
        { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
        {
          id: 'speed',
          kind: 'speed',
          start: 7,
          end: 10,
          requestedStart: 7,
          requestedEnd: 10,
          rate: 2,
          audio: 'mute',
        },
      ])
    );
    expect(projected.duration).toBe(4.5);
    expect(sampleReviewAnnotationEffect(projected, 4, 5)?.time).toBeCloseTo(8 / 3);
    // A fragment starting here samples the original full projection, preserving its phase.
    expect(sampleReviewAnnotationEffect(projected, 4, 5.5)?.time).toBeCloseTo(28 / 9);
  });

  it('retains an authored anchor wholly covered by cuts and resumes after undo', () => {
    const anchor = { start: 3, end: 4 };
    const hidden = projectReviewAnnotationEffect(
      anchor,
      buildReviewTimeMap(10, [
        { id: 'cut', kind: 'cut', start: 2, end: 5, requestedStart: 2, requestedEnd: 5 },
      ])
    );
    expect(hidden).toEqual({ slices: [], duration: 0 });
    expect(sampleReviewAnnotationEffect(hidden, 4, 3)).toBeNull();
    expect(anchor).toEqual({ start: 3, end: 4 });
    expect(
      sampleReviewAnnotationEffect(
        projectReviewAnnotationEffect(anchor, buildReviewTimeMap(10, [])),
        4,
        3.5
      )?.progress
    ).toBe(0.5);
  });

  it('clips slices to both the authored interval and visible source bounds', () => {
    const projection = projectReviewAnnotationEffect(
      { start: 1, end: 9 },
      buildReviewTimeMap(6, [])
    );
    expect(projection.slices).toEqual([
      { sourceStart: 1, sourceEnd: 6, start: 1, end: 6, offset: 0 },
    ]);
    expect(sampleReviewAnnotationEffect(projection, 4, 6)).toBeNull();
    expect(() => sampleReviewAnnotationEffect(projection, Infinity, 2)).toThrow();
  });
});
