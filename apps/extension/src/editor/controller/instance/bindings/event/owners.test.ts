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
  bindings.startDrawSession('rectangle', { x: 1, y: 2 } as never, object as never);
  expect(bindings.beginRichShapeTextEditing({ sniptaleType: 'rectangle' } as never)).toBe(false);

  expect(controller.addObject).toHaveBeenCalledWith(object);
  expect(controller.startDrawSession).toHaveBeenCalledWith('rectangle', { x: 1, y: 2 }, object);
});

it('keeps command event forwarding in the command bindings owner', async () => {
  const controller = {
    applyRasterBitmap: vi.fn(async () => undefined),
    cancelTransientInteraction: vi.fn(() => true),
    clearRasterSelection: vi.fn(),
    commitHistory: vi.fn(),
    deleteSelection: vi.fn(),
    finalizeSelectionNudge: vi.fn(),
    nudgeSelection: vi.fn(() => true),
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    zoomLevel: 2,
    setZoomAtViewportPoint: vi.fn(),
  };
  const bindings = createEditorControllerEventCommandBindings(controller as never);

  expect(bindings.cancelTransientInteraction()).toBe(true);
  bindings.zoomViewportAtPoint(1.5, { clientX: 10, clientY: 20 });
  await bindings.applyRasterBitmap({ kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' }, {
    width: 1,
    height: 1,
  } as HTMLCanvasElement);

  expect(controller.setZoomAtViewportPoint).toHaveBeenCalledWith(3, {
    clientX: 10,
    clientY: 20,
  });
  expect(controller.applyRasterBitmap).toHaveBeenCalledOnce();
});
