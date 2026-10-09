import { expect, it } from 'vitest';
import { buildReviewTimeMap } from './timeline';
import { packReviewTextRows, projectReviewTextFragment } from './text-projection';
import type { ReviewTextFragment } from './text-document';

const fragment: ReviewTextFragment = {
  id: 'text',
  start: 2,
  end: 8,
  text: 'Text',
  originalText: '',
  revision: 0,
  timingRevision: 0,
  alignment: 'manual',
  timeDomain: 'source',
  showInVideo: true,
};

it('projects source anchors through Cut/Speed exactly once and keeps manual result anchors fixed', () => {
  const map = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 8,
      requestedStart: 6,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  expect(projectReviewTextFragment(fragment, map)).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ],
  });
  expect(projectReviewTextFragment({ ...fragment, timeDomain: 'result' }, map)).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [{ start: 2, end: 7 }],
  });
  expect(projectReviewTextFragment({ ...fragment, start: 4, end: 6 }, map).ranges).toEqual([]);
  expect(projectReviewTextFragment({ ...fragment, start: 8, end: 12 }, map).partiallyExcluded).toBe(
    true
  );
});

it('packs all overlaps without a row limit and reuses an ended row at a touching boundary', () => {
  const intervals = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    start: i * 0.1,
    end: 4,
  }));
  const rows = packReviewTextRows([...intervals, { id: 'next', start: 4, end: 5 }]);
  expect(new Set(intervals.map((entry) => rows.get(entry.id))).size).toBe(8);
  expect(rows.get('next')).toBe(0);
  expect(packReviewTextRows([...intervals].reverse())).toEqual(packReviewTextRows(intervals));
});
