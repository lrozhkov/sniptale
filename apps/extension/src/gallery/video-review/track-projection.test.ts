import { expect, it } from 'vitest';
import {
  createTrackProjection,
  reviewAudioClipRows,
  reviewTimelineNavigationBounds,
} from './track-projection';

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
  expect(
    reviewTimelineNavigationBounds(10, [
      { id: 'first', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
      { id: 'last', kind: 'cut', start: 8, end: 10, requestedStart: 8, requestedEnd: 10 },
    ])
  ).toEqual({ start: 2, end: 8 });
  expect(reviewTimelineNavigationBounds(10, [])).toEqual({ start: 0, end: 10 });
});

it('keeps the focus gesture clock independent of cuts and speed', () => {
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
  expect(projection.focus.resultDuration).toBe(10);
  expect(projection.focus.delta(1, 400, 1000)).toBe(4);
  expect(projection.focus.source(projection.focus.output(3))).toBe(3);
  expect(projection.focus.source(projection.focus.output(6))).toBe(6);
  expect(projection.resultDuration).toBe(6);
});

it('reuses rows for touching clips and gives every simultaneous voice a separate row', () => {
  const ranges = [
    { id: 'a', start: 1, end: 4 },
    { id: 'b', start: 1, end: 3 },
    { id: 'c', start: 2, end: 5 },
    { id: 'd', start: 4, end: 6 },
  ];
  expect([...reviewAudioClipRows(ranges)]).toEqual([
    ['a', 0],
    ['b', 1],
    ['c', 2],
    ['d', 0],
  ]);
  expect(reviewAudioClipRows([...ranges].reverse())).toEqual(reviewAudioClipRows(ranges));
});

it('keeps music sample coverage continuous around multiple cuts and speed boundaries', () => {
  const projection = createTrackProjection(20, [
    { id: 'c1', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    { id: 'c2', kind: 'cut', start: 12, end: 14, requestedStart: 12, requestedEnd: 14 },
    {
      id: 's',
      kind: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const pieces = projection.slices(1, 12);
  expect(pieces[0]).toMatchObject({ start: 1, end: 2, sourceStart: 1, sourceEnd: 2 });
  expect(pieces.at(-1)).toMatchObject({ end: 12, sourceEnd: 18 });
  expect(pieces.reduce((sum, piece) => sum + piece.end - piece.start, 0)).toBe(11);
  pieces.slice(1).forEach((piece, index) => expect(piece.start).toBe(pieces[index]!.end));
});

it('does not split music at a decimal Speed endpoint', () => {
  const projection = createTrackProjection(12.008, [
    {
      id: 's',
      kind: 'speed',
      start: 2.00001,
      end: 8.000003333333334,
      requestedStart: 2.00001,
      requestedEnd: 8.000003333333334,
      rate: 2,
      audio: 'speed',
    },
    {
      id: 'c',
      kind: 'cut',
      start: 3.002,
      end: 4.0026667,
      requestedStart: 3.002,
      requestedEnd: 4.0026667,
    },
  ]);
  expect(projection.slices(0, 5.1)).toHaveLength(2);
});
