import { expect, it, vi } from 'vitest';
import { applyEditorToolMode } from './tool-mode';

it('keeps the shape library browser in sticky insertion mode', () => {
  const object = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const canvas = {
    defaultCursor: 'crosshair',
    freeDrawingBrush: null,
    getActiveObjects: () => [object],
    getObjects: () => [object],
    isDrawingMode: true,
    selection: false,
    skipTargetFind: true,
  };
  const clearCropSelection = vi.fn();

  applyEditorToolMode({
    activeTool: 'shape-library',
    canvas: canvas as never,
    clearCropSelection,
    hasCropGuide: true,
  });
  applyEditorToolMode({
    activeTool: 'shape-library',
    canvas: null,
    clearCropSelection,
    hasCropGuide: false,
  });

  expect(canvas.isDrawingMode).toBe(false);
  expect(canvas.selection).toBe(false);
  expect(canvas.skipTargetFind).toBe(false);
  expect(object.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  expect(clearCropSelection).toHaveBeenCalledOnce();
});
