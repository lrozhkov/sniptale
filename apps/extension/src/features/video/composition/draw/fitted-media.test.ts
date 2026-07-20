import { expect, it } from 'vitest';
import { mapFittedMediaFramePointToSource, mapSourcePointToFittedMediaFrame } from './fitted-media';

it('maps source cursor coordinates through contain, cover, stretch, and source-100 frames', () => {
  const frame = { height: 100, width: 100, x: 10, y: 20 };

  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'CONTAIN',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'COVER',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'STRETCH',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapFittedMediaFramePointToSource({
      fitMode: 'SOURCE_100',
      frame,
      point: { x: 60, y: 70 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 50, y: 25 });
});
