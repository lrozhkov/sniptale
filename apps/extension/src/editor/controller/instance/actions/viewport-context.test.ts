import { expect, it, vi } from 'vitest';
import { createViewportPresentationContext } from './viewport-context';

it('creates viewport presentation context from controller state and bound sync callbacks', () => {
  const controller = {
    canvas: { id: 'canvas' },
    canvasDocumentSize: { width: 800, height: 600 },
    stageElement: { id: 'stage' },
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewportDevicePixelRatioBaseline: 2,
    viewportElement: { id: 'viewport' },
    zoomLevel: 1.25,
  };

  const context = createViewportPresentationContext(controller as never);
  context.syncViewportState();
  context.syncRuntimeState();

  expect(context).toMatchObject({
    canvas: controller.canvas,
    canvasDocumentSize: { width: 800, height: 600 },
    devicePixelRatioBaseline: 2,
    stageElement: controller.stageElement,
    viewportElement: controller.viewportElement,
    zoomLevel: 1.25,
  });
  expect(controller.syncViewportState).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});
