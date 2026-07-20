import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../features/editor/document/constants';
import { useEditorStore } from './useEditorStore';
import type { EditorState } from './types';
import { createResetDocumentState, createRuntimePatch } from './helpers';

const RESET_DEFAULTS = {
  initialSelection: {
    hasSelection: false,
    selectedObjectCount: 0,
    selectedObjectType: null,
    selectedObjectId: null,
    selectedObjectIds: [] as string[],
    selectedObjectWidth: null,
    selectedObjectHeight: null,
  },
  initialHistory: {
    canUndo: false,
    canRedo: false,
    index: 0,
    size: 1,
  },
  initialViewport: {
    zoomPercent: 100,
    canvasWidth: 0,
    canvasHeight: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceName: null,
    viewportWidth: 0,
    viewportHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scaledCanvasWidth: 0,
    scaledCanvasHeight: 0,
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
  },
};

function createToolSettings(baseState: EditorState): EditorState['toolSettings'] {
  return {
    ...baseState.toolSettings,
    pencil: { ...baseState.toolSettings.pencil, color: '#111111', width: 2 },
    highlighter: { ...baseState.toolSettings.highlighter, color: '#ffff00', width: 8 },
    rectangle: {
      ...baseState.toolSettings.rectangle,
      strokeColor: '#222222',
      fillColor: '#ffffff',
      strokeWidth: 4,
    },
    ellipse: {
      ...baseState.toolSettings.ellipse,
      strokeColor: '#226666',
      fillColor: '#eeeeee',
      strokeWidth: 3,
    },
    arrow: {
      ...baseState.toolSettings.arrow,
      color: '#333333',
      width: 3,
    },
    text: {
      ...baseState.toolSettings.text,
      textColor: '#444444',
      fontSize: 18,
      backgroundColor: 'transparent',
    },
    step: {
      ...baseState.toolSettings.step,
      color: '#555555',
      value: '5',
    },
  };
}

function createSelectionToolSettings(baseState: EditorState): EditorState['selectionToolSettings'] {
  return {
    ...baseState.selectionToolSettings,
    pencil: { ...baseState.selectionToolSettings.pencil, color: '#aaaaaa', width: 1 },
    highlighter: { ...baseState.selectionToolSettings.highlighter, color: '#bbbbbb', width: 6 },
    rectangle: {
      ...baseState.selectionToolSettings.rectangle,
      strokeColor: '#cccccc',
      fillColor: '#dddddd',
      strokeWidth: 2,
    },
    ellipse: {
      ...baseState.selectionToolSettings.ellipse,
      strokeColor: '#ccaaaa',
      fillColor: '#ddeeff',
      strokeWidth: 5,
    },
    arrow: {
      ...baseState.selectionToolSettings.arrow,
      color: '#eeeeee',
      width: 2,
    },
    text: {
      ...baseState.selectionToolSettings.text,
      textColor: '#999999',
      fontSize: 14,
      backgroundColor: 'transparent',
    },
    step: {
      ...baseState.selectionToolSettings.step,
      color: '#101010',
      value: '9',
    },
  };
}

function createEditorViewport(): EditorState['viewport'] {
  return {
    zoomPercent: 150,
    canvasWidth: 800,
    canvasHeight: 600,
    sourceWidth: 1600,
    sourceHeight: 1200,
    sourceName: 'capture.png',
    viewportWidth: 700,
    viewportHeight: 500,
    scrollLeft: 10,
    scrollTop: 20,
    scaledCanvasWidth: 1200,
    scaledCanvasHeight: 900,
    canvasOffsetLeft: 30,
    canvasOffsetTop: 40,
  };
}

function createEditorLayers(): EditorState['layers'] {
  return [
    {
      effectCount: 0,
      effects: [],
      id: 'layer-1',
      previewColor: '#ffffff',
      previewDataUrl: null,
      previewTransparent: false,
      raster: false,
      selectedCount: 1,
      type: 'rectangle',
      typeLabel: 'Rectangle',
      name: 'Rectangle 1',
      visible: true,
      locked: false,
      immutable: false,
      selected: true,
    },
  ];
}

function createEditorSelection(): EditorState['selection'] {
  return {
    hasSelection: true,
    selectedObjectCount: 1,
    selectedObjectType: 'rectangle',
    selectedObjectId: 'layer-1',
    selectedObjectIds: ['layer-1'],
    selectedObjectWidth: 120,
    selectedObjectHeight: 80,
  };
}

function createEditorState(): EditorState {
  const baseState = useEditorStore.getState();

  return {
    ...baseState,
    activeTool: 'text',
    inspector: 'tool',
    inspectorCollapsed: true,
    viewportPreviewOpen: true,
    viewportPreviewAutomationBlockedInSession: true,
    saveState: 'saved',
    sessionId: 'session-1',
    toolSettings: createToolSettings(baseState),
    selectionToolSettings: createSelectionToolSettings(baseState),
    imageData: 'data:image/png;base64,abc',
    pageTitle: 'Current title',
    cropReady: true,
    cropSelection: { height: 60, left: 10, top: 20, width: 100 },
    layers: createEditorLayers(),
    selection: createEditorSelection(),
    history: { canUndo: true, canRedo: true, index: 3, size: 5 },
    viewport: createEditorViewport(),
    frame: {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      browserMode: true,
      browserTitle: 'Frame title',
    },
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      enabled: true,
      url: 'https://sniptale.ai/page',
    },
    workspace: {
      ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
      backgroundColor: '#abcdef',
      gridEnabled: true,
    },
    workspaceDefaults: {
      backgroundColor: '#223344',
    },
    workspaceBackgroundEdited: true,
  };
}

describe('editor store reset helpers', () => {
  it('resets document state while preserving the current browser url', () => {
    const state = createEditorState();
    const resetState = createResetDocumentState(state, RESET_DEFAULTS);

    expect(resetState.inspector).toBe('file');
    expect(resetState.activeTool).toBe('select');
    expect(resetState.cropSelection).toBeNull();
    expect(resetState.selectionToolSettings).toBe(state.toolSettings);
    expect(resetState.browserFrame.url).toBe('https://sniptale.ai/page');
    expect(resetState.workspace).toEqual({
      ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
      backgroundColor: '#223344',
    });
    expect(resetState.workspaceBackgroundEdited).toBe(false);
    expect(resetState.frame).toEqual(DEFAULT_EDITOR_FRAME_SETTINGS);
  });

  it('keeps the session-scoped automation block out of document reset payloads', () => {
    const state = createEditorState();
    const resetState = createResetDocumentState(state, RESET_DEFAULTS);

    expect('viewportPreviewAutomationBlockedInSession' in resetState).toBe(false);
  });
});

describe('editor store runtime patch helpers', () => {
  it('applies runtime patches without dropping untouched editor state', () => {
    const state = createEditorState();

    const runtimePatch = createRuntimePatch(state, {
      history: {
        canUndo: true,
        canRedo: false,
        index: 4,
        size: 6,
      },
      frame: {
        ...state.frame,
        browserTitle: 'Normalized frame',
      },
    });

    expect(runtimePatch.layers).toBe(state.layers);
    expect(runtimePatch.selection).toBe(state.selection);
    expect(runtimePatch.viewport).toBe(state.viewport);
    expect(runtimePatch.history.canRedo).toBe(false);
    expect(runtimePatch.frame.browserTitle).toBe('Normalized frame');
    expect(runtimePatch.browserFrame).toBe(state.browserFrame);
  });
});
