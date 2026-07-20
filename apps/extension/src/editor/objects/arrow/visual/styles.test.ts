import { describe, expect, it } from 'vitest';

import { trimPolyline } from './primitives';
import { buildShaftOutlinePath } from './styles';

describe('arrow visual styles', () => {
  it('handles incomplete shaft geometry defensively', () => {
    expect(buildShaftOutlinePath([], 6)).toContain('Z');
    expect(
      buildShaftOutlinePath(
        [
          { x: 4, y: 4 },
          { x: 4, y: 4 },
        ],
        6
      )
    ).not.toContain('NaN');
  });

  it('trims end insets along the existing polyline instead of flipping the final segment', () => {
    const trimmed = trimPolyline(
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 13, y: 1 },
      ],
      0,
      4
    );

    expect(trimmed).toEqual([
      { x: 0, y: 0 },
      { x: 9.414213562373096, y: 0 },
    ]);
  });
});
