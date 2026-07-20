import { describe, expect, it } from 'vitest';

import { buildRoughArrowPathData, shouldRenderRoughArrow } from './rough';

const settings = {
  arrowType: 'sharp',
  color: '#ff671d',
  dynamicWidth: false,
  endHead: 'triangle',
  mode: 'straight',
  opacity: 0.8,
  shadow: 0,
  startHead: 'none',
  style: 'solid',
  variant: 'standard',
  width: 6,
} as const;

describe('arrow rough rendering', () => {
  it('uses rough rendering when roughness or bowing is configured', () => {
    expect(shouldRenderRoughArrow(settings as never)).toBe(false);
    expect(shouldRenderRoughArrow({ ...settings, roughness: 1 } as never)).toBe(true);
    expect(shouldRenderRoughArrow({ ...settings, bowing: 1 } as never)).toBe(true);
    expect(buildRoughArrowPathData([], { ...settings, roughness: 1 } as never)).toBe('');
    expect(
      buildRoughArrowPathData(
        [
          { x: 0, y: 0 },
          { x: 48, y: 0 },
        ],
        {
          ...settings,
          bowing: 1,
          roughness: 1,
        } as never
      )
    ).toContain('M');
  });
});
