// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

import { applyEditorToolMode } from './application';

it('ignores missing canvases without clearing crop state', () => {
  const clearCropSelection = vi.fn();

  applyEditorToolMode({
    activeTool: 'text',
    canvas: null,
    clearCropSelection,
    hasCropGuide: true,
  });

  expect(clearCropSelection).not.toHaveBeenCalled();
});

it('applies disabled mode as canvas-level state and object interactivity', () => {
  const object = { sniptaleId: 'object', sniptaleLocked: false, set: vi.fn(), visible: true };
  const canvas = {
    defaultCursor: 'crosshair',
    getActiveObjects: () => [object],
    getObjects: () => [object],
    isDrawingMode: true,
    selection: true,
    skipTargetFind: false,
  };
  const clearCropSelection = vi.fn();

  applyEditorToolMode({
    activeTool: 'highlighter',
    canvas: canvas as never,
    clearCropSelection,
    enabled: false,
    hasCropGuide: true,
  });

  expect(canvas.isDrawingMode).toBe(false);
  expect(canvas.selection).toBe(false);
  expect(canvas.skipTargetFind).toBe(true);
  expect(canvas.defaultCursor).toBe('default');
  expect(object.set).toHaveBeenCalledWith({ evented: false, selectable: false });
  expect(clearCropSelection).toHaveBeenCalledOnce();
});
