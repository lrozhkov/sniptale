import { describe, expect, it, vi } from 'vitest';

import { MIN_FRAME_SIZE } from '../layout/portal';
import {
  createInteractiveFrameSizeAdjuster,
  createInteractiveFrameSizeValueHandlers,
} from './updates';

function createTempFrame() {
  return {
    width: 120,
    height: 80,
    x: 10,
    y: 20,
  };
}

describe('interactive frame size update helpers', () => {
  it('clamps adjusted dimensions to the frame bounds and minimum size', () => {
    const applyFrameUpdate = vi.fn((updater) => updater(createTempFrame()));
    const syncWidth = vi.fn((current, newWidth) => ({ ...current, width: newWidth }));
    const syncHeight = vi.fn((current, newHeight) => ({ ...current, height: newHeight }));
    const adjust = createInteractiveFrameSizeAdjuster({
      maxWidth: 160,
      maxHeight: 140,
      applyFrameUpdate,
      syncWidth,
      syncHeight,
    });

    adjust('width', 200);
    adjust('height', -200);

    expect(syncWidth).toHaveBeenCalledWith(expect.objectContaining({ width: 120 }), 160);
    expect(syncHeight).toHaveBeenCalledWith(
      expect.objectContaining({ height: 80 }),
      MIN_FRAME_SIZE
    );
  });

  it('keeps raw handlers capped to max values and normal handlers clamped to the minimum', () => {
    const applyFrameUpdate = vi.fn((updater) => updater(createTempFrame()));
    const syncWidth = vi.fn((current, newWidth) => ({ ...current, width: newWidth }));
    const syncHeight = vi.fn((current, newHeight) => ({ ...current, height: newHeight }));
    const handlers = createInteractiveFrameSizeValueHandlers({
      maxWidth: 150,
      maxHeight: 130,
      applyFrameUpdate,
      syncWidth,
      syncHeight,
    });

    handlers.handleWidthChangeRaw(220);
    handlers.handleHeightChangeRaw(160);
    handlers.handleWidthChange(0);
    handlers.handleHeightChange(0);

    expect(syncWidth).toHaveBeenNthCalledWith(1, expect.any(Object), 150);
    expect(syncHeight).toHaveBeenNthCalledWith(1, expect.any(Object), 130);
    expect(syncWidth).toHaveBeenNthCalledWith(2, expect.any(Object), MIN_FRAME_SIZE);
    expect(syncHeight).toHaveBeenNthCalledWith(2, expect.any(Object), MIN_FRAME_SIZE);
    expect(handlers.handleWidthChangeRaw).not.toBe(handlers.handleWidthChange);
    expect(handlers.handleHeightChangeRaw).not.toBe(handlers.handleHeightChange);
  });
});
