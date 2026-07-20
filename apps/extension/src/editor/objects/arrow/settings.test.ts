import { Path } from 'fabric';
import { describe, expect, it } from 'vitest';

import type { ArrowPathInstance } from './controls.types';
import { readArrowSettings } from './settings';

describe('arrow settings reader', () => {
  it('normalizes persisted head size metadata', () => {
    const arrow = new Path('M 0 0 L 10 0') as ArrowPathInstance;
    arrow.sniptaleArrowEndHeadSize = 12;
    arrow.sniptaleArrowStartHeadSize = 4;

    expect(readArrowSettings(arrow)).toMatchObject({
      endHeadSize: 6,
      startHeadSize: 4,
    });
  });

  it('defaults legacy arrows to the baseline head size', () => {
    expect(readArrowSettings(new Path('M 0 0 L 10 0') as ArrowPathInstance)).toMatchObject({
      endHeadSize: 1,
      startHeadSize: 1,
    });
  });
});
