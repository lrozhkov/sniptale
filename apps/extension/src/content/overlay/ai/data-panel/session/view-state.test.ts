import { describe, expect, it, vi } from 'vitest';

import { buildAIModalDataPanelViewState } from './view-state';

function createActions() {
  return {
    copyFormattedJson: vi.fn(),
    handleDataResizeStart: vi.fn(),
    handleJsonResizeStart: vi.fn(),
    handleToggleSpoiler: vi.fn(),
    toggleColumnExclusion: vi.fn(),
    toggleExpandAll: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleSelectAll: vi.fn(),
    toggleSelected: vi.fn(),
  };
}

function createBaseState() {
  return {
    copied: true,
    dataContainerRef: { current: null },
    excludedColumns: new Map([['table-1', ['Role']]]),
    isDataResizing: false,
    isDataSpoilerOpen: true,
    isJsonResizing: false,
    jsonPreviewRef: { current: null },
    setShowDataPreview: vi.fn(),
    showDataPreview: true,
    treeState: new Map([['node-1', { expanded: true, id: 'node-1', selected: true }]]),
  };
}

function createDerivedState() {
  return {
    formattedJSON: '{"name":"Alice"}',
    isAnyExpanded: true,
    isAnySelected: true,
    selectedData: '{"name":"Alice"}',
    spoilerSummary: 'All fields selected',
  };
}

describe('buildAIModalDataPanelViewState', () => {
  it('projects owner-local actions and state into the public data-panel state', () => {
    const actions = createActions();
    const base = createBaseState();
    const derived = createDerivedState();
    const state = buildAIModalDataPanelViewState({ actions, base, derived });

    expect(state).toMatchObject({
      copied: base.copied,
      copyFormattedJson: actions.copyFormattedJson,
      dataContainerRef: base.dataContainerRef,
      excludedColumns: base.excludedColumns,
      formattedJSON: derived.formattedJSON,
      handleDataResizeStart: actions.handleDataResizeStart,
      handleJsonResizeStart: actions.handleJsonResizeStart,
      handleToggleSpoiler: actions.handleToggleSpoiler,
      isAnyExpanded: derived.isAnyExpanded,
      isAnySelected: derived.isAnySelected,
      isDataResizing: base.isDataResizing,
      isDataSpoilerOpen: base.isDataSpoilerOpen,
      isJsonResizing: base.isJsonResizing,
      jsonPreviewRef: base.jsonPreviewRef,
      selectedData: derived.selectedData,
      setShowDataPreview: base.setShowDataPreview,
      showDataPreview: base.showDataPreview,
      spoilerSummary: derived.spoilerSummary,
      toggleColumnExclusion: actions.toggleColumnExclusion,
      toggleExpandAll: actions.toggleExpandAll,
      toggleExpanded: actions.toggleExpanded,
      toggleSelectAll: actions.toggleSelectAll,
      toggleSelected: actions.toggleSelected,
      treeState: base.treeState,
    });
    expect(state.getSummaryToneClass()).toBe('sniptale-ai-summary--info');
  });
});
