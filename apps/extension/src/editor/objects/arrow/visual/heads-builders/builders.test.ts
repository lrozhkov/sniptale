import { describe, expect, it } from 'vitest';

import { buildBarArrowHeadPath } from './bar';
import { buildBlockArrowHeadPath } from './block';
import { buildOpenArrowHeadPath } from './open';
import { buildStandardArrowHeadPath } from './standard';

function readPathNumbers(path: string): number[] {
  return path
    .split(/[^0-9.+eE-]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

describe('arrow visual head builders owner', () => {
  it('keeps standard filled and outline builders anchored at the arrow tip', () => {
    const point = { x: 100, y: 20 };
    const triangle = buildStandardArrowHeadPath('triangle', point, 0, 12);
    const outline = buildStandardArrowHeadPath('triangle-outline', point, 0, 12);

    expect(Math.max(...readPathNumbers(triangle).filter((_, index) => index % 2 === 0))).toBe(100);
    expect(outline).toContain('M');
    expect(outline).toContain('Z');
  });

  it('builds role-specific open, block, and bar heads without routing through the catalog', () => {
    const point = { x: 40, y: 8 };

    expect(buildOpenArrowHeadPath(point, 0, 10)).toContain('Q');
    expect(buildBlockArrowHeadPath(point, 0, 10)).toContain('Q');
    expect(buildBarArrowHeadPath(point, 0, 10)).toContain('Z');
  });
});
