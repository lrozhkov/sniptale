import { expect, it } from 'vitest';
import { createTrackProjection } from './track-projection';

it('aligns advanced clips and drag deltas with source footage across a cut and speed change', () => {
  const projection = createTrackProjection(10, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  expect(projection.position(2)).toBe(0.4);
  expect(projection.position(2, 'end')).toBe(0.2);
  expect(projection.position(3)).toBe(0.6);
  expect(projection.position(4)).toBe(0.8);
  expect(projection.output(3)).toBe(2);
  expect(projection.output(6)).toBe(3);
  expect(projection.delta(4, 200, 1000)).toBe(1);
  expect(projection.delta(1, 400, 1000)).toBe(1.5);
  expect(projection.cuts).toHaveLength(1);
});

it('handles leading/trailing cuts and clamps a drag outside the lane', () => {
  const projection = createTrackProjection(10, [
    { id: 'first', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
    { id: 'last', kind: 'cut', start: 8, end: 10, requestedStart: 8, requestedEnd: 10 },
  ]);
  expect(projection.source(0)).toBe(2);
  expect(projection.source(6, 'end')).toBe(8);
  expect(projection.output(-10)).toBe(0);
  expect(projection.output(20)).toBe(6);
});
