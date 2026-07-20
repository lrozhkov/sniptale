import { expect, it, vi } from 'vitest';
import type { EditorControllerInstance } from '../instance/types';

const bindingMocks = vi.hoisted(() => ({
  createEditorControllerEventBindings: vi.fn(() => ({ bindings: true })),
  createEditorControllerEventHandlers: vi.fn(() => ({ handlers: true })),
  createEditorControllerPublicApiAdapter: vi.fn(() => ({ adapter: true })),
}));

vi.mock('../instance/bindings', () => ({
  createEditorControllerEventBindings: bindingMocks.createEditorControllerEventBindings,
  createEditorControllerPublicApiAdapter: bindingMocks.createEditorControllerPublicApiAdapter,
}));

vi.mock('../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events')>()),
  createEditorControllerEventHandlers: bindingMocks.createEditorControllerEventHandlers,
}));

import { ImageEditorControllerState } from './controller-state';

class TestControllerState extends ImageEditorControllerState {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('owns authoritative controller state and bootstrap adapters', () => {
  const controller = new TestControllerState();

  expect(controller.canvas).toBeNull();
  expect(controller.source).toBeNull();
  expect(controller.zoomLevel).toBe(1);
  expect(controller.viewportDevicePixelRatioBaseline).toBe(1);
  expect(controller.rasterToolSession).toEqual(
    expect.objectContaining({
      brushDraft: null,
      eraserDraft: null,
      selection: null,
    })
  );
  expect(controller.eventHandlers).toEqual({ handlers: true });
  expect(controller.getPublicApiAdapter()).toEqual({ adapter: true });
  expect(bindingMocks.createEditorControllerEventBindings).toHaveBeenCalledWith(controller);
  expect(bindingMocks.createEditorControllerPublicApiAdapter).toHaveBeenCalledWith(controller);
});
