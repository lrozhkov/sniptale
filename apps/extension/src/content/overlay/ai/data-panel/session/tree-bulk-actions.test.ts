import { describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const actionBuilders = vi.hoisted(() => ({
  createToggleExpandAllHandler: vi.fn(() => 'expand-all'),
  createToggleSelectAllHandler: vi.fn(() => 'select-all'),
}));

vi.mock('../interactions/tree-bulk', () => actionBuilders);

import { createAIModalDataPanelTreeBulkActions } from './tree-bulk-actions';

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

function createDerivedState() {
  return {
    formattedJSON: '{"name":"Alice"}',
    isAnyExpanded: true,
    isAnySelected: false,
  };
}

describe('createAIModalDataPanelTreeBulkActions', () => {
  it('projects canonical bulk tree actions', () => {
    const base = createBaseState();
    const derived = createDerivedState();
    const treeData = { context: 'ctx', structure: [], title: 'title' } as ParsedDOMTree;

    expect(createAIModalDataPanelTreeBulkActions({ base, derived, treeData })).toEqual({
      toggleExpandAll: 'expand-all',
      toggleSelectAll: 'select-all',
    });
    expect(actionBuilders.createToggleExpandAllHandler).toHaveBeenCalledWith({
      isAnyExpanded: derived.isAnyExpanded,
      setTreeState: base.setTreeState,
    });
    expect(actionBuilders.createToggleSelectAllHandler).toHaveBeenCalledWith({
      isAnySelected: derived.isAnySelected,
      setExcludedColumns: base.setExcludedColumns,
      setTreeState: base.setTreeState,
      treeData,
    });
  });
});
