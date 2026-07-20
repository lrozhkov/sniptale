import { describe, expect, it } from 'vitest';

import { getSelectionFlags } from './flags';

describe('getSelectionFlags', () => {
  it('detects selected and expanded nodes from tree state', () => {
    const treeState = new Map([
      ['section-1', { expanded: true, id: 'section-1', selected: false }],
      ['field-1', { expanded: false, id: 'field-1', selected: true }],
    ]);

    expect(getSelectionFlags(treeState)).toEqual({
      isAnyExpanded: true,
      isAnySelected: true,
    });
  });

  it('returns false flags when no nodes match', () => {
    expect(getSelectionFlags(new Map())).toEqual({
      isAnyExpanded: false,
      isAnySelected: false,
    });
  });
});
