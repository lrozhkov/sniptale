import { describe, expect, it } from 'vitest';

import { TRANSPARENT_COLOR } from '../../document/model';
import { buildUniqueColorList, normalizeHexColor, resolvePreviewColor } from './helpers';

describe('editor color control helpers', () => {
  it('normalizes hex and rgb color input variants', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor(TRANSPARENT_COLOR)).toBe(TRANSPARENT_COLOR);
    expect(normalizeHexColor(' rgb(255, 0, 170) ')).toBe('#ff00aa');
    expect(normalizeHexColor('rgba(255, 0, 170, 0)')).toBe(TRANSPARENT_COLOR);
    expect(normalizeHexColor('abc')).toBe('#aabbcc');
    expect(normalizeHexColor('#A1B2C3')).toBe('#a1b2c3');
    expect(normalizeHexColor('#11223300')).toBe(TRANSPARENT_COLOR);
    expect(normalizeHexColor('#112233ff')).toBe('#112233');
    expect(normalizeHexColor('broken')).toBeNull();
  });

  it('falls back for transparent and invalid preview colors', () => {
    expect(resolvePreviewColor('#123456')).toBe('#123456');
    expect(resolvePreviewColor(TRANSPARENT_COLOR, '#abcdef')).toBe('#abcdef');
    expect(resolvePreviewColor('broken', '#fedcba')).toBe('#fedcba');
  });

  it('builds a bounded unique color list from normalized non-transparent colors', () => {
    expect(
      buildUniqueColorList(
        ['#123456', '#123456', 'abc', TRANSPARENT_COLOR, 'rgba(0,0,0,0)', '#654321'],
        2
      )
    ).toEqual(['#123456', '#aabbcc']);
  });
});
