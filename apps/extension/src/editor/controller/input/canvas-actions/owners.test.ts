// @vitest-environment jsdom

import { Canvas, FabricObject, Group, Point, Rect, type Transform, util } from 'fabric';
import { EditorCanvas } from '../../../document/canvas-surface/render-region';
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

it('restores a native nested transform draft without modification or selection loss on Escape', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 800,
    height: 600,
    preserveObjectStacking: true,
  });
  const child = new Rect({ left: 80, top: 80, width: 60, height: 40 });
  const peer = new Rect({ left: 180, top: 120, width: 30, height: 20 });
  child.sniptaleId = 'child';
  child.sniptaleType = 'shape';
  const group = new Group([child, peer], { angle: 30, scaleX: 2, scaleY: 2 });
  group.sniptaleId = 'parent';
  group.sniptaleType = 'group';
  canvas.add(group);
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(child);
  const before = child.getCoords();
  const peerBefore = peer.getCoords();
  const center = child.getCenterPoint();
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: center.x, clientY: center.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: center.x + 30, clientY: center.y + 15, buttons: 1 })
  );
  expect(child.getCenterPoint().distanceFrom(center)).toBeGreaterThan(10);
  cancelEditorTransientInteraction({
    canvas,
    activeTool: 'select',
    drawSession: null,
    cropGuide: null,
    clearCropSelection: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
  });
  expect(modified).not.toHaveBeenCalled();
  child
    .getCoords()
    .forEach((point, index) => expect(point.distanceFrom(before[index]!)).toBeLessThan(0.001));
  peer
    .getCoords()
    .forEach((point, index) => expect(point.distanceFrom(peerBefore[index]!)).toBeLessThan(0.001));
  expect(canvas.getActiveObject()).toBe(child);
  expect(canvas.getSelectionGroupScope()).toBe(group);
  expect(canvas._currentTransform).toBeNull();
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: center.x + 30, clientY: center.y + 15 }));
  expect(modified).not.toHaveBeenCalled();
  void canvas.dispose();
});

it.each(['br', 'mtr', 'mr'])(
  'restores native %s geometry and text width mode on interruption',
  (key) => {
    const canvas = new EditorCanvas(document.createElement('canvas'), {
      width: 800,
      height: 600,
      preserveObjectStacking: true,
    });
    const object = createEditorDrawingFabricObject(
      key === 'mr'
        ? {
            kind: 'text',
            id: 'draft-text',
            bounds: { x: 100, y: 100, width: 160, height: 40 },
            text: 'Accepted  text',
            fontSize: 24,
            color: '#000000',
            backgroundColor: null,
            autoWidth: true,
            wrapWidth: 240,
          }
        : {
            kind: 'rectangle',
            id: 'draft-rectangle',
            bounds: { x: 100, y: 100, width: 100, height: 60 },
            color: '#000000',
            fillColor: null,
            width: 2,
          },
      1
    );
    applyEditorDrawingInteractionControls(object);
    const group = new Group([object], { angle: 30, scaleX: 2, scaleY: 2 });
    group.sniptaleType = 'group';
    canvas.add(group);
    canvas.enterSelectionGroup(group);
    canvas.setActiveObject(object);
    const before = object.getCoords();
    const metadata = object.sniptaleDrawingJson;
    const width = object.width;
    const automatic = object.sniptaleDrawingTextAutoWidth;
    const modified = vi.fn();
    canvas.on('object:modified', modified);
    const point = object.calcOCoords()[key]!;
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
    canvas.__onMouseMove(
      new MouseEvent('mousemove', { clientX: point.x + 30, clientY: point.y + 20, buttons: 1 })
    );
    expect(canvas._currentTransform?.actionPerformed).toBe(true);
    expect(endEditorCanvasTransform(canvas)).toBe(true);
    expect(object.width).toBe(width);
    expect(object.sniptaleDrawingTextAutoWidth).toBe(automatic);
    expect(object.sniptaleDrawingJson).toBe(metadata);
    object
      .getCoords()
      .forEach((corner, index) => expect(corner.distanceFrom(before[index]!)).toBeLessThan(0.001));
    expect(modified).not.toHaveBeenCalled();
    expect(canvas.getActiveObject()).toBe(object);
    void canvas.dispose();
  }
);

it('commits a normally released native transform once after a prior cancellation', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const object = new Rect({ left: 100, top: 100, width: 80, height: 60 });
  canvas.add(object);
  canvas.setActiveObject(object);
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  const point = object.getCenterPoint();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: point.x + 20, clientY: point.y + 10, buttons: 1 })
  );
  endEditorCanvasTransform(canvas);
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: point.x + 20, clientY: point.y + 10 }));
  expect(modified).not.toHaveBeenCalled();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: point.x + 20, clientY: point.y + 10, buttons: 1 })
  );
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: point.x + 20, clientY: point.y + 10 }));
  expect(modified).toHaveBeenCalledOnce();
  expect(object.getCenterPoint().distanceFrom(point)).toBeCloseTo(Math.hypot(20, 10), 5);
  void canvas.dispose();
});

it('restores accepted path and drawing metadata after interrupting a native arrow endpoint drag', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const object = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'endpoint-draft',
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
      width: 8,
      color: '#000000',
      dynamicWidth: false,
    },
    1
  );
  applyEditorDrawingInteractionControls(object);
  canvas.add(object);
  canvas.setActiveObject(object);
  const before = object.toObject();
  const drawing = readEditorDrawingObject(object);
  const point = object.calcOCoords()['end']!;
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: point.x + 30, clientY: point.y + 40, buttons: 1 })
  );
  expect(readEditorDrawingObject(object)).not.toEqual(drawing);
  endEditorCanvasTransform(canvas);
  expect(object.toObject()).toEqual(before);
  expect(readEditorDrawingObject(object)).toEqual(drawing);
  expect(modified).not.toHaveBeenCalled();
  void canvas.dispose();
});

it('moves a grouped arrow endpoint to the pointer in scene coordinates under a transformed parent', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const object = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'nested-endpoint',
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
      width: 8,
      color: '#000000',
      dynamicWidth: false,
    },
    1
  );
  applyEditorDrawingInteractionControls(object);
  const group = new Group([object], { angle: 30, scaleX: 2, scaleY: 2 });
  group.sniptaleType = 'group';
  canvas.add(group);
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(object);
  const point = object.calcOCoords()['end']!;
  const expected = new Point(point.x + 30, point.y + 40);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', {
      clientX: expected.x,
      clientY: expected.y,
      buttons: 1,
      altKey: true,
    })
  );
  const actual = object.calcOCoords()['end']!;
  expect(new Point(actual.x, actual.y).distanceFrom(expected)).toBeLessThan(0.001);
  endEditorCanvasTransform(canvas);
  void canvas.dispose();
});

it('keeps a grouped bend at the scene pointer and restores its authored metadata on cancel', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const drawing = {
    kind: 'arrow' as const,
    id: 'nested-bend',
    design: 'freehand' as const,
    start: { x: 100, y: 200 },
    end: { x: 300, y: 200 },
    bendPoints: [{ x: 200, y: 250 }],
    width: 8,
    color: '#000000',
    dynamicWidth: false,
  };
  const object = createEditorDrawingFabricObject(drawing, 1);
  applyEditorDrawingInteractionControls(object);
  const basis = util.invertTransform(object.calcTransformMatrix());
  const group = new Group([object], { angle: 30, scaleX: 2, scaleY: 2 });
  group.sniptaleType = 'group';
  canvas.add(group);
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(object);
  const point = object.calcOCoords()['bend-0']!;
  const expected = new Point(point.x + 20, point.y + 30);
  const modified = vi.fn();
  canvas.on('object:modified', modified);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: expected.x, clientY: expected.y, buttons: 1 })
  );
  const actual = object.calcOCoords()['bend-0']!;
  expect(new Point(actual.x, actual.y).distanceFrom(expected)).toBeLessThan(0.001);
  endEditorCanvasTransform(canvas);
  expect(readEditorDrawingObject(object)).toEqual(drawing);
  const restored = object.calcOCoords()['bend-0']!;
  expect(new Point(restored.x, restored.y).distanceFrom(new Point(point.x, point.y))).toBeLessThan(
    0.001
  );
  const candidate = new Point(143.75, 228.125)
    .transform(basis)
    .transform(object.calcTransformMatrix());
  updateEditorDrawingArrowHover(canvas, candidate);
  expect(object.isControlVisible('bend-insert')).toBe(true);
  expect(modified).not.toHaveBeenCalled();
  void canvas.dispose();
});

it('retains the accepted layer selection on focus loss while explicit cancellation clears it', async () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const layer = new Rect({ width: 20, height: 20 });
  canvas.add(layer);
  canvas.setActiveObject(layer);
  const options = {
    activeTool: 'select',
    canvas,
    clearCropSelection: vi.fn(),
    cropGuide: null,
    drawSession: null,
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    preserveActiveTool: true,
    preserveSelection: true,
  };
  try {
    expect(cancelEditorTransientInteraction(options).changed).toBe(false);
    expect(canvas.getActiveObject()).toBe(layer);
    expect(cancelEditorTransientInteraction({ ...options, preserveSelection: false }).changed).toBe(
      true
    );
    expect(canvas.getActiveObject()).toBeUndefined();
  } finally {
    await canvas.dispose();
  }
});
