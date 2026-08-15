// @vitest-environment jsdom

import { Canvas, FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';
import { startEditorControllerDrawSession } from './draw-session';
import { addEditorCanvasObject } from './object-add';
import { cancelEditorTransientInteraction } from './transient';
import { endEditorCanvasTransform } from './transform';

it('keeps no-canvas draw-session starts inside the draw-session owner', () => {
  expect(
    startEditorControllerDrawSession({
      canvas: null,
      cropGuide: null,
      object: {} as never,
      prepareObject: vi.fn(),
      start: { x: 0, y: 0 } as never,
      tool: 'shape',
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

it('cancels selection before switching an active drawing tool to select', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const selected = new FabricObject();
  canvas.add(selected);
  canvas.setActiveObject(selected);
  const discardActiveObject = vi.spyOn(canvas, 'discardActiveObject');
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();
  const options = {
    activeTool: 'shape',
    canvas,
    clearCropSelection: vi.fn(),
    cropGuide: null,
    drawSession: null,
    switchToSelectTool,
    syncRuntimeState,
  };

  expect(cancelEditorTransientInteraction(options)).toMatchObject({ changed: true });
  expect(discardActiveObject).toHaveBeenCalledOnce();
  expect(switchToSelectTool).not.toHaveBeenCalled();

  expect(cancelEditorTransientInteraction(options)).toMatchObject({ changed: true });
  expect(switchToSelectTool).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledTimes(2);
  canvas.dispose();
});

it('does not enter Fabric transform finalization while the real canvas is idle', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const endCurrentTransform = vi.spyOn(canvas, 'endCurrentTransform');

  expect(endEditorCanvasTransform(canvas)).toBe(false);
  expect(endCurrentTransform).not.toHaveBeenCalled();

  canvas.dispose();
});
