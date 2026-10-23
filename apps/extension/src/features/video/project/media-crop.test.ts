import { expect, it } from 'vitest';
import { parseMediaSourceCrop, uncropMediaSourceRect } from './media-crop';

it('copies only normalized source bounds and preserves finite subpixel extents', () => {
  const crop = Object.freeze({ x: 0.1, y: 0.2, width: 0.3, height: 0.4, extra: 'discard' });
  const parsed = parseMediaSourceCrop(crop);
  expect(parsed).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  expect(parsed).not.toBe(crop);
  expect(crop.extra).toBe('discard');
  expect(parseMediaSourceCrop({ x: 0, y: 0, width: 1, height: 1 })).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  expect(parseMediaSourceCrop({ x: 0, y: 0, width: 1e-300, height: 1e-300 })).not.toBeNull();
});
it.each([
  null,
  undefined,
  [],
  {},
  { x: '0', y: 0, width: 1, height: 1 },
  { x: 0, y: 0, width: null, height: 1 },
  { x: -0.1, y: 0, width: 1, height: 1 },
  { x: 0, y: -0.1, width: 1, height: 1 },
  { x: NaN, y: 0, width: 1, height: 1 },
  { x: 0, y: Infinity, width: 1, height: 1 },
  { x: 0, y: 0, width: Infinity, height: 1 },
  { x: 0, y: 0, width: 1, height: NaN },
  { x: 0, y: 0, width: 0, height: 1 },
  { x: 0, y: 0, width: 1, height: 0 },
  { x: 0, y: 0, width: -1, height: 1 },
  { x: 0.9, y: 0, width: 0.2, height: 1 },
  { x: 0, y: 0.9, width: 1, height: 0.2 },
  { x: 0, y: 0, width: Number.MIN_VALUE, height: 1 },
  { x: 0, y: 0, width: 1, height: Number.MIN_VALUE },
])('refuses malformed or unbounded source crop %j', (value) => {
  expect(parseMediaSourceCrop(value)).toBeNull();
});
it('recovers the original media rectangle in the visible coordinate units without changing inputs', () => {
  const visible = Object.freeze({ x: 100, y: 80, width: 300, height: 200 });
  const crop = Object.freeze({ x: 0.25, y: 0.2, width: 0.5, height: 0.4 });
  const source = uncropMediaSourceRect(visible, crop);
  expect(source).toEqual({ x: -50, y: -20, width: 600, height: 500 });
  expect({
    x: source.x + crop.x * source.width,
    y: source.y + crop.y * source.height,
    width: source.width * crop.width,
    height: source.height * crop.height,
  }).toEqual(visible);
  expect(uncropMediaSourceRect(visible, { x: 0, y: 0, width: 1, height: 1 })).toEqual(visible);
});
