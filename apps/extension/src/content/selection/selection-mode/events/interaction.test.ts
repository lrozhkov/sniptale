// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { handleSelectionModeClick } from './commands';
import {
  handleSelectionModeDragStart,
  handleSelectionModeMouseDown,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseUp,
} from './pointer-handlers';
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
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    flushFinalFrameUpdate: vi.fn(),
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

function createSelectionModeMouseEvent({
  clientX = 0,
  clientY = 0,
  path,
  target,
  type,
}: {
  clientX?: number;
  clientY?: number;
  path?: EventTarget[];
  target: EventTarget;
  type: string;
}): MouseEvent {
  const event = new MouseEvent(type, { cancelable: true, clientX, clientY });
  Object.defineProperties(event, {
    composedPath: { configurable: true, value: () => path ?? [target] },
    target: { configurable: true, value: target },
  });
  vi.spyOn(event, 'preventDefault');
  vi.spyOn(event, 'stopPropagation');
  vi.spyOn(event, 'stopImmediatePropagation');
  return event;
}

function createIframePointerEvent(target: HTMLIFrameElement): MouseEvent {
  return createSelectionModeMouseEvent({
    clientX: 18,
    clientY: 10,
    target,
    type: 'mousemove',
  });
}

function createIframeClickEvent(target: HTMLIFrameElement): MouseEvent {
  return createSelectionModeMouseEvent({ clientX: 18, clientY: 10, target, type: 'click' });
}

it('allows click-through for the shared confirm button', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const host = document.createElement('div');
  const target = document.createElement('button');
  target.className = 'sniptale-selection-size-confirm-button';
  host.appendChild(target);

  const event = createSelectionModeMouseEvent({
    path: [target, host],
    target: host,
    type: 'click',
  });

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

  const event = createSelectionModeMouseEvent({
    clientX: 220,
    clientY: 140,
    target,
    type: 'mousedown',
  });

  handleSelectionModeMouseDown(event, state, options);

  expect(state.isDragging).toBe(false);
  expect(state.isResizing).toBe(false);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(event.stopPropagation).not.toHaveBeenCalled();
  expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
});

it('owns idle pointer down before the host page can start native selection work', () => {
  const state = { ...createInteractionState(), currentState: 'idle' as const };
  const options = {
    ...createSelectionModeOptions(),
    isExtensionUIElement: () => false,
  };
  const target = document.createElement('p');
  const event = createSelectionModeMouseEvent({
    clientX: 80,
    clientY: 60,
    target,
    type: 'mousedown',
  });

  handleSelectionModeMouseDown(event, state, options);

  expect(state.mouseDownPoint).toEqual({ x: 80, y: 60 });
  expect(options.startDragSelection).not.toHaveBeenCalled();
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
});

it('draws an area from the nested Wikipedia TOC link and consumes the post-drag click', () => {
  const state: SelectionModeInteractionState = {
    ...createInteractionState(),
    currentState: 'idle',
  };
  const options = {
    ...createSelectionModeOptions(),
    isExtensionUIElement: () => false,
  };
  vi.mocked(options.startDragSelection).mockImplementation(() => {
    state.currentState = 'drag';
  });
  vi.mocked(options.finalizeDragSelection).mockImplementation(() => {
    state.currentState = 'confirmed';
  });
  const listItem = document.createElement('li');
  listItem.id = 'toc-Security';
  listItem.className = 'vector-toc-list-item vector-toc-level-1';
  const anchor = document.createElement('a');
  anchor.className = 'vector-toc-link';
  anchor.href = '#Security';
  const text = document.createElement('div');
  text.className = 'vector-toc-text';
  const number = document.createElement('span');
  number.className = 'vector-toc-numb';
  number.textContent = '4';
  const child = document.createElement('span');
  child.textContent = 'Security';
  text.append(number, child);
  anchor.append(text);
  listItem.append(anchor);
  document.body.append(listItem);

  const down = createSelectionModeMouseEvent({
    clientX: 20,
    clientY: 30,
    path: [child, text, anchor, listItem],
    target: child,
    type: 'mousedown',
  });
  const move = createSelectionModeMouseEvent({
    clientX: 80,
    clientY: 90,
    path: [child, text, anchor, listItem],
    target: child,
    type: 'mousemove',
  });
  const up = createSelectionModeMouseEvent({
    clientX: 80,
    clientY: 90,
    path: [child, text, anchor, listItem],
    target: child,
    type: 'mouseup',
  });
  const click = createSelectionModeMouseEvent({
    clientX: 80,
    clientY: 90,
    path: [child, text, anchor, listItem],
    target: child,
    type: 'click',
  });

  handleSelectionModeMouseDown(down, state, options);
  handleSelectionModeMouseMove(move, state, options);
  handleSelectionModeMouseUp(up, state, options);
  handleSelectionModeClick(click, state, options);

  expect(options.startDragSelection).toHaveBeenCalledWith(20, 30);
  expect(options.updateDragSelection).toHaveBeenCalledWith(80, 90);
  expect(options.finalizeDragSelection).toHaveBeenCalledOnce();
  expect(options.selectElement).not.toHaveBeenCalled();
  expect(click.preventDefault).toHaveBeenCalledOnce();
  expect(click.stopPropagation).toHaveBeenCalledOnce();
  expect(click.stopImmediatePropagation).toHaveBeenCalledOnce();
  expect(state.skipNextClick).toBe(false);
});

it('treats native dragstart from a nested Wikipedia link as area selection', () => {
  const state: SelectionModeInteractionState = {
    ...createInteractionState(),
    currentState: 'idle',
  };
  const options = { ...createSelectionModeOptions(), isExtensionUIElement: () => false };
  vi.mocked(options.startDragSelection).mockImplementation(() => {
    state.currentState = 'drag';
  });
  vi.mocked(options.finalizeDragSelection).mockImplementation(() => {
    state.currentState = 'confirmed';
  });
  const anchor = document.createElement('a');
  anchor.href = '#Phonebook';
  const child = document.createElement('span');
  child.textContent = 'Phonebook';
  anchor.append(child);
  const down = createSelectionModeMouseEvent({
    clientX: 20,
    clientY: 30,
    path: [child, anchor],
    target: child,
    type: 'mousedown',
  });
  const dragStart = createSelectionModeMouseEvent({
    clientX: 28,
    clientY: 38,
    path: [child, anchor],
    target: child,
    type: 'dragstart',
  }) as DragEvent;
  const up = createSelectionModeMouseEvent({
    clientX: 140,
    clientY: 120,
    path: [child, anchor],
    target: child,
    type: 'mouseup',
  });
  const click = createSelectionModeMouseEvent({
    clientX: 140,
    clientY: 120,
    path: [child, anchor],
    target: child,
    type: 'click',
  });

  handleSelectionModeMouseDown(down, state, options);
  handleSelectionModeDragStart(dragStart, state, options);
  handleSelectionModeMouseUp(up, state, options);
  handleSelectionModeClick(click, state, options);

  expect(options.updateDragSelection).toHaveBeenNthCalledWith(1, 28, 38);
  expect(options.updateDragSelection).toHaveBeenNthCalledWith(2, 140, 120);
  expect(options.finalizeDragSelection).toHaveBeenCalledOnce();
  expect(options.selectElement).not.toHaveBeenCalled();
  expect(click.preventDefault).toHaveBeenCalledOnce();
});

it('keeps a short press on a link as element selection', () => {
  const state: SelectionModeInteractionState = {
    ...createInteractionState(),
    currentState: 'idle',
  };
  const options = { ...createSelectionModeOptions(), isExtensionUIElement: () => false };
  vi.mocked(options.startDragSelection).mockImplementation(() => {
    state.currentState = 'drag';
  });
  vi.mocked(options.finalizeDragSelection).mockImplementation(() => {
    state.currentState = 'idle';
  });
  const anchor = document.createElement('a');
  anchor.href = '#Phonebook';
  const child = document.createElement('span');
  anchor.append(child);
  const down = createSelectionModeMouseEvent({
    clientX: 20,
    clientY: 30,
    target: child,
    type: 'mousedown',
  });
  const up = createSelectionModeMouseEvent({
    clientX: 22,
    clientY: 31,
    target: child,
    type: 'mouseup',
  });
  const click = createSelectionModeMouseEvent({
    clientX: 22,
    clientY: 31,
    target: child,
    type: 'click',
  });

  handleSelectionModeMouseDown(down, state, options);
  handleSelectionModeMouseUp(up, state, options);
  expect(options.selectElement).not.toHaveBeenCalled();
  handleSelectionModeClick(click, state, options);

  expect(options.updateDragSelection).not.toHaveBeenCalled();
  expect(options.selectElement).toHaveBeenCalledOnce();
  expect(options.selectElement).toHaveBeenCalledWith(child, undefined);
});

it('captures the current selection as resize start state when dragging a handle', () => {
  const state = createInteractionState();
  const options = createSelectionModeOptions();
  const host = document.createElement('div');
  const target = document.createElement('div');
  target.className = 'sniptale-resize-handle';
  target.setAttribute('data-direction', 's');
  host.appendChild(target);

  const event = createSelectionModeMouseEvent({
    clientX: 220,
    clientY: 240,
    path: [target, host],
    target: host,
    type: 'mousedown',
  });

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

  const event = createSelectionModeMouseEvent({
    clientX: 180,
    clientY: 120,
    target,
    type: 'mousedown',
  });

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
