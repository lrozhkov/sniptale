// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  handleSelectionModeClick,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseDown,
} from '.';
import type { SelectionModeInteractionState } from './types';

function createInteractionState(): SelectionModeInteractionState {
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
  };
}

function createSelectionModeOptions() {
  return {
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: () => true,
    resetToIdleState: vi.fn(),
    selectElement: vi.fn(),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
  };
}

function createIframeSelectionFixture() {
  const state = {
    ...createInteractionState(),
    currentState: 'idle' as const,
    hoveredElement: null,
  };
  const options = {
    ...createSelectionModeOptions(),
    isExtensionUIElement: () => false,
  };
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const innerTarget = iframeDoc.createElement('div');
  innerTarget.textContent = 'Iframe row';
  iframeDoc.body.appendChild(innerTarget);
  Object.defineProperty(iframeDoc, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => innerTarget),
  });

  return { iframe, innerTarget, options, state };
}

function createIframePointerEvent(target: HTMLIFrameElement): MouseEvent {
  return {
    clientX: 18,
    clientY: 10,
    target,
    composedPath: () => [target],
  } as unknown as MouseEvent;
}

function createIframeClickEvent(target: HTMLIFrameElement): MouseEvent {
  return {
    ...createIframePointerEvent(target),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}

it('allows click-through for the shared confirm button', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const host = document.createElement('div');
  const target = document.createElement('button');
  target.className = 'sniptale-selection-size-confirm-button';
  host.appendChild(target);

  const event = {
    composedPath: () => [target, host],
    target: host,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as MouseEvent;

  handleSelectionModeClick(event, state, options);

  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(event.stopPropagation).not.toHaveBeenCalled();
  expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  expect(options.resetToIdleState).not.toHaveBeenCalled();
});

it('does not start drag or resize when pressing the shared confirm button', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const target = document.createElement('button');
  target.className = 'sniptale-selection-size-confirm-button';

  const event = {
    clientX: 220,
    clientY: 140,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as MouseEvent;

  handleSelectionModeMouseDown(event, state, options);

  expect(state.isDragging).toBe(false);
  expect(state.isResizing).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(event.stopPropagation).not.toHaveBeenCalled();
  expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
});

it('captures the current selection as resize start state when dragging a handle', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const host = document.createElement('div');
  const target = document.createElement('div');
  target.className = 'sniptale-resize-handle';
  target.setAttribute('data-direction', 's');
  host.appendChild(target);

  const event = {
    clientX: 220,
    clientY: 240,
    composedPath: () => [target, host],
    target: host,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as MouseEvent;

  handleSelectionModeMouseDown(event, state, options);

  expect(state.isResizing).toBe(true);
  expect(state.resizeDirection).toBe('s');
  expect(state.dragStartPoint).toEqual({ x: 220, y: 240 });
  expect(state.selectionAtDragStart).toEqual({ x: 120, y: 80, width: 240, height: 160 });
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
});

it('starts dragging when pressing the confirmed frame body', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const target = document.createElement('div');
  target.className = 'sniptale-selection-final-frame';

  const event = {
    clientX: 180,
    clientY: 120,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as MouseEvent;

  handleSelectionModeMouseDown(event, state, options);

  expect(state.isDragging).toBe(true);
  expect(state.isResizing).toBe(false);
  expect(state.dragStartPoint).toEqual({ x: 180, y: 120 });
  expect(state.selectionAtDragStart).toEqual({ x: 120, y: 80, width: 240, height: 160 });
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
});

it('shows hover and selects the inner iframe element instead of the iframe wrapper', () => {
  const { iframe, innerTarget, options, state } = createIframeSelectionFixture();
  const moveEvent = createIframePointerEvent(iframe);

  handleSelectionModeMouseMove(moveEvent, state, options, iframe);
  expect(options.showHoverFrame).toHaveBeenCalledWith(innerTarget, iframe);
  expect(state.hoveredElement).toBe(innerTarget);

  const clickEvent = createIframeClickEvent(iframe);

  handleSelectionModeClick(clickEvent, state, options, iframe);
  expect(options.selectElement).toHaveBeenCalledWith(innerTarget, iframe);
});
