import { expect, it } from 'vitest';
import { reviewEditEdgeLimits } from './edit-range';
import type { ReviewEdit } from './types';

const edit: ReviewEdit = {
  id: 'c',
  kind: 'cut',
  start: 2,
  end: 6,
  requestedStart: 2,
  requestedEnd: 6,
};
it('excludes neighbouring edits and keeps an ordered nonempty interval', () => {
  const edits = [edit, { ...edit, id: 'next', start: 7, end: 9 }];
  expect(reviewEditEdgeLimits({ edit, edits, edge: 'end', duration: 10 })).toMatchObject({
    min: 2.01,
    max: 7,
  });
  expect(reviewEditEdgeLimits({ edit, edits, edge: 'start', duration: 10 })).toMatchObject({
    min: 0,
    max: 5.99,
  });
});
it('uses real irregular keyframes and excludes an empty or fully removed video', () => {
  const range = { ...edit, start: 1, end: 10 };
  expect(
    reviewEditEdgeLimits({
      edit: range,
      edits: [range],
      edge: 'start',
      duration: 10,
      boundaries: [0, 1, 2.3, 5.1, 10],
    }).values
  ).toEqual([1, 2.3, 5.1]);
  expect(
    reviewEditEdgeLimits({ edit: range, edits: [range], edge: 'start', duration: 10 }).min
  ).toBeCloseTo(0.01);
});
