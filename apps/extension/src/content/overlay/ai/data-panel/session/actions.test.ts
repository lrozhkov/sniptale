import { describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const actionBuilders = vi.hoisted(() => ({
  createAIModalDataPanelPanelActions: vi.fn(() => ({
    copyFormattedJson: 'copy',
    handleDataResizeStart: 'resize-data',
    handleJsonResizeStart: 'resize-json',
    handleToggleSpoiler: 'toggle-spoiler',
  })),
  createAIModalDataPanelTreeActions: vi.fn(() => ({
    toggleColumnExclusion: 'exclude-column',
    toggleExpandAll: 'expand-all',
    toggleExpanded: 'expand-one',
    toggleSelected: 'select-one',
    toggleSelectAll: 'select-all',
  })),
}));

vi.mock('./panel-actions', () => ({
  createAIModalDataPanelPanelActions: actionBuilders.createAIModalDataPanelPanelActions,
}));

vi.mock('./tree-actions', () => ({
  createAIModalDataPanelTreeActions: actionBuilders.createAIModalDataPanelTreeActions,
}));

import { createAIModalDataPanelActions } from './actions';

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

describe('createAIModalDataPanelActions', () => {
  it('projects data-panel base and derived state into canonical action owners', () => {
    const base = createBaseState();
    const derived = createDerivedState();
    const treeData = { context: 'ctx', structure: [], title: 'title' } as ParsedDOMTree;

    expect(createAIModalDataPanelActions({ base, derived, treeData })).toEqual({
      copyFormattedJson: 'copy',
      handleDataResizeStart: 'resize-data',
      handleJsonResizeStart: 'resize-json',
      handleToggleSpoiler: 'toggle-spoiler',
      toggleColumnExclusion: 'exclude-column',
      toggleExpandAll: 'expand-all',
      toggleExpanded: 'expand-one',
      toggleSelectAll: 'select-all',
      toggleSelected: 'select-one',
    });
    expect(actionBuilders.createAIModalDataPanelPanelActions).toHaveBeenCalledWith({
      base,
      derived,
    });
    expect(actionBuilders.createAIModalDataPanelTreeActions).toHaveBeenCalledWith({
      base,
      derived,
      treeData,
    });
  });
});
