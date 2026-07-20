import { describe, expect, it } from 'vitest';
import { parseSvgPathData } from './path-data';

describe('SVG path data parser', () => {
  it('parses absolute and relative drawing commands into normalized commands', () => {
    expect(
      parseSvgPathData('M 1 2 h 3 v 4 l 5 6 q 1 2 3 4 c 1 2 3 4 5 6 a 2 3 0 1 0 9 9 z')
    ).toEqual([
      ['M', 1, 2],
      ['L', 4, 2],
      ['L', 4, 6],
      ['L', 9, 12],
      ['Q', 10, 14, 12, 16],
      ['C', 13, 18, 15, 20, 17, 22],
      ['A', 2, 3, 0, 1, 0, 26, 31],
      ['Z'],
    ]);
  });

  it('rejects malformed path data', () => {
    expect(parseSvgPathData('10 10')).toBeNull();
    expect(parseSvgPathData('M 0')).toBeNull();
  });
});
