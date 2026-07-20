import { describe, expect, it } from 'vitest';

import { createEditorControllerPublicApiView } from './view';

type PublicApiViewTestController = {
  activeTool: string;
  canvas: { id: string };
  canvasDocumentSize: { height: number; width: number };
  cropGuide: unknown;
  cropSelection: unknown;
  drawSession: unknown;
  history: unknown;
  lastLayerSelectionAnchorId: string | null;
  layerMutationToken: number;
  originalDocument: unknown;
  panSession: unknown;
  source: unknown;
  viewportDevicePixelRatioBaseline: number;
  zoomLevel: number;
};

function createController(): PublicApiViewTestController {
  return {
    activeTool: 'select',
    canvas: { id: 'canvas-1' },
    canvasDocumentSize: { height: 20, width: 30 },
    cropGuide: null,
    cropSelection: null,
    drawSession: null,
    history: null,
    lastLayerSelectionAnchorId: null,
    layerMutationToken: 1,
    originalDocument: null,
    panSession: null,
    source: null,
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 1,
  };
}

function registerViewGetterTest() {
  it('keeps public adapter view properties live against controller state', () => {
    const controller = createController();
    const view = createEditorControllerPublicApiView(controller as never);

    expect(view.canvas).toBe(controller.canvas);
    expect(view.source).toBeNull();
    expect(view.originalDocument).toBeNull();
    expect(view.history).toBeNull();
    expect(view.viewportDevicePixelRatioBaseline).toBe(1);
    expect(view.canvasDocumentSize).toEqual({ height: 20, width: 30 });
    expect(view.drawSession).toBeNull();
    expect(view.cropGuide).toBeNull();
    expect(view.cropSelection).toBeNull();
    expect(view.panSession).toBeNull();
    expect(view.activeTool).toBe('select');
    expect(view.layerMutationToken).toBe(1);
    controller.zoomLevel = 2;
    controller.lastLayerSelectionAnchorId = 'layer-1';
    expect(view.zoomLevel).toBe(2);
    expect(view.lastLayerSelectionAnchorId).toBe('layer-1');
  });
}

describe('editor controller public api live view bindings', registerViewGetterTest);
