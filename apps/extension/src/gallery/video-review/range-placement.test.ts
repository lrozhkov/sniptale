import { expect, it } from 'vitest';
import { reviewRangePlacementIssue } from './range-placement';
const range = { kind: 'range' as const, start: 1, end: 3 };
it('distinguishes cut intersections, occupation, bounds and limits', () => {
  expect(reviewRangePlacementIssue({ range, edits: [], available: true })).toBeNull();
  expect(reviewRangePlacementIssue({ range, edits: [], available: false, occupied: true })).toBe(
    'occupied'
  );
  expect(reviewRangePlacementIssue({ range, edits: [], available: false, removesAll: true })).toBe(
    'whole-video'
  );
  expect(reviewRangePlacementIssue({ range, edits: [], available: false, limit: true })).toBe(
    'limit'
  );
  expect(reviewRangePlacementIssue({ range, edits: [], available: false })).toBe('invalid-range');
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  expect(reviewRangePlacementIssue({ range, edits: [cut], available: true })).toBe('cut');
  expect(
    reviewRangePlacementIssue({ range: { ...range, end: 2 }, edits: [cut], available: true })
  ).toBeNull();
  expect(
    reviewRangePlacementIssue({ range: { kind: 'point', time: 2 }, edits: [cut], available: false })
  ).toBeNull();
});
