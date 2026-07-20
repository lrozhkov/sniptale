import { expect, it } from 'vitest';
import {
  addVideoSceneGradientStop,
  createVideoSceneGradientColorStopColor,
  createVideoSceneGradientCssStops,
  normalizeVideoSceneGradientStops,
  removeVideoSceneGradientStop,
  reverseVideoSceneGradientStops,
  updateVideoSceneGradientStop,
} from './gradient-stops';

it('normalizes video scene gradient stops with legacy endpoint fallback', () => {
  expect(normalizeVideoSceneGradientStops(null, '#111111', '#222222')).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#222222', offset: 1 },
  ]);
  expect(
    normalizeVideoSceneGradientStops(
      [
        { color: '#333333', offset: 1 },
        { color: '#111111', offset: 0 },
        { color: '#222222', offset: 0.5, opacity: 0.4 },
      ],
      '#000000',
      '#ffffff'
    )
  ).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#222222', offset: 0.5, opacity: 0.4 },
    { color: '#333333', offset: 1 },
  ]);
});

it('edits video scene gradient stops as an ordered N-stop model', () => {
  const stops = [
    { color: '#111111', offset: 0 },
    { color: '#333333', offset: 1 },
  ];

  const added = addVideoSceneGradientStop(stops, 0);
  expect(added).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#111111', offset: 0.5 },
    { color: '#333333', offset: 1 },
  ]);
  expect(updateVideoSceneGradientStop(added, 1, { color: '#f97316', opacity: 0.5 })).toContainEqual(
    { color: '#f97316', offset: 0.5, opacity: 0.5 }
  );
  expect(updateVideoSceneGradientStop(added, 1, { color: '#f97316' })).toContainEqual({
    color: '#f97316',
    offset: 0.5,
  });
  expect(reverseVideoSceneGradientStops(added).map((stop) => stop.offset)).toEqual([0, 0.5, 1]);
  expect(removeVideoSceneGradientStop(added, 1)).toEqual(stops);
  expect(removeVideoSceneGradientStop(stops, 0)).toEqual(stops);
});

it('creates CSS stops with opacity and animated range offsets', () => {
  expect(
    createVideoSceneGradientCssStops(
      [
        { color: '#111111', offset: 0 },
        { color: '#f97316', offset: 0.5, opacity: 0.5 },
        { color: '#ffffff', offset: 1 },
      ],
      { fromStop: 10, toStop: 90 }
    )
  ).toBe('#111111 10%, rgba(249, 115, 22, 0.5) 50%, #ffffff 90%');
});

it('clamps malformed stop offsets and opacity without losing fallback colors', () => {
  const stops = normalizeVideoSceneGradientStops(
    [
      { color: '#111111', offset: Number.NaN },
      { color: '#222222', offset: 2, opacity: Number.NaN },
      { color: '', offset: 0.5 },
    ],
    '#000000',
    '#ffffff'
  );

  expect(stops).toEqual([
    { color: '#111111', offset: 0 },
    { color: '#222222', offset: 1, opacity: 1 },
  ]);
  expect(updateVideoSceneGradientStop(stops, 1, { offset: -1, opacity: 2 })).toContainEqual({
    color: '#222222',
    offset: 0,
    opacity: 1,
  });
});

it('keeps non-hex and transparent stop colors stable when applying opacity', () => {
  expect(
    createVideoSceneGradientColorStopColor({ color: 'transparent', offset: 0, opacity: 0.5 })
  ).toBe('transparent');
  expect(
    createVideoSceneGradientColorStopColor({ color: 'var(--accent)', offset: 0, opacity: 0.5 })
  ).toBe('var(--accent)');
});
