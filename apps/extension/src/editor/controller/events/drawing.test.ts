// @vitest-environment jsdom

import { FabricObject } from 'fabric';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateTextTarget: vi.fn(),
  appendSamples: vi.fn((samples: unknown[] = [], additions: unknown[] = []) => [
    ...samples,
    ...additions,
  ]),
  complete: vi.fn(),
  createBlur: vi.fn(() => ({ set: vi.fn(), setCoords: vi.fn() })),
  createBounds: vi.fn(() => ({ x: 1, y: 2, width: 30, height: 40 })),
  createDrawing: vi.fn(),
  createFabric: vi.fn(() => ({ sniptaleId: 'draft-1' })),
  cropDown: vi.fn(() => false),
  isTextTarget: vi.fn(() => false),
  isDrawingSelection: vi.fn(() => false),
  readDrawing: vi.fn(),
  replaceFabric: vi.fn(() => ({ sniptaleId: 'replacement' })),
  state: {
    toolSettings: {
      text: {
        backgroundColor: null,
        color: '#111111',
        fontFamily: 'handwritten',
        fontSize: 24,
      },
    },
  },
  stepDown: vi.fn(),
  updateDrawing: vi.fn(),
  updatePath: vi.fn(() => false),
  updateShape: vi.fn(() => true),
  writeDrawing: vi.fn(),
}));

vi.mock('../../../features/drawing/public', () => ({
  appendDrawingSamples: mocks.appendSamples,
  clampDrawingTextWidth: vi.fn(() => 80),
  createDrawingBounds: mocks.createBounds,
  createDrawingObject: mocks.createDrawing,
  resolveDrawingTextHeight: vi.fn(() => 34),
  updateCreatedDrawingObject: mocks.updateDrawing,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => mocks.state },
}));
vi.mock('../crop-workflow/pointer', () => ({ cropDown: mocks.cropDown }));
vi.mock('./text-target', () => ({
  activateTextTarget: mocks.activateTextTarget,
  isTextTarget: mocks.isTextTarget,
}));
vi.mock('./draw-completion', () => ({ completeDrawWorkflowFromBindings: mocks.complete }));
vi.mock('../tools/step-drawing/pointer', () => ({ handleStepMouseDown: mocks.stepDown }));
vi.mock('../../drawing/object/metadata', () => ({
  isEditorDrawingSelection: mocks.isDrawingSelection,
  readEditorDrawingObject: mocks.readDrawing,
  synchronizeEditorDrawingObjectFromFabric: vi.fn(),
  syncEditorDrawingTextObject: vi.fn(),
  translateEditorDrawingObject: vi.fn(),
  writeEditorDrawingObject: mocks.writeDrawing,
  stageEditorDrawingObject: vi.fn(),
}));
vi.mock('../../drawing/object/vector', () => ({
  applyEditorDrawingTextVisuals: vi.fn(),
  createEditorDrawingFabricObject: mocks.createFabric,
  renderEditorDrawingTextBackground: vi.fn(),
  replaceEditorDrawingFabricGeometry: mocks.replaceFabric,
  synchronizeEditorDrawingTextLayout: vi.fn(),
  updateEditorDrawingPathDraft: mocks.updatePath,
  updateEditorDrawingShapeDraft: mocks.updateShape,
}));
vi.mock('../../drawing/object/blur', () => ({
  clearLegacyBlurMetadata: vi.fn(),
  createEditorDrawingBlurObject: mocks.createBlur,
  refreshEditorDrawingBlurObject: vi.fn(),
}));

import { createEditorDrawingEventHandlers } from './drawing';

function createCanvas() {
  return {
    _currentTransform: null as null | Record<string, unknown>,
    add: vi.fn(),
    discardActiveObject: vi.fn(),
    endCurrentTransform: vi.fn(),
    getActiveObjects: vi.fn<() => unknown[]>(() => []),
    getScenePoint: vi.fn(
      (event: { point?: { x: number; y: number } }) => event.point ?? { x: 10, y: 20 }
    ),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setCursor: vi.fn(),
    setActiveObject: vi.fn(),
    upperCanvasEl: document.createElement('canvas'),
  };
}

function createBindings(tool = 'pencil') {
  const canvas = createCanvas();
  const bindings = {
    commitHistory: vi.fn(),
    cancelTransientInteraction: vi.fn(() => false),
    getActiveTool: vi.fn(() => tool),
    getCanvas: vi.fn(() => canvas),
    getDrawSession: vi.fn(() => null as null | Record<string, unknown>),
    getSource: vi.fn(() => ({ id: 'source-1' })),
    nextLabelIndex: vi.fn(() => 1),
    prepareObject: vi.fn(),
    setDrawSession: vi.fn(),
    startDrawSession: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
  return { bindings, canvas, handlers: createEditorDrawingEventHandlers(bindings as never) };
}

function pointerEvent(patch: Record<string, unknown> = {}): {
  e: Record<string, unknown>;
  target?: Record<string, unknown>;
} {
  return { e: { button: 0, ctrlKey: false, shiftKey: false, timeStamp: 10, ...patch } };
}

function fabricPointerEvent(pointerId: number): { e: MouseEvent } {
  const event = new MouseEvent('mousedown', { button: 0 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return { e: event };
}

function resetDrawingMocks() {
  vi.clearAllMocks();
  mocks.cropDown.mockReturnValue(false);
  mocks.isTextTarget.mockReturnValue(false);
  mocks.isDrawingSelection.mockReturnValue(false);
  mocks.updatePath.mockReturnValue(false);
  mocks.updateShape.mockReturnValue(true);
}

describe('shared drawing event orchestration', () => {
  beforeEach(resetDrawingMocks);

  it('routes drawing starts and ignores non-drawing pointer paths', () => {
    const ignored = createBindings('select');
    ignored.handlers.handleMouseDown(pointerEvent() as never);
    ignored.handlers.handleMouseDown(pointerEvent({ button: 2 }) as never);
    expect(mocks.createDrawing).not.toHaveBeenCalled();

    const cropped = createBindings('crop');
    mocks.cropDown.mockReturnValueOnce(true);
    cropped.handlers.handleMouseDown(pointerEvent() as never);
    expect(mocks.cropDown).toHaveBeenCalled();

    const step = createBindings('step');
    step.handlers.handleMouseDown(pointerEvent() as never);
    expect(mocks.stepDown).toHaveBeenCalled();
    expect(step.bindings.commitHistory).toHaveBeenCalledOnce();
    expect(step.bindings.syncRuntimeState).toHaveBeenCalledOnce();

    const frame = createBindings('frame-annotation');
    frame.handlers.handleMouseDown(pointerEvent() as never);
    expect(frame.bindings.startDrawSession).not.toHaveBeenCalled();
    expect(frame.handlers.handlePathCreated({} as never)).toBeUndefined();
    expect(frame.handlers.handleMouseDownBefore({} as never)).toBeUndefined();
  });

  it('creates shared vector, shape, text, and blur drafts through their canonical owners', () => {
    const pencilDrawing = {
      id: 'pencil-1',
      kind: 'pencil',
      color: '#111111',
      width: 4,
      samples: [{ x: 10, y: 20, t: 10 }],
    };
    mocks.createDrawing.mockReturnValueOnce(pencilDrawing);
    const pencil = createBindings('pencil');
    pencil.canvas.getActiveObjects.mockReturnValueOnce([{}]);
    pencil.handlers.handleMouseDown(pointerEvent() as never);
    expect(pencil.canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(mocks.createFabric).toHaveBeenCalledWith(pencilDrawing, 1);
    expect(pencil.bindings.prepareObject).toHaveBeenCalled();
    expect(pencil.bindings.startDrawSession).toHaveBeenCalledWith(
      'pencil',
      { x: 10, y: 20 },
      expect.any(Object)
    );

    const shapeDrawing = {
      id: 'shape-1',
      kind: 'rectangle',
      bounds: { x: 10, y: 20, width: 1, height: 1 },
      color: '#111111',
      fillColor: null,
      width: 4,
    };
    mocks.createDrawing.mockReturnValueOnce(shapeDrawing);
    const shape = createBindings('shape');
    shape.handlers.handleMouseDown(pointerEvent() as never);
    expect(mocks.createFabric).toHaveBeenCalledWith(shapeDrawing, 1);

    const text = createBindings('text');
    text.handlers.handleMouseDown(pointerEvent() as never);
    expect(mocks.createFabric).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text', text: '', fontFamily: 'handwritten' }),
      1
    );

    const blur = createBindings('blur');
    blur.handlers.handleMouseDown(pointerEvent() as never);
    expect(mocks.createBlur).toHaveBeenCalledWith(
      expect.objectContaining({ drawing: expect.objectContaining({ kind: 'blur' }) })
    );
    expect(blur.bindings.startDrawSession).toHaveBeenCalledWith(
      'blur',
      { x: 10, y: 20 },
      expect.any(Object)
    );
  });

  it('updates blur bounds, live paths, and replacement geometry', () => {
    const blurObject = { set: vi.fn(), setCoords: vi.fn() };
    const blurDrawing = { id: 'blur-1', kind: 'blur', bounds: { x: 1, y: 2, width: 1, height: 1 } };
    const blur = createBindings('blur');
    blur.bindings.getDrawSession.mockReturnValue({
      object: blurObject,
      start: { x: 1, y: 2 },
      tool: 'blur',
    });
    mocks.readDrawing.mockReturnValueOnce(blurDrawing);
    mocks.updateDrawing.mockReturnValueOnce(blurDrawing);
    blur.handlers.handleMouseMove(pointerEvent({ point: { x: 31, y: 42 } }) as never);
    expect(blurObject.set).toHaveBeenCalledWith({ left: 1, top: 2, width: 30, height: 40 });
    expect(mocks.writeDrawing).toHaveBeenCalledWith(
      blurObject,
      expect.objectContaining({ bounds: { x: 1, y: 2, width: 30, height: 40 } })
    );

    const path = createBindings('pencil');
    const pathObject = { id: 'path-object' };
    path.bindings.getDrawSession.mockReturnValue({
      object: pathObject,
      start: { x: 1, y: 2 },
      tool: 'pencil',
    });
    const current = { id: 'pencil-1', kind: 'pencil' };
    const next = { id: 'pencil-1', kind: 'pencil' };
    mocks.readDrawing.mockReturnValue(current);
    mocks.updateDrawing.mockReturnValue(next);
    mocks.updatePath.mockReturnValueOnce(true);
    path.handlers.handleMouseMove(pointerEvent() as never);
    expect(mocks.updatePath).toHaveBeenCalledWith(pathObject, expect.objectContaining(next), {
      preview: true,
    });

    mocks.updatePath.mockReturnValueOnce(false);
    path.handlers.handleMouseMove(pointerEvent() as never);
    expect(path.canvas.remove).toHaveBeenCalledWith(pathObject);
    expect(path.canvas.add).toHaveBeenCalledWith(
      expect.objectContaining({ sniptaleId: 'replacement' })
    );
    expect(path.bindings.setDrawSession).toHaveBeenCalled();
  });

  it('expands a crop guide from its pointer origin without shared drawing metadata', () => {
    const cropObject = { set: vi.fn(), setCoords: vi.fn() };
    const crop = createBindings('crop');
    crop.bindings.getDrawSession.mockReturnValue({
      object: cropObject,
      start: { x: 1, y: 2 },
      tool: 'crop',
    });
    mocks.createBounds.mockReturnValueOnce({ x: 1, y: 2, width: 30, height: 40 });

    crop.handlers.handleMouseMove({
      e: new MouseEvent('mousemove', { bubbles: true, clientX: 31, clientY: 42 }),
    });

    expect(mocks.readDrawing).not.toHaveBeenCalled();
    expect(cropObject.set).toHaveBeenCalledWith({
      height: 40,
      left: 1,
      scaleX: 1,
      scaleY: 1,
      top: 2,
      width: 30,
    });
    expect(cropObject.setCoords).toHaveBeenCalledOnce();
    expect(crop.canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('continues and completes a drawing when the pointer leaves the Fabric canvas', () => {
    const path = createBindings('marker');
    const pathObject = { id: 'path-object' };
    path.bindings.getDrawSession.mockReturnValue({
      object: pathObject,
      start: { x: 1, y: 2 },
      tool: 'marker',
    });
    const current = { id: 'marker-1', kind: 'marker' };
    const next = { id: 'marker-1', kind: 'marker' };
    mocks.readDrawing.mockReturnValue(current);
    mocks.updateDrawing.mockReturnValue(next);
    mocks.updatePath.mockReturnValue(true);

    const outside = document.createElement('div');
    const move = new MouseEvent('mousemove', { bubbles: true });
    Object.defineProperty(move, 'target', { value: outside });
    path.handlers.handleMouseMove({ e: move });

    expect(mocks.appendSamples).toHaveBeenCalledOnce();
    expect(mocks.updatePath).toHaveBeenCalledWith(pathObject, expect.objectContaining(next), {
      preview: true,
    });

    path.handlers.handleMouseUp();
    expect(mocks.complete).toHaveBeenCalledWith(path.bindings);
  });
});

describe('drawing pointer continuity', () => {
  beforeEach(resetDrawingMocks);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps drawing from the window move fallback when Fabric drops an in-canvas move', () => {
    const path = createBindings('pencil');
    const pathObject = { id: 'path-object' };
    path.bindings.getDrawSession.mockReturnValue({
      object: pathObject,
      start: { x: 1, y: 2 },
      tool: 'pencil',
    });
    mocks.readDrawing.mockReturnValue({ id: 'pencil-1', kind: 'pencil' });
    mocks.updateDrawing.mockReturnValue({ id: 'pencil-1', kind: 'pencil' });
    mocks.updatePath.mockReturnValue(true);
    const move = new MouseEvent('mousemove', { bubbles: true });
    path.canvas.upperCanvasEl.dispatchEvent(move);

    path.handlers.handleMouseMove({ e: move });

    expect(mocks.appendSamples).toHaveBeenCalledOnce();
    expect(mocks.updatePath).toHaveBeenCalledOnce();
  });

  it('deduplicates a move handled by both Fabric and the window fallback', () => {
    const path = createBindings('marker');
    const pathObject = { id: 'path-object' };
    path.bindings.getDrawSession.mockReturnValue({
      object: pathObject,
      start: { x: 1, y: 2 },
      tool: 'marker',
    });
    mocks.readDrawing.mockReturnValue({ id: 'marker-1', kind: 'marker' });
    mocks.updateDrawing.mockReturnValue({ id: 'marker-1', kind: 'marker' });
    mocks.updatePath.mockReturnValue(true);
    const move = new MouseEvent('mousemove', { bubbles: true });

    path.handlers.handleMouseMove({ e: move });
    path.handlers.handleMouseMove({ e: move });

    expect(mocks.appendSamples).toHaveBeenCalledOnce();
    expect(mocks.updatePath).toHaveBeenCalledOnce();
  });

  it('starts resizing a geometric draft on the first window move without a hold delay', () => {
    const shape = createBindings('shape');
    const shapeObject = { id: 'shape-object' };
    shape.bindings.getDrawSession.mockReturnValue({
      object: shapeObject,
      start: { x: 1, y: 2 },
      tool: 'shape',
    });
    mocks.readDrawing.mockReturnValue({ id: 'shape-1', kind: 'rectangle' });
    mocks.updateDrawing.mockReturnValue({ id: 'shape-1', kind: 'rectangle' });
    const move = new MouseEvent('mousemove', { bubbles: true });

    shape.handlers.handleMouseMove({ e: move });

    expect(mocks.updateShape).toHaveBeenCalledWith(
      shapeObject,
      expect.objectContaining({ id: 'shape-1', kind: 'rectangle' })
    );
    expect(shape.canvas.remove).not.toHaveBeenCalled();
    expect(shape.canvas.add).not.toHaveBeenCalled();
  });

  it('coalesces Fabric and window pointer moves into one preview frame', () => {
    const queuedFrame: { callback: FrameRequestCallback | null } = { callback: null };
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        queuedFrame.callback = callback;
        return 12;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const path = createBindings('pencil');
    const pathObject = { id: 'path-object' };
    path.bindings.getDrawSession.mockReturnValue({
      object: pathObject,
      start: { x: 1, y: 2 },
      tool: 'pencil',
    });
    mocks.readDrawing.mockReturnValue({ id: 'pencil-1', kind: 'pencil', samples: [] });
    mocks.updatePath.mockReturnValue(true);
    const move = new Event('pointermove') as PointerEvent;
    Object.defineProperties(move, {
      ctrlKey: { value: false },
      pointerId: { value: 7 },
      shiftKey: { value: false },
      timeStamp: { value: 20 },
    });

    path.handlers.handleMouseMove({ e: move });
    path.handlers.handleWindowPointerMove(move);

    expect(mocks.updatePath).not.toHaveBeenCalled();
    expect(queuedFrame.callback).not.toBeNull();
    if (!queuedFrame.callback) throw new Error('Expected a queued drawing frame');
    queuedFrame.callback(20);
    expect(mocks.appendSamples).toHaveBeenCalledOnce();
    expect(mocks.updatePath).toHaveBeenCalledOnce();
  });

  it('cancels queued drawing work and the Fabric transform on pointer cancellation', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 12)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const path = createBindings('pencil');
    path.canvas._currentTransform = {};
    path.bindings.getDrawSession.mockReturnValue({
      object: { id: 'path-object' },
      start: { x: 1, y: 2 },
      tool: 'pencil',
    });
    const move = new Event('pointermove') as PointerEvent;
    Object.defineProperties(move, {
      ctrlKey: { value: false },
      pointerId: { value: 7 },
      shiftKey: { value: false },
    });

    path.handlers.handleWindowPointerMove(move);
    path.handlers.handlePointerCancel(move);

    expect(path.canvas.endCurrentTransform).toHaveBeenCalledWith(move);
    expect(path.bindings.cancelTransientInteraction).toHaveBeenCalledOnce();
    expect(mocks.updatePath).not.toHaveBeenCalled();
  });

  it('does not repeat state cancellation after an external terminal path', () => {
    const path = createBindings('pencil');
    path.canvas._currentTransform = {};
    mocks.createDrawing.mockReturnValue({ id: 'pencil-1', kind: 'pencil' });
    path.handlers.handleMouseDown(fabricPointerEvent(7));
    path.bindings.getDrawSession.mockReturnValue({ tool: 'pencil' });
    path.bindings.cancelTransientInteraction();
    path.bindings.getDrawSession.mockReturnValue(null);
    const cancel = fabricPointerEvent(7).e;

    path.handlers.handlePointerCancel(cancel);
    path.handlers.handlePointerCancel(cancel);

    expect(path.bindings.cancelTransientInteraction).toHaveBeenCalledOnce();
    expect(path.canvas.endCurrentTransform).toHaveBeenCalledOnce();
  });

  it('only lets the initiating pointer complete through the Fabric mouse-up route', () => {
    const path = createBindings('pencil');
    mocks.createDrawing.mockReturnValue({ id: 'pencil-1', kind: 'pencil' });
    path.handlers.handleMouseDown(fabricPointerEvent(7));

    path.handlers.handleMouseUp(fabricPointerEvent(8));
    expect(mocks.complete).not.toHaveBeenCalled();

    path.handlers.handleMouseUp(fabricPointerEvent(7));
    expect(mocks.complete).toHaveBeenCalledWith(path.bindings);
  });

  it('terminates a stale drawing session before Fabric resolves a rapid transform', () => {
    const shape = createBindings('shape');
    shape.bindings.getDrawSession.mockReturnValue({ tool: 'shape' });

    shape.handlers.handleMouseDownBefore({ e: new MouseEvent('mousedown', { button: 0 }) });

    expect(shape.bindings.cancelTransientInteraction).toHaveBeenCalledOnce();
  });
});

describe('drawing selection interactions', () => {
  beforeEach(resetDrawingMocks);

  it('edits an existing text on click, but completes drawing after a drag or ordinary mouse-up', () => {
    const target = { isEditing: false };
    mocks.isTextTarget.mockReturnValue(true);
    const text = createBindings('text');
    text.handlers.handleMouseDown({ ...pointerEvent(), target } as never);
    text.handlers.handleMouseUp();
    expect(text.canvas.setActiveObject).toHaveBeenCalledWith(target, expect.any(Object));
    expect(mocks.activateTextTarget).toHaveBeenCalledWith(
      text.canvas,
      target,
      expect.any(Function),
      { selectAll: false }
    );

    text.handlers.handleMouseDown({ ...pointerEvent(), target } as never);
    text.handlers.handleMouseMove(pointerEvent({ point: { x: 100, y: 100 } }) as never);
    text.handlers.handleMouseUp();
    expect(mocks.complete).toHaveBeenCalledWith(text.bindings);

    const ordinary = createBindings('arrow');
    ordinary.handlers.handleMouseUp();
    expect(mocks.complete).toHaveBeenCalledWith(ordinary.bindings);
  });

  it('lets Fabric transform a selected drawing instead of starting another drawing', () => {
    const selected = new FabricObject();
    selected.__corner = 'br';
    selected.sniptaleId = 'shape-1';
    mocks.isDrawingSelection.mockReturnValueOnce(true);
    mocks.createDrawing.mockReturnValue({ id: 'shape-2', kind: 'rectangle' });
    const shape = createBindings('shape');

    shape.handlers.handleMouseDown({
      e: new MouseEvent('mousedown', { button: 0 }),
      target: selected,
      transform: { target: selected },
    });

    expect(mocks.createDrawing).not.toHaveBeenCalled();
    expect(shape.bindings.startDrawSession).not.toHaveBeenCalled();
  });

  it('lets Fabric move an all-drawing ActiveSelection without starting another drawing', () => {
    const selected = new FabricObject();
    mocks.isDrawingSelection.mockReturnValueOnce(true);
    const shape = createBindings('shape');

    shape.handlers.handleMouseDown({
      e: new MouseEvent('mousedown', { button: 0 }),
      target: selected,
      transform: { target: selected },
    });

    expect(mocks.isDrawingSelection).toHaveBeenCalledWith(selected);
    expect(mocks.createDrawing).not.toHaveBeenCalled();
    expect(shape.bindings.startDrawSession).not.toHaveBeenCalled();
  });
});
