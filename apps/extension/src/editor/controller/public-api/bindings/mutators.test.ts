import { describe, expect, it, vi } from 'vitest';

import { createEditorControllerPublicApiMutators } from './mutators';

describe('editor controller public api mutator bindings', () => {
  it('mutates controller state through public adapter setters', () => {
    const controller: {
      activeTool?: string;
      browserFrameRenderToken: number;
      canvasDocumentSize: { height: number; width: number };
      cropGuide?: unknown;
      lastLayerSelectionAnchorId?: string;
      layerMutationToken: number;
      toolModeEnabled: boolean;
      withHistoryMuted: (callback: () => unknown) => unknown;
    } = {
      browserFrameRenderToken: 0,
      canvasDocumentSize: { height: 1, width: 1 },
      layerMutationToken: 0,
      toolModeEnabled: false,
      withHistoryMuted: vi.fn((callback) => callback()),
    };

    const mutators = createEditorControllerPublicApiMutators(controller as never);
    mutators.setCanvasDocumentSize({ height: 20, width: 30 });
    mutators.setActiveTool('text');
    mutators.setCropState({ id: 'guide' } as never, { left: 1 } as never);
    mutators.setLastLayerSelectionAnchorId('layer-1');

    expect(controller.canvasDocumentSize).toEqual({ height: 20, width: 30 });
    expect(controller.activeTool).toBe('text');
    expect(controller.toolModeEnabled).toBe(true);
    expect(controller.cropGuide).toEqual({ id: 'guide' });
    expect(controller.lastLayerSelectionAnchorId).toBe('layer-1');
    expect(mutators.createLayerMutationToken()).toBe(1);
    expect(mutators.isLayerMutationTokenCurrent(1)).toBe(true);
  });
});
