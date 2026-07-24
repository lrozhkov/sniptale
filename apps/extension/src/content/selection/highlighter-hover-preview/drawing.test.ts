// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const targetResolver = vi.hoisted(() => ({ resolvePagePreparationTarget: vi.fn() }));
const framePlatform = vi.hoisted(() => ({
  createDocumentPagePlacement: vi.fn(() => ({ iframePath: [], pageX: 10, pageY: 20 })),
  getDocumentViewportBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
  getTopViewportPoint: vi.fn((_doc: Document, x: number, y: number) => ({ x, y })),
}));
const domHost = vi.hoisted(() => ({
  appendToContentOverlayRoot: vi.fn((element: HTMLElement) => document.body.append(element)),
  getContentUiElementById: vi.fn(() => null),
  queryAllContentUiElements: vi.fn((selector: string) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ]),
  queryContentUiElement: vi.fn(() => null),
}));

vi.mock('../../parser/page-preparation/target', () => targetResolver);
vi.mock('./targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./targets')>()),
  hasBlockingHighlighterPopover: () => false,
  isHighlighterExtensionUiElement: () => false,
}));
vi.mock('../../platform/frame', () => framePlatform);
vi.mock('../../platform/dom-host', () => domHost);
vi.mock('../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: (element: HTMLElement, cssText: string) => {
    element.style.cssText = cssText;
  },
}));

import { createFreeFrameDrawingHandlers, type FreeFramePointerEvent } from './drawing';
import { createHoverInteractionHandlers } from './interactions';
import { createHoverSession } from './session';

class TestPointerEvent extends MouseEvent implements FreeFramePointerEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

function createPointerEvent(
  type: string,
  x: number,
  y: number,
  target: HTMLElement = document.createElement('div'),
  pointerId = 1
): FreeFramePointerEvent {
  if (!target.isConnected) document.body.append(target);
  const event = new TestPointerEvent(type, {
    button: 0,
    clientX: x,
    clientY: y,
    pointerId,
  });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  return event;
}

function createClickEvent(target: HTMLElement, pointerId = 1): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'pointerId', { configurable: true, value: pointerId });
  return event;
}

function createMouseMoveEvent(x: number, y: number, target: HTMLElement): MouseEvent {
  const event = new MouseEvent('mousemove', { clientX: x, clientY: y });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  return event;
}

function createFixture() {
  const session = createHoverSession();
  const addFrame = vi.fn();
  const addFreeFrame = vi.fn();
  const hideHoverOverlay = vi.fn();
  const showHoverOverlay = vi.fn();
  const getCallbacks = () => ({ addFrame, addFreeFrame, hasFrameForElement: null });
  const getState = {
    isFrameEditing: () => false,
    isModeEnabled: () => true,
    isPaused: () => false,
    isTooltipVisible: () => false,
  };
  const handlers = createFreeFrameDrawingHandlers({
    getCallbacks,
    getState,
    hideHoverOverlay,
    session,
  });
  const interactions = createHoverInteractionHandlers({
    getCallbacks,
    getState,
    hoverThrottleMs: 100,
    overlayActions: { hideHoverOverlay, showHoverOverlay },
    session,
    consumeSuppressedClick: handlers.consumeSuppressedClick,
  });
  targetResolver.resolvePagePreparationTarget.mockImplementation((event: Event) => event.target);
  return {
    addFrame,
    addFreeFrame,
    handlers,
    hideHoverOverlay,
    interactions,
    session,
    showHoverOverlay,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('free frame drawing gesture', () => {
  it('keeps linked frame installation working through the complete pointer and click lifecycle', () => {
    const { addFrame, addFreeFrame, handlers, interactions } = createFixture();
    const target = document.createElement('button');
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerUp(createPointerEvent('pointerup', 20, 20, target));
    interactions.handleClick(createClickEvent(target));

    expect(addFrame).toHaveBeenCalledOnce();
    expect(addFrame).toHaveBeenCalledWith(target);
    expect(addFreeFrame).not.toHaveBeenCalled();
  });

  it('recovers linked frame installation when an undrawn pointer candidate misses pointerup', () => {
    const { addFrame, handlers, interactions, session } = createFixture();
    const target = document.createElement('button');
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));

    interactions.handleClick(createClickEvent(target));

    expect(addFrame).toHaveBeenCalledWith(target);
    expect(session.freeDraw.gesture).toBeNull();
  });

  it('still suppresses a click that arrives while a free-frame drag is active', () => {
    const { addFrame, handlers, interactions, session } = createFixture();
    const target = document.createElement('button');
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 60, 60, target));
    const click = createClickEvent(target);

    interactions.handleClick(click);

    expect(addFrame).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(session.freeDraw.gesture).toBeNull();
    expect(document.querySelector('.sniptale-free-frame-draft-portal')).toBeNull();
  });

  it('keeps a sub-threshold gesture available for the existing click path', () => {
    const { addFreeFrame, handlers } = createFixture();
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 23, 22));
    handlers.handlePointerUp(createPointerEvent('pointerup', 23, 22));

    expect(addFreeFrame).not.toHaveBeenCalled();
    expect(handlers.consumeSuppressedClick()).toBe(false);
  });

  it('normalizes reverse dragging, commits once, and suppresses the following click', () => {
    const { addFreeFrame, handlers } = createFixture();
    const pointerDown = createPointerEvent('pointerdown', 100, 90);
    handlers.handlePointerDown(pointerDown);
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 30));
    handlers.handlePointerUp(createPointerEvent('pointerup', 40, 30));

    expect(addFreeFrame).toHaveBeenCalledOnce();
    expect(addFreeFrame).toHaveBeenCalledWith(
      {
        x: 40,
        y: 30,
        width: 60,
        height: 60,
        pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
      },
      pointerDown.target
    );
    expect(handlers.consumeSuppressedClick()).toBe(true);
    expect(handlers.consumeSuppressedClick()).toBe(false);
    expect(document.querySelector('.sniptale-free-frame-draft-portal')).toBeNull();
  });

  it('keeps an exact-threshold gesture on the existing click path', () => {
    const { addFreeFrame, handlers } = createFixture();
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 25, 20));
    handlers.handlePointerUp(createPointerEvent('pointerup', 25, 20));

    expect(addFreeFrame).not.toHaveBeenCalled();
    expect(handlers.consumeSuppressedClick()).toBe(false);
  });

  it.each([
    ['right', 20, 20, 40, 20],
    ['left', 40, 20, 20, 20],
    ['down', 20, 20, 20, 40],
    ['up', 20, 40, 20, 20],
  ])(
    'suppresses an axis-aligned %s drag without saving a padded frame',
    (_name, startX, startY, endX, endY) => {
      const { addFreeFrame, handlers } = createFixture();
      handlers.handlePointerDown(createPointerEvent('pointerdown', startX, startY));
      handlers.handlePointerMove(createPointerEvent('pointermove', endX, endY));
      handlers.handlePointerUp(createPointerEvent('pointerup', endX, endY));

      expect(addFreeFrame).not.toHaveBeenCalled();
      expect(handlers.consumeSuppressedClick()).toBe(true);
      expect(document.querySelector('.sniptale-free-frame-draft-portal')).toBeNull();
    }
  );

  it('re-arms hover on the same target after rejecting an undersized started drag', () => {
    const { addFreeFrame, handlers, interactions, session, showHoverOverlay } = createFixture();
    const target = document.createElement('button');
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    session.lastHoverTarget = target;
    session.lastHoverProcessTime = 0;
    session.lastHoverX = 20;
    session.lastHoverY = 20;

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 20, target));
    handlers.handlePointerUp(createPointerEvent('pointerup', 40, 20, target));
    interactions.handleClick(createClickEvent(target));
    interactions.handleMouseMove(createMouseMoveEvent(50, 22, target));
    rafCallbacks[0]?.(0);

    expect(addFreeFrame).not.toHaveBeenCalled();
    expect(session.lastHoverTarget).toBe(target);
    expect(showHoverOverlay).toHaveBeenCalledWith(target);
    rafSpy.mockRestore();
  });

  it('suppresses the release click after Escape cancellation without swallowing a later click', () => {
    const { addFrame, addFreeFrame, handlers, interactions } = createFixture();
    const target = document.createElement('button');
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 20, target));

    expect(handlers.cancelDrawing('escape')).toBe(true);
    handlers.handlePointerUp(createPointerEvent('pointerup', 40, 20, target));
    const canceledClick = createClickEvent(target);
    interactions.handleClick(canceledClick);

    expect(canceledClick.defaultPrevented).toBe(true);
    expect(addFreeFrame).not.toHaveBeenCalled();
    expect(addFrame).not.toHaveBeenCalled();

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target, 2));
    handlers.handlePointerUp(createPointerEvent('pointerup', 20, 20, target, 2));
    interactions.handleClick(createClickEvent(target, 2));

    expect(addFrame).toHaveBeenCalledOnce();
    expect(addFrame).toHaveBeenCalledWith(target);
  });

  it('cancels a queued hover RAF while drawing and permits one fresh hover after exit', () => {
    const { handlers, interactions, session, showHoverOverlay } = createFixture();
    const target = document.createElement('button');
    const rafCallbacks: FrameRequestCallback[] = [];
    const cancelAnimationFrameMock = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

    interactions.handleMouseMove(createMouseMoveEvent(10, 10, target));
    handlers.handlePointerDown(createPointerEvent('pointerdown', 10, 10, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 20, 20, target));
    rafCallbacks[0]?.(0);

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(session.hoverRafId).toBeNull();
    expect(showHoverOverlay).not.toHaveBeenCalled();

    handlers.cancelDrawing('pointercancel');
    session.lastHoverProcessTime = 0;
    interactions.handleMouseMove(createMouseMoveEvent(30, 30, target));
    rafCallbacks[1]?.(1);

    expect(showHoverOverlay).toHaveBeenCalledOnce();
    expect(showHoverOverlay).toHaveBeenCalledWith(target);
  });

  it('commits an exact 10 by 10 gesture without padding its geometry', () => {
    const { addFreeFrame, handlers } = createFixture();
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 30));
    handlers.handlePointerMove(createPointerEvent('pointermove', 30, 20));
    handlers.handlePointerUp(createPointerEvent('pointerup', 30, 20));

    expect(addFreeFrame).toHaveBeenCalledWith(
      {
        x: 20,
        y: 20,
        width: 10,
        height: 10,
        pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
      },
      expect.any(HTMLElement)
    );
  });

  it('cancels an active draft without committing', () => {
    const { addFreeFrame, handlers } = createFixture();
    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 80, 80));

    expect(handlers.cancelDrawing()).toBe(true);
    expect(addFreeFrame).not.toHaveBeenCalled();
    expect(document.querySelector('.sniptale-free-frame-draft-portal')).toBeNull();
  });
});
