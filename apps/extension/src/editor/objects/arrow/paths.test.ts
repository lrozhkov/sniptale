import { describe, expect, it } from 'vitest';

import { buildArrowPathData } from './paths';

const points = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
];

const settings = {
  color: '#f97316',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 1,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 6,
} as const;

describe('buildArrowPathData', () => {
  it('routes rough standard arrows through the rough path builder', () => {
    const roughPath = buildArrowPathData(points, { ...settings, roughness: 1 } as never);
    const filledPath = buildArrowPathData(points, settings as never);

    expect(roughPath).not.toBe('');
    expect(roughPath).not.toBe(filledPath);
  });
});
