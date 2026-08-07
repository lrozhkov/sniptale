// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const targetResolver = vi.hoisted(() => ({
  resolveDrawablePageHtmlElement: vi.fn(),
  resolveSelectablePageHtmlElement: vi.fn(),
}));
const framePlatform = vi.hoisted(() => ({
  createDocumentPagePlacement: vi.fn(() => ({ iframePath: [], pageX: 10, pageY: 20 })),
  getDocumentViewportBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
  getTopViewportPoint: vi.fn((_doc: Document, x: number, y: number) => ({ x, y })),
  getViewportClientPoint: vi.fn((x: number, y: number) => ({ x, y })),
}));
const domHost = vi.hoisted(() => ({
  appendToContentOverlayRoot: vi.fn((element: HTMLElement) => document.body.append(element)),
  getContentUiElementById: vi.fn(() => null),
  queryAllContentUiElements: vi.fn((selector: string) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ]),
  queryContentUiElement: vi.fn(() => null),
}));
const targetPolicy = vi.hoisted(() => ({
  hasBlockingHighlighterPopover: vi.fn(() => false),
  isInsideExistingFrame: vi.fn(() => false),
  isHighlighterExtensionUiElement: vi.fn(() => false),
  isNearExistingFrameBorder: vi.fn(() => false),
}));

vi.mock('../page-element-target', () => targetResolver);
vi.mock('./targets', () => targetPolicy);
vi.mock('../../platform/frame', () => framePlatform);
vi.mock('../../platform/dom-host', () => domHost);
vi.mock('../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: (element: HTMLElement, cssText: string) => {
    element.style.cssText = cssText;
  },
}));
vi.mock('../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlighter')>()),
  isHighlighterEnabled: () => true,
  isHighlighterPausedState: () => false,
}));

import { createFreeFrameDrawingHandlers, type FreeFramePointerEvent } from './drawing';
import { createHoverInteractionHandlers } from './interactions';
import { createHoverSession } from './session';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { setFrameSessionBorderPreset } from '../frame-runtime/session/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createFrameSelectionEventHandlers } from '../frame-runtime/ui-controller/activation';
import type { FrameData } from '../../../features/highlighter/contracts';

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

function createClickEvent(
  target: HTMLElement,
  pointerId = 1,
  clientX = 0,
  clientY = 0
): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
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
  const showHoverOverlay = vi.fn(() => true);
  const getCallbacks = () => ({ addFrame, addFreeFrame, hasFrameForElement: null });
  const getState = {
    isFrameEditing: () => false,
    isModeEnabled: () => true,
    isPaused: () => false,
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
  targetResolver.resolveSelectablePageHtmlElement.mockImplementation(
    (event: Event) => event.target
  );
  targetResolver.resolveDrawablePageHtmlElement.mockImplementation((event: Event) => event.target);
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
  useFrameUIStore.getState().reset();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  targetPolicy.hasBlockingHighlighterPopover.mockReturnValue(false);
  targetPolicy.isHighlighterExtensionUiElement.mockReturnValue(false);
  targetPolicy.isInsideExistingFrame.mockReturnValue(false);
  targetPolicy.isNearExistingFrameBorder.mockReturnValue(false);
  setFrameSessionBorderPreset(DEFAULT_BORDER_PRESET);
});

describe('free frame drawing gesture', () => {
  it('starts manual drawing from a document root where hover selection is unavailable', () => {
    const { addFreeFrame, handlers } = createFixture();

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, document.body));
    handlers.handlePointerMove(createPointerEvent('pointermove', 60, 60, document.body));
    handlers.handlePointerUp(createPointerEvent('pointerup', 60, 60, document.body));

    expect(targetResolver.resolveDrawablePageHtmlElement).toHaveBeenCalled();
    expect(addFreeFrame).toHaveBeenCalledWith(
      expect.objectContaining({ x: 20, y: 20, width: 40, height: 40 }),
      document.body
    );
  });

  it('renders the selected preset with drawing-layer opacity', () => {
    const { handlers } = createFixture();
    setFrameSessionBorderPreset({
      id: 'drawing-preset',
      name: 'Drawing',
      enabled: true,
      order: 0,
      width: 4,
      color: '#8B5CF6',
      style: 'dashed',
      radius: 8,
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
      shadow: 30,
      opacity: 100,
      strokeOpacity: 70,
      fillColor: '#EF4444',
      fillOpacity: 7,
      inheritCustomCss: false,
      customCss: '',
    });

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 60, 60));

    const preview = document.querySelector<HTMLElement>('.sniptale-free-frame-draft');
    expect(preview?.style.opacity).toBe('0.88');
    expect(preview?.style.borderStyle).toBe('dashed');
    expect(preview?.style.borderWidth).toBe('4px');
    expect(preview?.style.borderRadius).toBe('12px');
    expect(preview?.style.boxSizing).toBe('content-box');
    expect(preview?.style.background).toBe('rgba(239, 68, 68, 0.07)');
    expect(preview?.style.boxShadow).not.toBe('none');
  });

  it('preserves safe custom decoration without yielding canonical stroke geometry', () => {
    const { handlers } = createFixture();
    setFrameSessionBorderPreset({
      ...DEFAULT_BORDER_PRESET,
      width: 4,
      radius: 8,
      inheritCustomCss: true,
      customCss: [
        'background-image: linear-gradient(red, blue)',
        'box-shadow: 0 0 4px red',
        'border: 20px dashed blue',
        'border-radius: 50px',
      ].join('; '),
    });

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 60, 60));

    const preview = document.querySelector<HTMLElement>('.sniptale-free-frame-draft');
    expect(preview?.style.backgroundImage).toBe('linear-gradient(red, blue)');
    expect(preview?.style.boxShadow).toBe('0 0 4px red');
    expect(preview?.style.borderWidth).toBe('4px');
    expect(preview?.style.borderStyle).toBe(DEFAULT_BORDER_PRESET.style);
    expect(preview?.style.borderRadius).toBe('12px');
  });

  it('does not start a page gesture through an open settings popover', () => {
    const { handlers, session } = createFixture();
    targetPolicy.hasBlockingHighlighterPopover.mockReturnValue(true);

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));

    expect(session.freeDraw.gesture).toBeNull();
    expect(targetResolver.resolveSelectablePageHtmlElement).not.toHaveBeenCalled();
  });

  it('hides every other frame control as soon as drawing takes ownership', () => {
    const { handlers } = createFixture();
    useFrameUIStore.getState().hoverFrame('other-frame');
    useFrameUIStore.getState().setResizeFrame('other-frame');

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 40));

    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: null,
      resizeFrameId: null,
      selectedFrameId: null,
    });
  });

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

  it('clears a post-draw click before an earlier frame activation listener can select', () => {
    const { handlers } = createFixture();
    const target = document.createElement('div');
    handlers.handlePointerDown(createPointerEvent('pointerdown', 100, 100, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 60, 60, target));
    handlers.handlePointerUp(createPointerEvent('pointerup', 60, 60, target));
    const existingFrame: FrameData = {
      effectMode: 'border',
      height: 120,
      id: 'existing-frame',
      width: 120,
      x: 20,
      y: 20,
    };
    const selectFrame = vi.fn();
    const click = createClickEvent(target, 1, 60, 60);
    const frameActivation = createFrameSelectionEventHandlers({
      activePopoverRef: { current: null },
      clearSelection: vi.fn(),
      consumeSuppressedClick: handlers.consumeSuppressedClick,
      hasHoverPreviewTarget: () => false,
      framesRef: { current: [existingFrame] },
      hoveredFrameIdRef: { current: null },
      hoverFrame: vi.fn(),
      selectedFrameIdRef: { current: null },
      selectFrame,
    });

    frameActivation.click(click);

    expect(click.defaultPrevented).toBe(true);
    expect(selectFrame).not.toHaveBeenCalled();
    expect(handlers.consumeSuppressedClick(click)).toBe(false);
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
});

describe('free frame drawing cancellation and continuity', () => {
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

  it.each([
    'sniptale-frame-toolbar-trigger',
    'sniptale-frame-quick-action',
    'sniptale-toolbar-portal-wrapper',
    'sniptale-callout-settings-handle',
    'sniptale-step-badge-controls',
  ])('keeps an active draw alive across a mouseleave into %s UI', (uiClassName) => {
    const { addFreeFrame, handlers, session } = createFixture();
    const pageTarget = document.createElement('section');
    const uiTarget = document.createElement('div');
    uiTarget.className = uiClassName;

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, pageTarget));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 40, pageTarget));

    expect(handlers.cancelDrawing('mouseleave')).toBe(false);
    expect(session.freeDraw.gesture?.isDrawing).toBe(true);

    handlers.handlePointerMove(createPointerEvent('pointermove', 70, 70, uiTarget));
    handlers.handlePointerUp(createPointerEvent('pointerup', 70, 70, uiTarget));

    expect(addFreeFrame).toHaveBeenCalledOnce();
    expect(addFreeFrame).toHaveBeenCalledWith(
      expect.objectContaining({ x: 20, y: 20, width: 50, height: 50 }),
      pageTarget
    );
    expect(session.freeDraw.gesture).toBeNull();
  });

  it('keeps an active draw alive across scroll until pointerup', () => {
    const { addFreeFrame, handlers, session } = createFixture();
    const target = document.createElement('section');

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 40, target));

    expect(handlers.cancelDrawing('scroll')).toBe(false);
    expect(session.freeDraw.gesture?.isDrawing).toBe(true);

    handlers.handlePointerMove(createPointerEvent('pointermove', 70, 70, target));
    handlers.handlePointerUp(createPointerEvent('pointerup', 70, 70, target));

    expect(addFreeFrame).toHaveBeenCalledOnce();
    expect(session.freeDraw.gesture).toBeNull();
  });

  it('keeps an active draw alive across window blur until pointerup', () => {
    const { addFreeFrame, handlers, session } = createFixture();
    const target = document.createElement('section');

    handlers.handlePointerDown(createPointerEvent('pointerdown', 20, 20, target));
    handlers.handlePointerMove(createPointerEvent('pointermove', 40, 40, target));

    expect(handlers.cancelDrawing('blur')).toBe(false);
    expect(session.freeDraw.gesture?.isDrawing).toBe(true);

    handlers.handlePointerUp(createPointerEvent('pointerup', 70, 70, target));

    expect(addFreeFrame).toHaveBeenCalledOnce();
    expect(addFreeFrame).toHaveBeenCalledWith(
      expect.objectContaining({ x: 20, y: 20, width: 50, height: 50 }),
      target
    );
    expect(session.freeDraw.gesture).toBeNull();
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
