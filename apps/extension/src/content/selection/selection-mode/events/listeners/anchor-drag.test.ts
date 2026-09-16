// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { setupSelectionModeRuntimeListeners } from '.';
import { createSelectionModeEventHandlers } from '../handlers';
import { createSelectionModeSession } from '../../session';

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  addWindowEventListenerToAllWindowsDynamic: (
    type: string,
    handler: EventListener,
    options: AddEventListenerOptions
  ) => {
    window.addEventListener(type, handler, options);
    return () => window.removeEventListener(type, handler, options);
  },
  addEventListenerToAllWindowsDynamic: () => () => {},
  addScrollListenersToAllWindows: () => () => {},
}));

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  document.body.replaceChildren();
});

function setup() {
  const session = createSelectionModeSession();
  session.isActive = true;
  const anchor = document.createElement('a');
  anchor.href = '#destination';
  document.body.append(anchor);
  const events = {
    cancelSelection: vi.fn(),
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    constrainSelection: vi.fn(),
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: () => false,
    selectElement: vi.fn(),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(() => {
      session.currentState = 'drag';
    }),
    updateDragSelection: vi.fn(),
    finalizeDragSelection: vi.fn(() => {
      session.currentState = 'confirmed';
    }),
    flushFinalFrameUpdate: vi.fn(),
    resetToIdleState: vi.fn(),
    updateFinalFrame: vi.fn(),
  };
  setupSelectionModeRuntimeListeners({
    session,
    hideHoverFrame: events.hideHoverFrame,
    setupListenerHandlers: createSelectionModeEventHandlers({
      state: session,
      selectionModeEvents: events,
    }),
  });
  cleanup = session.cleanupEventListeners;
  const dispatch = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    anchor.dispatchEvent(event);
    return event;
  };
  return { anchor, session, events, dispatch };
}

it('draws from a link without compatibility mouse events and consumes the following click', () => {
  const { events, dispatch } = setup();
  dispatch('pointerdown', 20, 30);
  dispatch('pointermove', 140, 120);
  dispatch('pointerup', 140, 120);
  const click = dispatch('click', 140, 120);
  expect(events.startDragSelection).toHaveBeenCalledWith(20, 30);
  expect(events.updateDragSelection).toHaveBeenLastCalledWith(140, 120);
  expect(events.finalizeDragSelection).toHaveBeenCalledOnce();
  expect(events.selectElement).not.toHaveBeenCalled();
  expect(click.defaultPrevented).toBe(true);
});

it('keeps a stationary link click selectable and releases listeners on cleanup', () => {
  const { anchor, events, dispatch } = setup();
  dispatch('pointerdown', 20, 30);
  dispatch('pointerup', 20, 30);
  expect(dispatch('click', 20, 30).defaultPrevented).toBe(true);
  expect(events.selectElement).toHaveBeenCalledWith(anchor, undefined);
  expect(events.startDragSelection).not.toHaveBeenCalled();
  cleanup?.();
  expect(dispatch('pointerdown', 20, 30).defaultPrevented).toBe(false);
  dispatch('pointermove', 140, 120);
  dispatch('pointerup', 140, 120);
  expect(events.startDragSelection).not.toHaveBeenCalled();
});
