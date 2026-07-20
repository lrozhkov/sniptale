import { describe, expect, it, vi } from 'vitest';

import { createEditorControllerPublicApiAdapter } from './factory';

describe('editor controller public api adapter factory', () => {
  it('combines live view descriptors with methods and mutators', () => {
    const controller = {
      activeTool: 'select',
      browserFrameRenderToken: 0,
      canvas: { id: 'canvas' },
      canvasDocumentSize: { height: 20, width: 30 },
      commitHistory: vi.fn(),
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
      history: null,
      lastLayerSelectionAnchorId: null,
      layerMutationToken: 0,
      originalDocument: null,
      panSession: null,
      source: null,
      toolModeEnabled: true,
      viewportDevicePixelRatioBaseline: 1,
      withHistoryMuted: vi.fn((callback) => callback()),
      zoomLevel: 1,
    };

    const adapter = createEditorControllerPublicApiAdapter(controller as never);
    expect(adapter.canvas).toBe(controller.canvas);
    adapter.setZoomLevel(2);
    adapter.commitHistory();
    expect(adapter.zoomLevel).toBe(2);
    expect(controller.commitHistory).toHaveBeenCalledOnce();
  });
});
