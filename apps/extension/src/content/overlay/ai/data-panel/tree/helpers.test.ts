import { describe, expect, it } from 'vitest';
import { getDefaultTreeNodeState } from './helpers';

describe('ai modal data panel tree helpers', () => {
  it('falls back to an expanded default state when the node is absent', () => {
    const state = getDefaultTreeNodeState('node-1', true, {
      excludedColumns: new Map(),
      toggleColumnExclusion: () => undefined,
      toggleExpanded: () => undefined,
      toggleSelected: () => undefined,
      treeState: new Map(),
    });

    expect(state).toEqual({
      id: 'node-1',
      expanded: true,
      selected: true,
    });
  });
});
