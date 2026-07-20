import { describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const actionBuilders = vi.hoisted(() => ({
  createToggleColumnExclusionHandler: vi.fn(() => 'exclude-column'),
  createToggleExpandedHandler: vi.fn(() => 'expand-one'),
  createToggleSelectedHandler: vi.fn(() => 'select-one'),
}));

vi.mock('../interactions/tree-node', () => actionBuilders);

import { createAIModalDataPanelTreeNodeActions } from './tree-node-actions';

function createBaseState() {
  return {
    dataContainerRef: { current: null },
    isDataSpoilerOpen: true,
    jsonPreviewRef: { current: null },
    setCopied: vi.fn(),
    setExcludedColumns: vi.fn(),
    setIsDataResizing: vi.fn(),
    setIsDataSpoilerOpen: vi.fn(),
    setIsJsonResizing: vi.fn(),
    setTreeState: vi.fn(),
  };
}

describe('createAIModalDataPanelTreeNodeActions', () => {
  it('projects canonical node-scoped tree actions', () => {
    const base = createBaseState();
    const treeData = { context: 'ctx', structure: [], title: 'title' } as ParsedDOMTree;

    expect(createAIModalDataPanelTreeNodeActions({ base, treeData })).toEqual({
      toggleColumnExclusion: 'exclude-column',
      toggleExpanded: 'expand-one',
      toggleSelected: 'select-one',
    });
    expect(actionBuilders.createToggleColumnExclusionHandler).toHaveBeenCalledWith(
      base.setExcludedColumns
    );
    expect(actionBuilders.createToggleExpandedHandler).toHaveBeenCalledWith(base.setTreeState);
    expect(actionBuilders.createToggleSelectedHandler).toHaveBeenCalledWith({
      setTreeState: base.setTreeState,
      treeData,
    });
  });
});
