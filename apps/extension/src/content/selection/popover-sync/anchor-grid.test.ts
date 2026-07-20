import { describe, expect, it } from 'vitest';

import { DEFAULT_POPOVER_ANCHOR_GRID, getAnchorDotPosition } from './anchor-grid';

describe('popover anchor grid helpers', () => {
  it('keeps the shared anchor grid in the expected three-by-three order', () => {
    expect(DEFAULT_POPOVER_ANCHOR_GRID).toEqual([
      ['top-left', 'top-center', 'top-right'],
      ['middle-left', 'center', 'middle-right'],
      ['bottom-left', 'bottom-center', 'bottom-right'],
    ]);
  });

  it('returns centered transform styles for center anchors', () => {
    expect(getAnchorDotPosition('center')).toMatchObject({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    });
    expect(getAnchorDotPosition('bottom-center')).toMatchObject({
      bottom: 5,
      left: '50%',
      transform: 'translate(-50%, 0)',
    });
  });
});
