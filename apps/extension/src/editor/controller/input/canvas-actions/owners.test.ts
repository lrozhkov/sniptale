import { expect, it, vi } from 'vitest';
import { startEditorControllerDrawSession } from './draw-session';
import { addEditorCanvasObject } from './object-add';
import { cancelEditorTransientInteraction } from './transient';

it('keeps no-canvas draw-session starts inside the draw-session owner', () => {
  expect(
    startEditorControllerDrawSession({
      canvas: null,
      cropGuide: null,
      object: {} as never,
      prepareObject: vi.fn(),
      start: { x: 0, y: 0 } as never,
      tool: 'rectangle',
    })
  ).toBeNull();
});

it('keeps canvas object add lifecycle inside the object-add owner', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const object = {};
  const prepareObject = vi.fn();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  addEditorCanvasObject({
    canvas: canvas as never,
    commitHistory,
    object: object as never,
    prepareObject,
    syncRuntimeState,
  });

  expect(prepareObject).toHaveBeenCalledWith(object);
  expect(canvas.add).toHaveBeenCalledWith(object);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(object);
  expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
  expect(commitHistory).toHaveBeenCalledTimes(1);
  expect(syncRuntimeState).toHaveBeenCalledTimes(1);
});

it('keeps transient cancellation mutations inside the transient owner', () => {
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObjects: vi.fn(() => []),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };

  expect(
    cancelEditorTransientInteraction({
      activeTool: 'select',
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      cropGuide: null,
      drawSession: null,
      switchToSelectTool: vi.fn(),
      syncRuntimeState: vi.fn(),
    })
  ).toEqual({ changed: false, drawSession: null });

  expect(canvas.requestRenderAll).not.toHaveBeenCalled();
});
