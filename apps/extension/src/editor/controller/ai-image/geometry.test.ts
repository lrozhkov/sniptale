import { describe, expect, it } from 'vitest';
import {
  integerImageBounds,
  imageContextBounds,
  imageResultCrop,
  imageRasterRegion,
  padImageBounds,
} from './geometry';

describe('AI document pixel geometry', () => {
  it('rounds outward so that fractional or negative selected pixels remain included', () => {
    expect(integerImageBounds({ left: -1.2, top: 2.4, width: 10.5, height: 20.2 })).toEqual({
      left: -2,
      top: 2,
      width: 12,
      height: 21,
    });
  });
  it('adds bounded context without scaling and retains the exact target offset', () => {
    const target = { left: 10, top: 20, width: 80, height: 40 };
    const input = imageContextBounds(
      target,
      { left: 0, top: 0, width: 1920, height: 1080 },
      'surroundings'
    );
    expect(input).toEqual({ left: 0, top: 0, width: 122, height: 92 });
    expect(imageResultCrop(input, target, input, false)).toEqual(target);
    expect(imageContextBounds(target, input, 'region')).toEqual(target);
  });
  it('rejects silent resampling and permits only explicit fit mapping', () => {
    const input = { left: 100, top: 200, width: 100, height: 80 };
    const target = { left: 120, top: 210, width: 20, height: 20 };
    expect(() => imageResultCrop(input, target, { width: 200, height: 160 }, false)).toThrow(
      'size-mismatch'
    );
    expect(imageResultCrop(input, target, { width: 200, height: 160 }, true)).toEqual({
      left: 40,
      top: 20,
      width: 40,
      height: 40,
    });
  });
  it('refuses invalid geometry or allocations beyond the shared image budget', () => {
    expect(() => integerImageBounds({ left: 0, top: 0, width: 8192, height: 8192 })).toThrow(
      'too-large'
    );
    expect(() => integerImageBounds({ left: NaN, top: 0, width: 20, height: 20 })).toThrow(
      'invalid-region'
    );
  });
});

it('pads an odd-sized native target with integer margins and crops back without resampling', () => {
  const target = { left: 10, top: 20, width: 437, height: 183 };
  const padded = padImageBounds(target, { width: 768, height: 768 });
  expect(padded).toEqual({ left: -155, top: -272, width: 768, height: 768 });
  expect(imageResultCrop(padded, target, padded, false)).toEqual({
    left: 165,
    top: 292,
    width: 437,
    height: 183,
  });
  expect(() =>
    padImageBounds({ left: 0, top: 0, width: 100, height: 300 }, { width: 256, height: 256 })
  ).toThrow('output-too-small');
});

it('maps a selected region into the current result raster rather than using document dimensions', () => {
  expect(
    imageRasterRegion(
      { left: 10, top: 20, width: 20, height: 40 },
      { left: 10, top: 20, width: 20, height: 40 },
      { width: 768, height: 768 }
    )
  ).toEqual({ left: 0, top: 0, width: 768, height: 768 });
  expect(
    imageRasterRegion(
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 25, top: 50, width: 25, height: 25 },
      { width: 20, height: 20 }
    )
  ).toEqual({ left: 5, top: 10, width: 5, height: 5 });
});
