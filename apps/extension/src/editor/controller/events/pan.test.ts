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
  const canvas = { requestRenderAll: vi.fn() };
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
    getCanvas: vi.fn(() => canvas),
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

    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
    handlers.handleWindowMouseMove(new MouseEvent('mousemove'));
    handlers.handleWindowMouseUp(new MouseEvent('mouseup', { button: 0 }));

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
  registerWheelZoomTest();
  it('pans with the right button and suppresses only the menu following a drag', () => {
    const bindings = createBindings();
    const viewport = bindings.getViewportElement();
    const handlers = createPanEventHandlers(bindings as never);
    startEditorViewportPanMock.mockReturnValueOnce({ startX: 10, startY: 10 });
    bindings.getPanSession.mockReturnValue({ startX: 10, startY: 10 } as never);

    handlers.handleViewportMouseDown(
      new MouseEvent('mousedown', { button: 2, clientX: 10, clientY: 10 })
    );
    handlers.handleWindowMouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 10 }));
    const dragMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    handlers.handleViewportContextMenu(dragMenu);
    expect(dragMenu.defaultPrevented).toBe(true);
    expect(moveEditorViewportPanMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewportElement: viewport })
    );

    handlers.handleWindowMouseUp(new MouseEvent('mouseup', { button: 2 }));
    const keyboardMenu = new MouseEvent('contextmenu', { cancelable: true, button: 0 });
    handlers.handleViewportContextMenu(keyboardMenu);
    expect(keyboardMenu.defaultPrevented).toBe(false);
    handlers.handleViewportMouseDown(
      new MouseEvent('mousedown', { button: 2, clientX: 10, clientY: 10 })
    );
    handlers.handleWindowMouseUp(new MouseEvent('mouseup', { button: 2 }));
    const clickMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    handlers.handleViewportContextMenu(clickMenu);
    expect(clickMenu.defaultPrevented).toBe(false);
  });

  it('defers an early right-click menu until release and drops it after a drag', () => {
    const bindings = createBindings();
    const handlers = createPanEventHandlers(bindings as never);
    const target = document.createElement('div');
    const replayed = vi.fn();
    target.addEventListener('contextmenu', replayed);
    startEditorViewportPanMock.mockReturnValue({ startX: 10, startY: 10 });
    bindings.getPanSession.mockReturnValue({ startX: 10, startY: 10 } as never);

    handlers.handleViewportMouseDown(
      new MouseEvent('mousedown', { button: 2, clientX: 10, clientY: 10 })
    );
    const earlyClick = new MouseEvent('contextmenu', { button: 2, cancelable: true });
    Object.defineProperty(earlyClick, 'target', { value: target });
    handlers.handleViewportContextMenu(earlyClick);
    expect(earlyClick.defaultPrevented).toBe(true);
    expect(replayed).not.toHaveBeenCalled();
    handlers.handleWindowMouseUp(new MouseEvent('mouseup', { button: 2 }));
    expect(replayed).toHaveBeenCalledOnce();

    handlers.handleViewportMouseDown(
      new MouseEvent('mousedown', { button: 2, clientX: 10, clientY: 10 })
    );
    const earlyDrag = new MouseEvent('contextmenu', { button: 2, cancelable: true });
    Object.defineProperty(earlyDrag, 'target', { value: target });
    handlers.handleViewportContextMenu(earlyDrag);
    handlers.handleWindowMouseMove(new MouseEvent('mousemove', { clientX: 20, clientY: 10 }));
    handlers.handleWindowMouseUp(new MouseEvent('mouseup', { button: 2 }));
    expect(replayed).toHaveBeenCalledOnce();
  });
});
