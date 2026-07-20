import { describe, expect, it } from 'vitest';

import { getArrowInteractionAppearance } from './';

const standardSettings = {
  color: '#ff671d',
  endHead: 'triangle' as const,
  mode: 'straight' as const,
  opacity: 1,
  shadow: 0,
  startHead: 'none' as const,
  variant: 'standard' as const,
  width: 4,
};

describe('arrow interaction appearance', () => {
  it('keeps standard-arrow interaction styling and aligns block arrows to arrow-native selection', () => {
    expect(getArrowInteractionAppearance(standardSettings)).toMatchObject({
      cornerStyle: 'circle',
      hasBorders: false,
      hoverCursor: 'pointer',
      lockScaling: true,
    });
    expect(
      getArrowInteractionAppearance({
        ...standardSettings,
        variant: 'tapered',
      })
    ).toMatchObject({
      cornerStyle: 'circle',
      hasBorders: false,
      hoverCursor: 'pointer',
      lockScaling: true,
    });
  });
});
