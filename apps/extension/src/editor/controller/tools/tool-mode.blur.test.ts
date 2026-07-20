// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { applyEditorToolMode } from './tool-mode';

function createCanvas(options: {
  activeObjects?: Array<{
    sniptaleId: string;
    sniptaleLocked: boolean;
    set: ReturnType<typeof vi.fn>;
  }>;
  allObjects?: Array<{
    sniptaleId: string;
    sniptaleLocked: boolean;
    set: ReturnType<typeof vi.fn>;
  }>;
}) {
  const activeObjects = options.activeObjects ?? [];
  const allObjects = options.allObjects ?? activeObjects;
  return {
    defaultCursor: 'default',
    freeDrawingBrush: null,
    getActiveObjects: () => activeObjects,
    getObjects: () => allObjects,
    isDrawingMode: false,
    selection: false,
    skipTargetFind: false,
  };
}

it('keeps blur in sticky selection mode without enabling drawing mode', () => {
  const selectedObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const otherObject = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn() };
  const canvas = createCanvas({
    activeObjects: [selectedObject],
    allObjects: [selectedObject, otherObject],
  });
  canvas.isDrawingMode = true;
  canvas.skipTargetFind = true;

  applyEditorToolMode({
    activeTool: 'blur' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(canvas.isDrawingMode).toBe(false);
  expect(canvas.defaultCursor).toBe('crosshair');
  expect(canvas.skipTargetFind).toBe(false);
  expect(selectedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  expect(otherObject.set).toHaveBeenCalledWith({ evented: false, selectable: false });
});

it('keeps crop mode non-sticky and preserves the crop guide while tool mode stays enabled', () => {
  const object = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const clearCropSelection = vi.fn();
  const canvas = createCanvas({ activeObjects: [object], allObjects: [object] });
  canvas.isDrawingMode = true;
  canvas.selection = true;

  applyEditorToolMode({
    activeTool: 'crop' as never,
    canvas: canvas as never,
    clearCropSelection,
    hasCropGuide: true,
  });

  expect(canvas.isDrawingMode).toBe(false);
  expect(canvas.selection).toBe(false);
  expect(canvas.skipTargetFind).toBe(false);
  expect(canvas.defaultCursor).toBe('crosshair');
  expect(clearCropSelection).not.toHaveBeenCalled();
});

it('uses text cursor mode and no-ops cleanly when the canvas is missing', () => {
  const textObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const canvas = createCanvas({ activeObjects: [textObject], allObjects: [textObject] });

  applyEditorToolMode({
    activeTool: 'text' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  applyEditorToolMode({
    activeTool: 'image' as never,
    canvas: null,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(canvas.defaultCursor).toBe('text');
  expect(canvas.selection).toBe(false);
  expect(textObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
});

it('covers remaining tool-mode union cases without widening controller semantics', () => {
  const remainingTools = [
    { tool: 'pencil', drawing: true, hasSelection: false, skipTargetFind: false },
    { tool: 'rough-shape', drawing: false, hasSelection: true, skipTargetFind: false },
    { tool: 'ellipse', drawing: false, hasSelection: true, skipTargetFind: false },
    { tool: 'diamond', drawing: false, hasSelection: true, skipTargetFind: false },
    { tool: 'arrow', drawing: false, hasSelection: true, skipTargetFind: false },
    { tool: 'step', drawing: false, hasSelection: true, skipTargetFind: false },
    { tool: 'image', drawing: false, hasSelection: true, skipTargetFind: true },
  ] as const;

  remainingTools.forEach(({ tool, drawing, hasSelection, skipTargetFind }) => {
    const object = { sniptaleId: `${tool}-selected`, sniptaleLocked: false, set: vi.fn() };
    const canvas = createCanvas({
      activeObjects: hasSelection ? [object] : [],
      allObjects: [object],
    });

    applyEditorToolMode({
      activeTool: tool as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: false,
    });

    expect(canvas.isDrawingMode).toBe(drawing);
    expect(canvas.skipTargetFind).toBe(skipTargetFind);
    expect(canvas.defaultCursor).toBe('crosshair');
  });
});

it('covers disabled and raster target-only tool-mode branches', () => {
  const selectedObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const otherObject = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn() };
  const clearCropSelection = vi.fn();
  const disabledCanvas = createCanvas({
    activeObjects: [selectedObject],
    allObjects: [selectedObject, otherObject],
  });

  applyEditorToolMode({
    activeTool: 'rectangle' as never,
    canvas: disabledCanvas as never,
    clearCropSelection,
    enabled: false,
    hasCropGuide: true,
  });

  expect(disabledCanvas.skipTargetFind).toBe(true);
  expect(disabledCanvas.defaultCursor).toBe('default');
  expect(clearCropSelection).toHaveBeenCalledOnce();

  const rasterCanvas = createCanvas({
    activeObjects: [selectedObject],
    allObjects: [selectedObject, otherObject],
  });
  applyEditorToolMode({
    activeTool: 'eraser' as never,
    canvas: rasterCanvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(rasterCanvas.skipTargetFind).toBe(false);
  expect(rasterCanvas.selection).toBe(false);
  expect(rasterCanvas.defaultCursor).not.toBe('default');
});
