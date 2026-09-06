// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateDraggingRegion: vi.fn(),
  updateResizingRegion: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  updateDraggingRegion: mocks.updateDraggingRegion,
  updateResizingRegion: mocks.updateResizingRegion,
}));

import {
  bindRegionSelectorRootEvents,
  createRegionSelectorDocumentHandlers,
  detachRegionSelectorListeners,
} from './events';
import { createDefaultRegionSelectorState } from './types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('region-selector root events', () => {
  function createCancelFixture() {
    const overlay = document.createElement('div');
    const region = document.createElement('div');
    const handleRegionCancelled = vi.fn();

    bindRegionSelectorRootEvents({
      overlay,
      region,
      handleRegionCancelled,
      onDragStart: vi.fn(),
      onResizeStart: vi.fn(),
    });

    return { handleRegionCancelled, overlay, region };
  }

  it('cancels when the overlay backdrop itself is clicked', () => {
    const { handleRegionCancelled, overlay } = createCancelFixture();

    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(handleRegionCancelled).toHaveBeenCalledTimes(1);
  });

  it('cancels when a shaded overlay mask is clicked', () => {
    const { handleRegionCancelled, overlay } = createCancelFixture();
    const mask = document.createElement('div');
    mask.dataset['ui'] = 'content.region-mask';
    overlay.append(mask);

    mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(handleRegionCancelled).toHaveBeenCalledTimes(1);
  });
});

describe('region-selector region events', () => {
  function createRegionInteractionFixture() {
    const overlay = document.createElement('div');
    const region = document.createElement('div');
    const resizeHandle = document.createElement('button');
    const regionContent = document.createElement('div');
    const onDragStart = vi.fn();
    const onResizeStart = vi.fn();

    resizeHandle.className = 'sniptale-resize';
    resizeHandle.dataset['corner'] = 'se';
    region.append(resizeHandle, regionContent);

    bindRegionSelectorRootEvents({
      overlay,
      region,
      handleRegionCancelled: vi.fn(),
      onDragStart,
      onResizeStart,
    });

    return { onDragStart, onResizeStart, regionContent, resizeHandle };
  }

  it('starts resizing from resize handles and dragging from the main region surface', () => {
    const { onDragStart, onResizeStart, regionContent, resizeHandle } =
      createRegionInteractionFixture();

    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    regionContent.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onResizeStart).toHaveBeenCalledWith(expect.any(MouseEvent), 'se');
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('starts resizing and dragging from pointer events when host pages block mouse events', () => {
    const { onDragStart, onResizeStart, regionContent, resizeHandle } =
      createRegionInteractionFixture();

    resizeHandle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    regionContent.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(onResizeStart).toHaveBeenCalledWith(expect.any(MouseEvent), 'se');
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});

describe('region-selector document events', () => {
  it('continues move and resize sessions before a host document guard can cancel them', () => {
    const state = createDefaultRegionSelectorState();
    const updateUi = vi.fn();
    const hostGuard = (event: Event) => event.stopImmediatePropagation();
    document.addEventListener('pointermove', hostGuard, { capture: true });
    state.isResizing = true;
    state.resizeCorner = 'se';
    mocks.updateResizingRegion.mockReturnValue({ x: 20, y: 30, width: 340, height: 210 });
    const handlers = createRegionSelectorDocumentHandlers({
      handleRegionCancelled: vi.fn(),
      state,
      updateUi,
    });

    try {
      handlers.bindDocumentEvents();
      document.body.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 180, clientY: 190 })
      );
    } finally {
      detachRegionSelectorListeners({
        handleKeyDown: handlers.handleKeyDown,
        handleMouseMove: handlers.handleMouseMove,
        handleMouseUp: handlers.handleMouseUp,
        handlePointerMove: handlers.handlePointerMove,
        handlePointerUp: handlers.handlePointerUp,
        state,
      });
      document.removeEventListener('pointermove', hostGuard, { capture: true });
    }

    expect(mocks.updateResizingRegion).toHaveBeenCalledOnce();
    expect(updateUi).toHaveBeenCalledOnce();
  });

  it('updates dragging state, handles escape, and detaches the complete listener lifecycle', () => {
    const state = createDefaultRegionSelectorState();
    const handleRegionCancelled = vi.fn();
    const updateUi = vi.fn();
    const nextRegion = { x: 20, y: 30, width: 300, height: 180 };
    state.isDragging = true;
    mocks.updateDraggingRegion.mockReturnValue(nextRegion);
    const handlers = createRegionSelectorDocumentHandlers({
      handleRegionCancelled,
      state,
      updateUi,
    });

    handlers.bindDocumentEvents();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 50 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(mocks.updateDraggingRegion).toHaveBeenCalledWith(
      state.initialRegion,
      expect.any(Object),
      state.dragStart,
      expect.any(MouseEvent)
    );
    expect(state.currentRegion).toBe(nextRegion);
    expect(updateUi).toHaveBeenCalledOnce();
    expect(handleRegionCancelled).toHaveBeenCalledOnce();

    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(state.isDragging).toBe(false);
    detachRegionSelectorListeners({
      handleKeyDown: handlers.handleKeyDown,
      handleMouseMove: handlers.handleMouseMove,
      handleMouseUp: handlers.handleMouseUp,
      handlePointerMove: handlers.handlePointerMove,
      handlePointerUp: handlers.handlePointerUp,
      state,
    });
    expect(state.keyDownHandler).toBeNull();

    state.isDragging = true;
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 70 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 90 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mocks.updateDraggingRegion).toHaveBeenCalledOnce();
    expect(handleRegionCancelled).toHaveBeenCalledOnce();
  });

  it('routes resize movement through the resize geometry owner', () => {
    const state = createDefaultRegionSelectorState();
    const nextRegion = { x: 10, y: 15, width: 320, height: 200 };
    const updateUi = vi.fn();
    state.isResizing = true;
    state.resizeCorner = 'se';
    mocks.updateResizingRegion.mockReturnValue(nextRegion);
    const handlers = createRegionSelectorDocumentHandlers({
      handleRegionCancelled: vi.fn(),
      state,
      updateUi,
    });

    handlers.handlePointerMove(new MouseEvent('pointermove', { clientX: 80, clientY: 90 }));

    expect(mocks.updateResizingRegion).toHaveBeenCalledWith(
      state.initialRegion,
      expect.any(Object),
      state.dragStart,
      'se',
      expect.any(MouseEvent)
    );
    expect(state.currentRegion).toBe(nextRegion);
    expect(updateUi).toHaveBeenCalledOnce();
  });
});
