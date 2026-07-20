import { expect, it } from 'vitest';

import { createPage } from './fixtures.test-support.ts';
import { mapViewportPointToImageFrame, mapViewportRectToImageFrame } from './geometry';

const IMAGE_FRAME = { height: 720, width: 1152, x: 144, y: 90 };

it('maps click points into the displayed screenshot frame after scaling', () => {
  const point = mapViewportPointToImageFrame({ x: 720, y: 450 }, createPage(), IMAGE_FRAME);

  expect(point).toEqual({ x: 720, y: 450 });
});

it('maps target rects with padding and keeps tiny targets centered', () => {
  const frame = mapViewportRectToImageFrame(
    { height: 6, width: 10, x: 710, y: 440 },
    createPage(),
    IMAGE_FRAME,
    { bottom: 2, left: 4, right: 4, top: 2 }
  );

  expect(frame).toMatchObject({ height: 30, width: 30 });
  expect(frame!.x + frame!.width / 2).toBeCloseTo(716, 1);
  expect(frame!.y + frame!.height / 2).toBeCloseTo(444.4, 1);
});

it('clamps missing or out-of-range geometry instead of creating broken overlay frames', () => {
  expect(mapViewportRectToImageFrame(null, createPage(), IMAGE_FRAME)).toBeNull();
  const frame = mapViewportRectToImageFrame(
    { height: 80, width: 80, x: 1400, y: 870 },
    createPage(),
    IMAGE_FRAME
  );

  expect(frame?.x).toBeGreaterThanOrEqual(IMAGE_FRAME.x);
  expect(frame?.y).toBeGreaterThanOrEqual(IMAGE_FRAME.y);
  expect(frame!.x + frame!.width).toBeLessThanOrEqual(IMAGE_FRAME.x + IMAGE_FRAME.width);
  expect(frame!.y + frame!.height).toBeLessThanOrEqual(IMAGE_FRAME.y + IMAGE_FRAME.height);
});
