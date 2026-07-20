// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { bindRegionSelectorRootEvents } from './events';

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
