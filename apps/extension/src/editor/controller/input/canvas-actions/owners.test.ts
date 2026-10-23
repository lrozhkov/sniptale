// @vitest-environment jsdom

import { Canvas, FabricObject, Point, Rect, type Transform } from 'fabric';
import { expect, it, vi } from 'vitest';
import { startEditorControllerDrawSession } from './draw-session';
import { addEditorCanvasObject } from './object-add';
import { cancelEditorTransientInteraction } from './transient';
import { endEditorCanvasTransform } from './transform';
import { createEditorDrawingFabricObject } from '../../../drawing/object/vector';
import { applyEditorDrawingInteractionControls } from '../../../drawing/object/controls/apply';
import { updateEditorDrawingArrowHover } from '../../../drawing/object/controls/arrow';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { createTypedTestFixture } from '../../../testing/fabric-canvas.test-support';

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

it('forwards the initiating pointer into the canonical draw session', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const object = new FabricObject();

  const result = startEditorControllerDrawSession({
    canvas,
    cropGuide: null,
    object,
    pointerId: 7,
    prepareObject: vi.fn(),
    start: new Point(0, 0),
    tool: 'shape',
  });

  expect(result?.drawSession?.pointerId).toBe(7);

  const mouseResult = startEditorControllerDrawSession({
    canvas,
    cropGuide: null,
    object: new FabricObject(),
    prepareObject: vi.fn(),
    start: new Point(0, 0),
    tool: 'shape',
  });
  expect(mouseResult?.drawSession?.pointerId).toBeNull();
  canvas.dispose();
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

it('preserves the active tool on window blur but still resets it on explicit cancellation', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const switchToSelectTool = vi.fn();
  const options = {
    activeTool: 'frame-annotation',
    canvas,
    clearCropSelection: vi.fn(),
    cropGuide: null,
    drawSession: null,
    switchToSelectTool,
    syncRuntimeState: vi.fn(),
  };
  expect(cancelEditorTransientInteraction({ ...options, preserveActiveTool: true })).toEqual({
    changed: false,
    drawSession: null,
  });
  expect(switchToSelectTool).not.toHaveBeenCalled();
  const draft = new Rect({ width: 20, height: 20 });
  canvas.add(draft);
  expect(
    cancelEditorTransientInteraction({
      ...options,
      preserveActiveTool: true,
      drawSession: {
        tool: 'shape',
        pointerId: 1,
        start: new Point(0, 0),
        objectId: 'draft',
        object: draft,
      },
    })
  ).toEqual({ changed: true, drawSession: null });
  expect(canvas.getObjects()).not.toContain(draft);
  expect(switchToSelectTool).not.toHaveBeenCalled();
  expect(cancelEditorTransientInteraction(options).changed).toBe(true);
  expect(switchToSelectTool).toHaveBeenCalledOnce();
  canvas.dispose();
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

it('clears a crop guide through its owner without dropping the active tool', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const clearCropSelection = vi.fn();
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();
  expect(
    cancelEditorTransientInteraction({
      activeTool: 'crop',
      canvas,
      clearCropSelection,
      cropGuide: new Rect({ width: 100, height: 80 }),
      drawSession: null,
      switchToSelectTool,
      syncRuntimeState,
    })
  ).toEqual({ changed: true, drawSession: null });
  expect(clearCropSelection).toHaveBeenCalledOnce();
  expect(switchToSelectTool).not.toHaveBeenCalled();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  canvas.dispose();
});

it('preserves transient state when its canvas has already been disposed', () => {
  const syncRuntimeState = vi.fn();
  expect(
    cancelEditorTransientInteraction({
      activeTool: 'arrow',
      canvas: null,
      clearCropSelection: vi.fn(),
      cropGuide: null,
      drawSession: null,
      switchToSelectTool: vi.fn(),
      syncRuntimeState,
    })
  ).toEqual({ changed: false, drawSession: null });
  expect(syncRuntimeState).not.toHaveBeenCalled();
});

it('cancels a live arrow bend before clearing selection or switching tools', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const drawing = {
    kind: 'arrow' as const,
    id: 'cancel-bend',
    design: 'freehand' as const,
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    color: '#f00',
    width: 12,
    dynamicWidth: false,
  };
  const arrow = createEditorDrawingFabricObject(drawing, 1);
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  applyEditorDrawingInteractionControls(arrow);
  updateEditorDrawingArrowHover(canvas, { x: 120, y: 20 });
  const control = arrow.controls['bend-insert']!;
  const transform = createTypedTestFixture<Transform>({ target: arrow, actionPerformed: false });
  const event = new MouseEvent('mousemove');
  control.mouseDownHandler!(event, transform, 120, 20);
  expect(control.actionHandler(event, transform, 120, 100)).toBe(true);
  canvas._currentTransform = transform;
  transform.actionPerformed = true;
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();
  const modified = vi.fn();
  canvas.on('object:modified', modified);

  expect(
    cancelEditorTransientInteraction({
      activeTool: 'arrow',
      canvas,
      clearCropSelection: vi.fn(),
      cropGuide: null,
      drawSession: null,
      switchToSelectTool,
      syncRuntimeState,
    })
  ).toEqual({ changed: true, drawSession: null });

  expect(readEditorDrawingObject(arrow)).toEqual(drawing);
  expect(canvas.getActiveObject()).toBe(arrow);
  expect(canvas._currentTransform).toBeNull();
  expect(switchToSelectTool).not.toHaveBeenCalled();
  expect(modified).not.toHaveBeenCalled();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  canvas.dispose();
});
