// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  drawingHandlers: { handlePathCreated: vi.fn() },
  panHandlers: { handleViewportWheel: vi.fn() },
  runtimeHandlers: { handleSelectionChange: vi.fn() },
}));

vi.mock('./drawing', () => ({
  createEditorDrawingEventHandlers: vi.fn(() => mocks.drawingHandlers),
}));
vi.mock('./pan', () => ({ createPanEventHandlers: vi.fn(() => mocks.panHandlers) }));
vi.mock('./runtime', () => ({ createRuntimeEventHandlers: vi.fn(() => mocks.runtimeHandlers) }));

import {
  attachEditorControllerEventHandlers,
  createEditorControllerEventHandlers,
  detachEditorControllerEventHandlers,
} from '.';

beforeEach(() => vi.clearAllMocks());

it('combines runtime, drawing, and pan event owners', () => {
  expect(Reflect.apply(createEditorControllerEventHandlers, null, [{}])).toEqual({
    ...mocks.runtimeHandlers,
    ...mocks.drawingHandlers,
    ...mocks.panHandlers,
  });
});

it('attaches and detaches every canvas, window, viewport, and resize observer listener', () => {
  const canvas = { off: vi.fn(), on: vi.fn() };
  const viewportElement = document.createElement('div');
  vi.spyOn(viewportElement, 'addEventListener');
  vi.spyOn(viewportElement, 'removeEventListener');
  vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'removeEventListener');
  const observe = vi.fn();
  const disconnect = vi.fn();
  class TestResizeObserver {
    disconnect = disconnect;
    observe = observe;
    unobserve = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  const handlers = new Proxy(
    {},
    { get: (_target, property) => vi.fn(function handler() {}).mockName(String(property)) }
  );
  const onViewportResize = vi.fn();

  const observer = Reflect.apply(attachEditorControllerEventHandlers, null, [
    { canvas, handlers, onViewportResize, viewportElement },
  ]);
  expect(canvas.on).toHaveBeenCalledTimes(16);
  expect(observe).toHaveBeenCalledWith(viewportElement);

  Reflect.apply(detachEditorControllerEventHandlers, null, [
    { canvas, handlers, viewportElement, viewportResizeObserver: observer },
  ]);
  expect(canvas.off).toHaveBeenCalledTimes(16);
  expect(disconnect).toHaveBeenCalledOnce();
  expect(viewportElement.removeEventListener).toHaveBeenCalledTimes(3);
});
