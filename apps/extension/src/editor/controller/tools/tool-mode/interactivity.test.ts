import { expect, it, vi } from 'vitest';

import { setCanvasObjectInteractivity } from './interactivity';

it('makes only the selected editable object interactive in selection-owner mode', () => {
  const selected = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn(), visible: true };
  const other = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn(), visible: true };
  const canvas = {
    getActiveObjects: () => [selected],
    getObjects: () => [selected, other],
  };

  setCanvasObjectInteractivity(canvas as never, 'selection');

  expect(selected.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  expect(other.set).toHaveBeenCalledWith({ evented: false, selectable: false });
});

it('applies raster target patches only to mutable editable objects', () => {
  const unlocked = {
    hasControls: true,
    hoverCursor: 'move',
    lockMovementX: false,
    lockMovementY: false,
    lockScalingX: false,
    lockScalingY: false,
    moveCursor: 'move',
    sniptaleId: 'unlocked',
    sniptaleLocked: false,
    set: vi.fn(),
    visible: true,
  };
  const locked = {
    sniptaleId: 'locked',
    sniptaleLocked: true,
    set: vi.fn(),
    visible: true,
  };
  const canvas = {
    getActiveObjects: () => [],
    getObjects: () => [unlocked, locked],
  };

  setCanvasObjectInteractivity(canvas as never, 'target-only', 'eraser');

  expect(unlocked.set).toHaveBeenCalledWith(
    expect.objectContaining({
      evented: true,
      hoverCursor: 'none',
      selectable: false,
    })
  );
  expect(locked.set).toHaveBeenCalledWith(
    expect.objectContaining({
      evented: false,
      selectable: false,
    })
  );
});
