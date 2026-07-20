// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createPanEventHandlers } from './pan';

const {
  finishEditorViewportPanMock,
  moveEditorViewportPanMock,
  scheduleEditorViewportStateSyncFrameMock,
  startEditorViewportPanMock,
} = vi.hoisted(() => ({
  finishEditorViewportPanMock: vi.fn(),
  moveEditorViewportPanMock: vi.fn(),
  scheduleEditorViewportStateSyncFrameMock: vi.fn(),
  startEditorViewportPanMock: vi.fn(),
}));

vi.mock('../viewport/interactions', () => ({
  finishEditorViewportPan: finishEditorViewportPanMock,
  moveEditorViewportPan: moveEditorViewportPanMock,
  scheduleEditorViewportStateSyncFrame: scheduleEditorViewportStateSyncFrameMock,
  startEditorViewportPan: startEditorViewportPanMock,
}));

function createBindings() {
  const viewportElement = document.createElement('div');
  const rasterToolSession = {
    hoverCursor: null as { scenePoint: { x: number; y: number }; tool: 'eraser' } | null,
    selection: null,
    clipboard: null,
    marqueeDraft: null,
    lassoDraft: null,
    gradientDraft: null,
    brushDraft: null,
    eraserDraft: null,
    overlayListeners: new Set(),
  };
  Object.defineProperty(viewportElement, 'getBoundingClientRect', {
    value: () => ({
      bottom: 80,
      height: 80,
      left: 10,
      right: 90,
      top: 0,
      width: 80,
      x: 10,
      y: 0,
      toJSON: () => undefined,
    }),
  });

  return {
    getActiveTool: vi.fn(() => 'select'),
    getIsSpacePressed: vi.fn(() => true),
    getPanSession: vi.fn(() => ({ id: 'existing-pan' })),
    getRasterToolSession: vi.fn(() => rasterToolSession),
    getSource: vi.fn(() => ({ displayHeight: 80, displayWidth: 80 })),
    getViewportElement: vi.fn(() => viewportElement),
    getViewportSyncFrame: vi.fn(() => 4),
    setPanSession: vi.fn(),
    setViewportSyncFrame: vi.fn(),
    syncViewportState: vi.fn(),
    zoomViewportAtPoint: vi.fn(),
  };
}

function getScheduleArgs() {
  return scheduleEditorViewportStateSyncFrameMock.mock.calls.at(-1)?.[0];
}

function registerPanLifecycleTest() {
  it('delegates viewport pan lifecycle and preserves the current session when pan start returns null', () => {
    startEditorViewportPanMock.mockReturnValueOnce(null);
    finishEditorViewportPanMock.mockReturnValueOnce({ id: 'finished-pan' });
    const bindings = createBindings();
    const handlers = createPanEventHandlers(bindings as never);
    const event = new MouseEvent('mousedown');

    handlers.handleViewportMouseDown(event);
    handlers.handleViewportScroll();
    handlers.handleWindowMouseMove(new MouseEvent('mousemove'));
    handlers.handleWindowMouseUp();

    expect(bindings.setPanSession).toHaveBeenNthCalledWith(1, { id: 'existing-pan' });
    expect(scheduleEditorViewportStateSyncFrameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        viewportSyncFrame: 4,
      })
    );
    expect(moveEditorViewportPanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        panSession: { id: 'existing-pan' },
      })
    );
    expect(bindings.setPanSession).toHaveBeenNthCalledWith(2, { id: 'finished-pan' });
  });
}

function registerPanSyncCallbackTest() {
  it('stores a fresh pan session and executes the scheduled viewport sync callbacks', () => {
    startEditorViewportPanMock.mockReturnValueOnce({ id: 'started-pan' });
    scheduleEditorViewportStateSyncFrameMock.mockClear();
    const bindings = createBindings();
    const handlers = createPanEventHandlers(bindings as never);

    handlers.handleViewportMouseDown(new MouseEvent('mousedown'));
    handlers.handleViewportScroll();

    const scheduleArgs = getScheduleArgs();
    scheduleArgs?.syncViewportState();
    scheduleArgs?.setViewportSyncFrame(8);

    expect(bindings.setPanSession).toHaveBeenCalledWith({ id: 'started-pan' });
    expect(scheduleArgs).toEqual(
      expect.objectContaining({
        syncViewportState: expect.any(Function),
        viewportSyncFrame: 4,
      })
    );
    expect(bindings.syncViewportState).toHaveBeenCalledOnce();
    expect(bindings.setViewportSyncFrame).toHaveBeenCalledWith(8);
  });
}

function registerRasterHoverCleanupTest() {
  it('clears the eraser hover overlay after the pointer leaves the viewport', () => {
    const bindings = createBindings();
    const session = bindings.getRasterToolSession();
    session.hoverCursor = { scenePoint: { x: 24, y: 28 }, tool: 'eraser' };
    bindings.getActiveTool.mockReturnValue('eraser');
    const handlers = createPanEventHandlers(bindings as never);

    handlers.handleWindowMouseMove(
      new MouseEvent('mousemove', {
        clientX: 120,
        clientY: 40,
      })
    );

    expect(session.hoverCursor).toBeNull();
  });
}

function registerWheelZoomTest() {
  it('zooms around the wheel pointer when an image is loaded', () => {
    const bindings = createBindings();
    const handlers = createPanEventHandlers(bindings as never);
    const event = new WheelEvent('wheel', {
      clientX: 44,
      clientY: 32,
      deltaY: -120,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    handlers.handleViewportWheel(event);

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(bindings.zoomViewportAtPoint).toHaveBeenCalledWith(1.1, {
      clientX: 44,
      clientY: 32,
    });
  });
}

describe('createPanEventHandlers', () => {
  registerPanLifecycleTest();
  registerPanSyncCallbackTest();
  registerRasterHoverCleanupTest();
  registerWheelZoomTest();
});
