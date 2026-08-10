import { expect, it, vi } from 'vitest';
import { createEditorControllerEventCommandBindings } from './commands';
import { createEditorControllerEventObjectBindings } from './object';
import {
  createEventCanvasStateBindings,
  createEventCropStateBindings,
  createEventInteractionStateBindings,
} from './state';

it('keeps event state accessors in the state bindings owner', () => {
  const controller = {
    cropGuide: null,
    cropSelection: null,
    isSpacePressed: false,
    panSession: null,
    viewportSyncFrame: 0,
  };
  const cropGuide = { id: 'crop' };
  const cropSelection = { id: 'selection' };
  const canvasBindings = createEventCanvasStateBindings(controller as never);
  const cropBindings = createEventCropStateBindings(controller as never);
  const interactionBindings = createEventInteractionStateBindings(controller as never);

  cropBindings.setCropState(cropGuide as never, cropSelection as never);
  interactionBindings.setIsSpacePressed(true);
  canvasBindings.setViewportSyncFrame(7);

  expect(cropBindings.getCropGuide()).toBe(cropGuide);
  expect(cropBindings.getCropSelection()).toBe(cropSelection);
  expect(interactionBindings.getIsSpacePressed()).toBe(true);
  expect(canvasBindings.getViewportSyncFrame()).toBe(7);
});

it('keeps object event commands in the object bindings owner', () => {
  const controller = {
    addObject: vi.fn(),
    advanceStepValue: vi.fn(),
    applyGridSnap: vi.fn(),
    canvas: null,
    decorateShape: vi.fn(),
    ensureObjectReachable: vi.fn(),
    getActiveCropRect: vi.fn(),
    nextLabelIndex: vi.fn(() => 3),
    prepareObject: vi.fn(),
    startDrawSession: vi.fn(),
    switchToSelectTool: vi.fn(),
  };
  const object = { id: 'object' };
  const bindings = createEditorControllerEventObjectBindings(controller as never);

  bindings.addObject(object as never);
  bindings.startDrawSession('shape', { x: 1, y: 2 } as never, object as never);
  expect(bindings.beginRichShapeTextEditing({ sniptaleType: 'shape' } as never)).toBe(false);

  expect(controller.addObject).toHaveBeenCalledWith(object);
  expect(controller.startDrawSession).toHaveBeenCalledWith('shape', { x: 1, y: 2 }, object);
});

it('keeps command event forwarding in the command bindings owner', async () => {
  const controller = {
    applyCropSelection: vi.fn(async () => undefined),
    applyTextSelectionStyle: vi.fn(() => true),
    cancelTransientInteraction: vi.fn(() => true),
    commitHistory: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    finalizeSelectionNudge: vi.fn(),
    nudgeSelection: vi.fn(() => true),
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    zoomLevel: 2,
    setZoomAtViewportPoint: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
  };
  const bindings = createEditorControllerEventCommandBindings(controller as never);

  expect(bindings.cancelTransientInteraction()).toBe(true);
  expect(bindings.applyTextSelectionStyle('bold')).toBe(true);
  bindings.commitHistory();
  bindings.syncRuntimeState();
  bindings.syncViewportState();
  bindings.nudgeSelection({ code: 'ArrowRight', deltaX: 1, deltaY: 0, step: 1 });
  bindings.finalizeSelectionNudge('ArrowRight');
  bindings.deleteSelection();
  bindings.undo();
  bindings.redo();
  bindings.duplicateSelection();
  bindings.applyCropSelection();
  bindings.zoomViewportAtPoint(1.5, { clientX: 10, clientY: 20 });
  expect(controller.setZoomAtViewportPoint).toHaveBeenCalledWith(3, {
    clientX: 10,
    clientY: 20,
  });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  expect(controller.syncViewportState).toHaveBeenCalledOnce();
  expect(controller.deleteSelection).toHaveBeenCalledOnce();
});
