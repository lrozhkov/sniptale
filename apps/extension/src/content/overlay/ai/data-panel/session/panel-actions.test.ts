import { describe, expect, it, vi } from 'vitest';

const actionBuilders = vi.hoisted(() => ({
  createCopyFormattedJsonHandler: vi.fn(() => 'copy'),
  createDataResizeStartHandler: vi.fn(() => 'resize-data'),
  createJsonResizeStartHandler: vi.fn(() => 'resize-json'),
  createToggleSpoilerHandler: vi.fn(() => 'toggle-spoiler'),
}));

vi.mock('../interactions/panel', () => actionBuilders);

import { createAIModalDataPanelPanelActions } from './panel-actions';

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

describe('createAIModalDataPanelPanelActions', () => {
  it('projects copy, resize, and spoiler state into panel action owners', () => {
    const base = createBaseState();
    const derived = createDerivedState();

    expect(createAIModalDataPanelPanelActions({ base, derived })).toEqual({
      copyFormattedJson: 'copy',
      handleDataResizeStart: 'resize-data',
      handleJsonResizeStart: 'resize-json',
      handleToggleSpoiler: 'toggle-spoiler',
    });
    expect(actionBuilders.createCopyFormattedJsonHandler).toHaveBeenCalledWith({
      formattedJSON: derived.formattedJSON,
      setCopied: base.setCopied,
    });
    expect(actionBuilders.createDataResizeStartHandler).toHaveBeenCalledWith({
      dataContainerRef: base.dataContainerRef,
      setIsDataResizing: base.setIsDataResizing,
    });
    expect(actionBuilders.createJsonResizeStartHandler).toHaveBeenCalledWith({
      jsonPreviewRef: base.jsonPreviewRef,
      setIsJsonResizing: base.setIsJsonResizing,
    });
    expect(actionBuilders.createToggleSpoilerHandler).toHaveBeenCalledWith(
      base.isDataSpoilerOpen,
      base.setIsDataSpoilerOpen
    );
  });
});
