import { expect, it } from 'vitest';
import { resolveVideoExportDimensions } from './output-dimensions';

it.each([
  [1904, 1064, '1080P', 1904, 1064],
  [3840, 2160, '1080P', 1920, 1080],
  [2560, 1080, '1080P', 1920, 810],
  [1080, 1920, '1080P', 606, 1080],
  [853, 479, '1080P', 852, 478],
  [1904, 1064, 'SOURCE', 1904, 1064],
  [1920, 1166, '1080P', 1778, 1080],
] as const)('fits %dx%d into %s without upscaling', (width, height, preset, w, h) => {
  expect(resolveVideoExportDimensions(width, height, preset)).toEqual({ width: w, height: h });
});
it('rejects invalid dimensions before computing an encoder profile', () => {
  expect(() => resolveVideoExportDimensions(NaN, 1080, '1080P')).toThrow();
});
