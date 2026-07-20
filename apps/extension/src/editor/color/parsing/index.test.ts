import { describe, expect, it } from 'vitest';

import { extractBrowserVersion, parseRgbColor } from './';

describe('editor color parsing', () => {
  it('parses rgb and rgba colors without regex helpers', () => {
    expect(parseRgbColor('rgb(255, 103, 29)')).toEqual({
      red: 255,
      green: 103,
      blue: 29,
      alpha: null,
    });
    expect(parseRgbColor('rgba(255 103 29 / 0.4)')).toEqual({
      red: 255,
      green: 103,
      blue: 29,
      alpha: 0.4,
    });
  });

  it('extracts browser versions from user agents', () => {
    expect(extractBrowserVersion('Mozilla/5.0 Edg/122.0.1 Safari/537.36', 'Edg/')).toBe('122.0.1');
    expect(extractBrowserVersion('Mozilla/5.0 Chrome/132.0.0.0 Safari/537.36', 'Chrome/')).toBe(
      '132.0.0.0'
    );
    expect(extractBrowserVersion('Mozilla/5.0 Safari/537.36', 'Chrome/')).toBeNull();
  });
});
