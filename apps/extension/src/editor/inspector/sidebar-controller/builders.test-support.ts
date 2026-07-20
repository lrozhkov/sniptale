import { vi } from 'vitest';

export function createStoreSlice() {
  return {
    activeTool: 'select',
    browserFrame: { id: 'browser' },
    cropReady: false,
    frame: { id: 'frame' },
    inspector: 'tool',
    layers: [
      {
        effectCount: 0,
        effects: [],
        id: 'vector-layer',
        locked: false,
        name: 'Vector Layer',
        previewColor: '#ffffff',
        previewDataUrl: null,
        previewTransparent: false,
        raster: false,
        selected: false,
        selectedCount: 1,
        type: 'rectangle',
        typeLabel: 'Rectangle',
        visible: true,
      },
    ],
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectHeight: null,
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedObjectType: null,
      selectedObjectWidth: null,
    },
    selectionToolSettings: { id: 'selection-settings' },
    setActiveTool: vi.fn(),
    syncActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    toolSettings: { id: 'tool-settings' },
    viewport: { canvasHeight: 600, canvasWidth: 800, sourceHeight: 300, sourceWidth: 400 },
    workspace: { id: 'workspace' },
  };
}

export function createController() {
  return {
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    applyFrameSettings: vi.fn(),
    closeDocument: vi.fn(),
    previewLayerEffect: vi.fn(),
    removeLayerEffect: vi.fn(),
    resetLayerEffectPreview: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    selectLayer: vi.fn(),
    setActiveTool: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    withHistoryMuted: vi.fn(<T>(callback: () => T) => callback()),
  };
}
