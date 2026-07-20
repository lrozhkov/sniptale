import { expect, it, vi } from 'vitest';
import { applyEditorToolMode } from './tool-mode';

function createCanvas(
  activeObjects: Array<{
    sniptaleId: string;
    sniptaleLocked: boolean;
    set: ReturnType<typeof vi.fn>;
  }> = []
) {
  const selectedObject = activeObjects[0] ?? {
    sniptaleId: 'selected',
    sniptaleLocked: false,
    set: vi.fn(),
  };
  const otherObject = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn() };
  return {
    canvas: {
      defaultCursor: 'default',
      freeDrawingBrush: null,
      getActiveObjects: () => activeObjects,
      getObjects: () => [selectedObject, otherObject],
      isDrawingMode: false,
      selection: false,
      skipTargetFind: false,
    },
    otherObject,
    selectedObject,
  };
}

it('keeps callout in sticky insertion mode with only the current selection interactive', () => {
  const selected = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const { canvas, otherObject, selectedObject } = createCanvas([selected]);

  applyEditorToolMode({
    activeTool: 'callout' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(canvas.defaultCursor).toBe('crosshair');
  expect(canvas.skipTargetFind).toBe(false);
  expect(selectedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  expect(otherObject.set).toHaveBeenCalledWith({ evented: false, selectable: false });
});

it('covers disabled, raster, select, crop, and null mode branches', () => {
  const clearCropSelection = vi.fn();
  const disabled = createCanvas();
  const raster = createCanvas();
  const select = createCanvas();
  const crop = createCanvas();

  applyEditorToolMode({
    activeTool: 'callout' as never,
    canvas: null,
    clearCropSelection,
    hasCropGuide: true,
  });
  applyEditorToolMode({
    activeTool: 'callout' as never,
    canvas: disabled.canvas as never,
    clearCropSelection,
    enabled: false,
    hasCropGuide: true,
  });
  applyEditorToolMode({
    activeTool: 'selection' as never,
    canvas: raster.canvas as never,
    clearCropSelection,
    hasCropGuide: false,
  });
  applyEditorToolMode({
    activeTool: 'select' as never,
    canvas: select.canvas as never,
    clearCropSelection,
    hasCropGuide: false,
  });
  applyEditorToolMode({
    activeTool: 'crop' as never,
    canvas: crop.canvas as never,
    clearCropSelection,
    hasCropGuide: true,
  });

  expect(disabled.canvas.skipTargetFind).toBe(true);
  expect(raster.canvas.defaultCursor).toBe('not-allowed');
  expect(select.canvas.selection).toBe(true);
  expect(crop.canvas.skipTargetFind).toBe(false);
  expect(clearCropSelection).toHaveBeenCalledOnce();
});
