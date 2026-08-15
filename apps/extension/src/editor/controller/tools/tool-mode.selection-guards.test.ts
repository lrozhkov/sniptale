// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createFabricCanvasFixture } from '../../testing/fabric-canvas.test-support';
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
    activeTool: 'select',
    canvas: createFabricCanvasFixture(canvas),
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
    activeTool: 'crop',
    canvas: createFabricCanvasFixture(canvas),
    clearCropSelection,
    enabled: false,
    hasCropGuide: true,
  });

  expect(canvas.defaultCursor).toBe('default');
  expect(clearCropSelection).not.toHaveBeenCalled();
});

it('keeps locked objects outside hit-testing in every tool mode', () => {
  const lockedObject = {
    sniptaleId: 'locked',
    sniptaleLocked: true,
    sniptaleType: 'shape',
    set: vi.fn(),
  };
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
    activeTool: 'select',
    canvas: createFabricCanvasFixture(canvas),
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  expect(lockedObject.set).toHaveBeenLastCalledWith({ evented: false, selectable: false });

  applyEditorToolMode({
    activeTool: 'pencil',
    canvas: createFabricCanvasFixture(canvas),
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  expect(lockedObject.set).toHaveBeenLastCalledWith(
    expect.objectContaining({ evented: false, selectable: false })
  );

  lockedObject.sniptaleType = 'text';
  applyEditorToolMode({
    activeTool: 'text',
    canvas: createFabricCanvasFixture(canvas),
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });
  expect(lockedObject.set).toHaveBeenLastCalledWith({ evented: false, selectable: false });
});

it('keeps the drawing cursor owned by the active tool mode', () => {
  const canvas = {
    defaultCursor: 'default',
    freeDrawingBrush: null,
    getActiveObjects: () => [],
    getObjects: () => [],
    isDrawingMode: false,
    selection: true,
    skipTargetFind: false,
  };

  applyEditorToolMode({
    activeTool: 'pencil',
    canvas: createFabricCanvasFixture(canvas),
    clearCropSelection: vi.fn(),
    hasCropGuide: false,
  });

  expect(canvas.defaultCursor).toBe('crosshair');
  expect(canvas.selection).toBe(false);
});
