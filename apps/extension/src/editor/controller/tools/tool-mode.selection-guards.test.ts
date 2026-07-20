// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { applyEditorToolMode } from './tool-mode';

it('keeps selection interactivity when the active object is represented by a matching sniptaleId', () => {
  const selectedCanvasObject = {
    sniptaleId: 'ghost',
    sniptaleLocked: false,
    set: vi.fn(),
  };
  const activeSelectionHandle = {
    sniptaleId: 'ghost',
    sniptaleLocked: false,
    set: vi.fn(),
  };
  const canvas = {
    defaultCursor: 'default',
    freeDrawingBrush: null,
    getActiveObjects: () => [activeSelectionHandle],
    getObjects: () => [selectedCanvasObject],
    isDrawingMode: false,
    selection: false,
    skipTargetFind: false,
  };

  applyEditorToolMode({
    activeTool: 'select' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(selectedCanvasObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  expect(canvas.selection).toBe(true);
});

it('keeps crop disable flow from clearing the crop selection twice', () => {
  const object = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
  const clearCropSelection = vi.fn();
  const canvas = {
    defaultCursor: 'crosshair',
    freeDrawingBrush: null,
    getActiveObjects: () => [object],
    getObjects: () => [object],
    isDrawingMode: true,
    selection: true,
    skipTargetFind: false,
  };

  applyEditorToolMode({
    activeTool: 'crop' as never,
    canvas: canvas as never,
    clearCropSelection,
    enabled: false,
    hasCropGuide: true,
  });

  expect(canvas.defaultCursor).toBe('default');
  expect(clearCropSelection).not.toHaveBeenCalled();
});

it('keeps locked objects selectable in select mode but unavailable to raster tools', () => {
  const lockedObject = { sniptaleId: 'locked', sniptaleLocked: true, set: vi.fn() };
  const canvas = {
    defaultCursor: 'default',
    freeDrawingBrush: null,
    getActiveObjects: () => [],
    getObjects: () => [lockedObject],
    isDrawingMode: false,
    selection: false,
    skipTargetFind: false,
  };

  applyEditorToolMode({
    activeTool: 'select' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  expect(lockedObject.set).toHaveBeenLastCalledWith({ evented: true, selectable: true });

  applyEditorToolMode({
    activeTool: 'brush' as never,
    canvas: canvas as never,
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  expect(lockedObject.set).toHaveBeenLastCalledWith(
    expect.objectContaining({ evented: false, selectable: false })
  );
});
