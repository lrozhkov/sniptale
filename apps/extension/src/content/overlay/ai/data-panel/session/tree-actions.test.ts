import { describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const actionBuilders = vi.hoisted(() => ({
  createAIModalDataPanelTreeBulkActions: vi.fn(() => ({
    toggleExpandAll: 'expand-all',
    toggleSelectAll: 'select-all',
  })),
  createAIModalDataPanelTreeNodeActions: vi.fn(() => ({
    toggleColumnExclusion: 'exclude-column',
    toggleExpanded: 'expand-one',
    toggleSelected: 'select-one',
  })),
}));

vi.mock('./tree-bulk-actions', () => ({
  createAIModalDataPanelTreeBulkActions: actionBuilders.createAIModalDataPanelTreeBulkActions,
}));

vi.mock('./tree-node-actions', () => ({
  createAIModalDataPanelTreeNodeActions: actionBuilders.createAIModalDataPanelTreeNodeActions,
}));

import { createAIModalDataPanelTreeActions } from './tree-actions';

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

describe('createAIModalDataPanelTreeActions', () => {
  it('projects tree bulk and node state into canonical tree action owners', () => {
    const base = createBaseState();
    const derived = createDerivedState();
    const treeData = { context: 'ctx', structure: [], title: 'title' } as ParsedDOMTree;

    expect(createAIModalDataPanelTreeActions({ base, derived, treeData })).toEqual({
      toggleColumnExclusion: 'exclude-column',
      toggleExpandAll: 'expand-all',
      toggleExpanded: 'expand-one',
      toggleSelectAll: 'select-all',
      toggleSelected: 'select-one',
    });
    expect(actionBuilders.createAIModalDataPanelTreeNodeActions).toHaveBeenCalledWith({
      base,
      treeData,
    });
    expect(actionBuilders.createAIModalDataPanelTreeBulkActions).toHaveBeenCalledWith({
      base,
      derived,
      treeData,
    });
  });
});
