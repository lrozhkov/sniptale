import type { EditorTool } from '../../../../../features/editor/document/types';
import { createEditorRasterToolSession } from '../../../raster-tools/session/state';
import type { EditorControllerInstance } from '../../types';
import { createMockHistory } from '../test-fixtures-history';

export function createMockControllerState() {
  return Object.assign(
    createMockControllerElementState(),
    createMockControllerDocumentState(),
    createMockControllerInteractionState(),
    createMockControllerRuntimeState()
  );
}

function createMockControllerElementState() {
  return {
    canvas: { kind: 'canvas' } as unknown,
    viewportElement: { kind: 'viewport' } as unknown,
    stageElement: { kind: 'stage' } as unknown,
    viewportResizeObserver: null,
    viewportSyncFrame: 0,
    viewportDevicePixelRatioBaseline: 1,
  };
}

function createMockControllerDocumentState() {
  return {
    originalDocument: null,
    history: createMockHistory(),
    historyMuted: 0,
    canvasDocumentSize: { width: 10, height: 20 },
    browserFrameRenderToken: 0,
    layerMutationToken: 0,
    autosaveService: null,
  };
}

function createMockControllerInteractionState() {
  return {
    drawSession: null,
    cropGuide: null,
    cropSelection: null,
    source: null,
    activeTool: 'select' as EditorTool,
    toolModeEnabled: true,
    zoomLevel: 1,
    isSpacePressed: false,
    panSession: null,
    magnetManager: null,
    selectionNudgeSession: null,
    lastLayerSelectionAnchorId: null,
  };
}

function createMockControllerRuntimeState() {
  return {
    rasterToolSession: createEditorRasterToolSession(),
    eventHandlers: {} as EditorControllerInstance['eventHandlers'],
  };
}
