// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { handleSelectionModeClick, handleSelectionModeKeyDown } from './commands';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from './types';

function createState(
  overrides: Partial<SelectionModeInteractionState> = {}
): SelectionModeInteractionState {
  return {
    aspectRatio: null,
    currentSelection: { x: 120, y: 80, width: 240, height: 160 },
    currentState: 'confirmed',
    dragStartPoint: { x: 0, y: 0 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    resizeDirection: null,
    selectionAtDragStart: { x: 120, y: 80, width: 240, height: 160 },
    skipNextClick: false,
    ...overrides,
  };
}

function createOptions(): SelectionModeEventOptions {
  return {
    cancelSelection: vi.fn(),
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    flushFinalFrameUpdate: vi.fn(),
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(() => false),
    resetToIdleState: vi.fn(),
    selectElement: vi.fn(),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
  };
}

function createClickEvent(target: HTMLElement): MouseEvent {
  return {
    clientX: 70,
    clientY: 120,
    composedPath: () => [target],
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as MouseEvent;
}

function registerDeferredClickTest() {
  it('consumes the deferred click once after drag or resize completion', () => {
    const target = document.createElement('div');
    const state = createState({ skipNextClick: true });
    const options = createOptions();

    handleSelectionModeClick(createClickEvent(target), state, options);

    expect(state.skipNextClick).toBe(false);
    expect(options.resetToIdleState).not.toHaveBeenCalled();
  });
}

function registerExtensionClickTest() {
  it('stops extension UI clicks except for shared selection controls', () => {
    const host = document.createElement('div');
    const control = document.createElement('button');
    control.className = 'sniptale-selection-size-confirm-button';
    const floatingCancel = document.createElement('button');
    floatingCancel.className = 'sniptale-selection-cancel-button';
    const captureMenu = document.createElement('div');
    captureMenu.className = 'sniptale-selection-capture-menu';
    const captureMenuItem = document.createElement('button');
    captureMenu.appendChild(captureMenuItem);
    host.appendChild(control);
    host.appendChild(floatingCancel);
    host.appendChild(captureMenu);
    const state = createState();
    const options = createOptions();
    vi.mocked(options.isExtensionUIElement).mockReturnValue(true);
    const regularEvent = createClickEvent(host);
    const controlEvent = createClickEvent(control);
    const floatingCancelEvent = createClickEvent(floatingCancel);
    const captureMenuEvent = createClickEvent(captureMenuItem);

    handleSelectionModeClick(regularEvent, state, options);
    handleSelectionModeClick(controlEvent, state, options);
    handleSelectionModeClick(floatingCancelEvent, state, options);
    handleSelectionModeClick(captureMenuEvent, state, options);

    expect(regularEvent.preventDefault).toHaveBeenCalledOnce();
    expect(controlEvent.preventDefault).not.toHaveBeenCalled();
    expect(floatingCancelEvent.preventDefault).not.toHaveBeenCalled();
    expect(captureMenuEvent.preventDefault).not.toHaveBeenCalled();
  });
}

function registerSelectionAndResetTest() {
  it('selects hovered content in idle mode and resets confirmed mode on outside click', () => {
    const hoveredElement = document.createElement('article');
    const outsideTarget = document.createElement('div');
    const idleState = createState({
      currentState: 'idle',
      hoveredElement,
    });
    const confirmedState = createState({ currentState: 'confirmed' });
    const options = createOptions();

    handleSelectionModeClick(createClickEvent(hoveredElement), idleState, options);
    handleSelectionModeClick(createClickEvent(outsideTarget), confirmedState, options);

    expect(options.selectElement).toHaveBeenCalledWith(hoveredElement, undefined);
    expect(options.resetToIdleState).toHaveBeenCalledTimes(1);
  });

  it('selects the visible linked preview image on click without allowing anchor navigation', () => {
    const anchor = document.createElement('a');
    anchor.href = '/wiki/File:Chrome_on_Linux.png';
    anchor.className = 'mw-file-description';
    const image = document.createElement('img');
    image.className = 'mw-file-element';
    anchor.appendChild(image);
    image.getBoundingClientRect = () =>
      ({
        bottom: 235,
        height: 135,
        left: 50,
        right: 300,
        top: 100,
        width: 250,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    const state = createState({ currentState: 'hover', hoveredElement: null });
    const options = createOptions();
    const event = createClickEvent(anchor);

    handleSelectionModeClick(event, state, options);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(options.selectElement).toHaveBeenCalledWith(image, undefined);
  });
}

function registerKeyboardCommandTest() {
  it('keeps selection mode active when toolbar UI already claimed Escape', () => {
    const state = createState({ currentState: 'confirmed' });
    const options = createOptions();
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    event.preventDefault();

    handleSelectionModeKeyDown(event, state, options);

    expect(options.cancelSelection).not.toHaveBeenCalled();
  });

  it('cancels crop selection when a hostile page already prevented Escape', () => {
    const pageTarget = document.createElement('div');
    const state = createState({ currentState: 'confirmed' });
    const options = createOptions();
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    Object.defineProperty(event, 'target', { value: pageTarget });
    event.preventDefault();

    handleSelectionModeKeyDown(event, state, options);

    expect(options.cancelSelection).toHaveBeenCalledOnce();
  });

  it('ignores editor inputs and maps Escape and Enter to cancel and confirm', () => {
    const input = document.createElement('input');
    const inputEvent = {
      key: 'Escape',
      preventDefault: vi.fn(),
      target: input,
    } as unknown as KeyboardEvent;
    const escapeEvent = {
      key: 'Escape',
      preventDefault: vi.fn(),
      target: document.createElement('div'),
    } as unknown as KeyboardEvent;
    const enterEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      target: document.createElement('div'),
    } as unknown as KeyboardEvent;
    const state = createState({ currentState: 'confirmed' });
    const options = createOptions();

    handleSelectionModeKeyDown(inputEvent, state, options);
    handleSelectionModeKeyDown(escapeEvent, state, options);
    handleSelectionModeKeyDown(enterEvent, state, options);

    expect(options.cancelSelection).toHaveBeenCalledTimes(1);
    expect(options.confirmSelection).toHaveBeenCalledWith(enterEvent);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(escapeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
  });
}

function registerCaptureMenuKeyboardTest() {
  it('closes the highest capture menu on Escape and leaves native control activation intact', () => {
    const menu = document.createElement('div');
    menu.className = 'sniptale-selection-capture-menu';
    const item = document.createElement('button');
    menu.appendChild(item);
    const state = createState({ currentState: 'confirmed' });
    const options = createOptions();
    vi.mocked(options.closeCaptureActionMenu).mockReturnValue(true);
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    Object.defineProperty(escapeEvent, 'target', { value: item });
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(enterEvent, 'target', { value: item });

    handleSelectionModeKeyDown(escapeEvent, state, options);
    handleSelectionModeKeyDown(enterEvent, state, options);

    expect(options.closeCaptureActionMenu).toHaveBeenCalledWith(true);
    expect(options.cancelSelection).not.toHaveBeenCalled();
    expect(options.confirmSelection).not.toHaveBeenCalled();
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(enterEvent.defaultPrevented).toBe(false);
  });
}

describe('selection-mode command events', () => {
  registerDeferredClickTest();
  registerExtensionClickTest();
  registerSelectionAndResetTest();
  registerKeyboardCommandTest();
  registerCaptureMenuKeyboardTest();
});
