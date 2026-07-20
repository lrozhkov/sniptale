import { describe, expect, it } from 'vitest';
import { resolveRangeVisualStyle } from './style';

describe('range visual style', () => {
  it('derives and clamps the fill ratio while preserving caller styles', () => {
    expect(resolveRangeVisualStyle({ min: 10, max: 30, value: 15, style: { width: 80 } })).toEqual({
      '--sniptale-range-fill-ratio': '25%',
      width: 80,
    });
    expect(resolveRangeVisualStyle({ min: 10, max: 30, value: 100 })).toMatchObject({
      '--sniptale-range-fill-ratio': '100%',
    });
  });

  it('uses safe defaults for missing, invalid, and non-finite bounds', () => {
    expect(resolveRangeVisualStyle({ defaultValue: '20' })).toMatchObject({
      '--sniptale-range-fill-ratio': '20%',
    });
    expect(resolveRangeVisualStyle({ max: 10, min: 10, value: 25 })).toMatchObject({
      '--sniptale-range-fill-ratio': '25%',
    });
    expect(resolveRangeVisualStyle({ max: Number.NaN, value: 'bad' })).toMatchObject({
      '--sniptale-range-fill-ratio': '0%',
    });
  });
});
