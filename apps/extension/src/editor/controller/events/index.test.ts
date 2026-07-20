// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createDrawingEventHandlersMock,
  createPanEventHandlersMock,
  createRuntimeEventHandlersMock,
} = vi.hoisted(() => ({
  createDrawingEventHandlersMock: vi.fn(),
  createPanEventHandlersMock: vi.fn(),
  createRuntimeEventHandlersMock: vi.fn(),
}));

vi.mock('./drawing', () => ({
  createDrawingEventHandlers: createDrawingEventHandlersMock,
}));

vi.mock('./pan', () => ({
  createPanEventHandlers: createPanEventHandlersMock,
}));

vi.mock('./runtime', () => ({
  createRuntimeEventHandlers: createRuntimeEventHandlersMock,
}));

import {
  attachEditorControllerEventHandlers,
  createEditorControllerEventHandlers,
  detachEditorControllerEventHandlers,
} from './';

function createHandlers() {
  return {
    handleCanvasAfterRender: vi.fn(),
    handleCanvasBeforeRender: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleMouseDownBefore: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseMoveBefore: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
    handleObjectModified: vi.fn(),
    handleObjectMoving: vi.fn(),
    handleObjectResizing: vi.fn(),
    handleObjectScaling: vi.fn(),
    handlePathCreated: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleViewportMouseDown: vi.fn(),
    handleViewportScroll: vi.fn(),
    handleViewportWheel: vi.fn(),
    handleWindowKeyDown: vi.fn(),
    handleWindowKeyUp: vi.fn(),
    handleWindowBlur: vi.fn(),
    handleWindowMouseMove: vi.fn(),
    handleWindowMouseUp: vi.fn(),
  };
}

function setupResizeObserver() {
  const observe = vi.fn();
  const disconnect = vi.fn();

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe;
      disconnect = disconnect;
      constructor(_callback: ResizeObserverCallback) {}
    }
  );

  return { disconnect, observe };
}

function expectCanvasListenersAttached(
  on: ReturnType<typeof vi.fn>,
  handlers: ReturnType<typeof createHandlers>
) {
  expect(on).toHaveBeenCalledWith('selection:created', handlers.handleSelectionChange);
  expect(on).toHaveBeenCalledWith('object:resizing', handlers.handleObjectResizing);
  expect(on).toHaveBeenCalledWith('object:scaling', handlers.handleObjectScaling);
  expect(on).toHaveBeenCalledWith('mouse:down:before', handlers.handleMouseDownBefore);
  expect(on).toHaveBeenCalledWith('mouse:move:before', handlers.handleMouseMoveBefore);
  expect(on).toHaveBeenCalledWith('after:render', handlers.handleCanvasAfterRender);
}

function expectCanvasListenersDetached(
  off: ReturnType<typeof vi.fn>,
  handlers: ReturnType<typeof createHandlers>
) {
  expect(off).toHaveBeenCalledWith('selection:created', handlers.handleSelectionChange);
  expect(off).toHaveBeenCalledWith('object:resizing', handlers.handleObjectResizing);
  expect(off).toHaveBeenCalledWith('object:scaling', handlers.handleObjectScaling);
  expect(off).toHaveBeenCalledWith('mouse:down:before', handlers.handleMouseDownBefore);
  expect(off).toHaveBeenCalledWith('mouse:move:before', handlers.handleMouseMoveBefore);
  expect(off).toHaveBeenCalledWith('after:render', handlers.handleCanvasAfterRender);
}

describe('editor-controller-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges runtime, drawing, and pan handler factories', () => {
    createRuntimeEventHandlersMock.mockReturnValue({ runtime: 'runtime' });
    createDrawingEventHandlersMock.mockReturnValue({ drawing: 'drawing' });
    createPanEventHandlersMock.mockReturnValue({ pan: 'pan' });

    expect(createEditorControllerEventHandlers({} as never)).toEqual({
      drawing: 'drawing',
      pan: 'pan',
      runtime: 'runtime',
    });
  });

  it('attaches and detaches canvas, window, and viewport listeners', () => {
    const on = vi.fn();
    const off = vi.fn();
    const canvas = { on, off } as never;
    const viewportElement = document.createElement('div');
    const handlers = createHandlers();
    const { disconnect, observe } = setupResizeObserver();

    const resizeObserver = attachEditorControllerEventHandlers({
      canvas,
      handlers: handlers as never,
      onViewportResize: vi.fn(),
      viewportElement,
    });

    expectCanvasListenersAttached(on, handlers);
    expect(observe).toHaveBeenCalledWith(viewportElement);

    detachEditorControllerEventHandlers({
      canvas,
      handlers: handlers as never,
      viewportElement,
      viewportResizeObserver: resizeObserver,
    });

    expectCanvasListenersDetached(off, handlers);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
