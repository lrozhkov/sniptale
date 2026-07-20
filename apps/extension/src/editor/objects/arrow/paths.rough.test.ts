import { describe, expect, it } from 'vitest';

import { buildArrowPathData } from './paths';

describe('arrow path rough switch', () => {
  it('routes filled arrows through rough rendering when sketch parameters are set', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
      ],
      {
        arrowType: 'sharp',
        bowing: 1,
        color: '#ff671d',
        dynamicWidth: false,
        endHead: 'triangle',
        mode: 'straight',
        opacity: 1,
        roughness: 1,
        shadow: 0,
        startHead: 'none',
        style: 'solid',
        variant: 'standard',
        width: 6,
      } as never
    );

    expect(path).toContain('M');
    expect(path).not.toContain('NaN');
  });
});
