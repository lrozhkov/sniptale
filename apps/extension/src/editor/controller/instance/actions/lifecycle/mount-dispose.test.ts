// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createMockController } from '../../bindings/test-fixtures';

const mocks = vi.hoisted(() => ({
  applyViewportZoom: vi.fn(),
  attachEvents: vi.fn(() => ({ disconnect: vi.fn() })),
  createMagnet: vi.fn(() => ({ dispose: vi.fn() })),
  detachEvents: vi.fn(),
  handoff: {
    beginMount: vi.fn(() => 4),
    markReady: vi.fn(),
    tearDown: vi.fn(),
  },
  refreshViewport: vi.fn(),
}));

vi.mock('fabric', () => ({
  Canvas: class TestCanvas {
    backgroundColor = '';
    dispose = vi.fn();
    findTarget = vi.fn(() => ({ target: undefined }));
    requestRenderAll = vi.fn();
    upperCanvasEl: HTMLCanvasElement;

    constructor(element: HTMLCanvasElement, options: Record<string, unknown>) {
      this.upperCanvasEl = element;
      Object.assign(this, options);
    }

    setDimensions = vi.fn();
    setZoom = vi.fn();
  },
}));

vi.mock('../../../events', () => ({
  EditorControllerEventHandlers: undefined,
  attachEditorControllerEventHandlers: mocks.attachEvents,
  createEditorControllerEventHandlers: vi.fn(),
  detachEditorControllerEventHandlers: mocks.detachEvents,
}));

vi.mock('../../../magnet', () => ({
  EditorMagnetManager: undefined,
  createEditorMagnetManager: mocks.createMagnet,
}));

vi.mock('../../../viewport', () => ({
  applyEditorViewportZoom: mocks.applyViewportZoom,
  buildEditorViewportState: vi.fn(),
  captureEditorViewportAnchor: vi.fn(),
  getEditorStageInsets: vi.fn(),
  getEditorViewportFitArea: vi.fn(),
  getEditorViewportDevicePixelRatioBaseline: vi.fn(() => 1),
  getEditorViewportMetrics: vi.fn(),
  resolveEditorViewportScaleCompensation: vi.fn(),
  restoreEditorViewportAnchor: vi.fn(),
  syncEditorViewportState: vi.fn(),
}));

vi.mock('../../../viewport/actions', () => ({
  navigateEditorViewportTo: vi.fn(),
  refreshEditorViewportPresentation: mocks.refreshViewport,
  setEditorZoom: vi.fn(),
  setEditorZoomAtViewportPoint: vi.fn(),
  setEditorZoomCentered: vi.fn(),
  zoomEditorToFit: vi.fn(),
}));

vi.mock('../../../../document/canvas-ready/handoff', () => ({
  EditorCanvasReadyHandoff: undefined,
  ensureEditorCanvasReadyHandoff: vi.fn(() => mocks.handoff),
}));

import { disposeEditorController } from './dispose';
import { mountEditorController } from './mount';

function createController() {
  const controller = createMockController();
  controller.canvas = null;
  controller.viewportElement = null;
  controller.stageElement = null;
  controller.isSpacePressed = true;
  return controller;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('mounts pointer capture with the canvas lifecycle and detaches it on dispose', () => {
  const controller = createController();
  const canvasElement = document.createElement('canvas');
  const viewportElement = document.createElement('div');
  const stageElement = document.createElement('div');
  canvasElement.setPointerCapture = vi.fn();
  canvasElement.hasPointerCapture = vi.fn(() => false);
  canvasElement.releasePointerCapture = vi.fn();

  mountEditorController(controller, canvasElement, viewportElement, stageElement);
  canvasElement.dispatchEvent(
    Object.assign(new Event('pointerdown'), { button: 0, isPrimary: true, pointerId: 9 })
  );

  expect(canvasElement.setPointerCapture).toHaveBeenCalledWith(9);
  expect(controller.viewportElement).toBe(viewportElement);
  expect(controller.stageElement).toBe(stageElement);
  expect(mocks.attachEvents).toHaveBeenCalledOnce();
  expect(mocks.createMagnet.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.attachEvents.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(mocks.handoff.markReady).toHaveBeenCalledWith(4);

  controller.viewportSyncFrame = 27;
  const cancelAnimationFrameSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
  disposeEditorController(controller);
  canvasElement.dispatchEvent(
    Object.assign(new Event('pointerdown'), { button: 0, isPrimary: true, pointerId: 10 })
  );

  expect(canvasElement.setPointerCapture).not.toHaveBeenCalledWith(10);
  expect(mocks.detachEvents).toHaveBeenCalledOnce();
  expect(mocks.createMagnet.mock.results[0]?.value.dispose).toHaveBeenCalledOnce();
  expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(27);
  expect(controller.canvas).toBeNull();
  expect(controller.isSpacePressed).toBe(false);
});

it('disposes an existing canvas before remounting and safely ignores an empty dispose', () => {
  const controller = createController();
  mountEditorController(
    controller,
    document.createElement('canvas'),
    document.createElement('div'),
    document.createElement('div')
  );
  vi.mocked(controller.dispose).mockClear();

  mountEditorController(
    controller,
    document.createElement('canvas'),
    document.createElement('div'),
    document.createElement('div')
  );

  expect(controller.dispose).toHaveBeenCalledOnce();
  controller.canvas = null;
  disposeEditorController(controller);
  expect(mocks.detachEvents).not.toHaveBeenCalled();
});

it('tears down the handoff and controller when mounting fails', () => {
  const controller = createController();
  mocks.applyViewportZoom.mockImplementationOnce(() => {
    throw new Error('viewport failed');
  });

  expect(() =>
    mountEditorController(
      controller,
      document.createElement('canvas'),
      document.createElement('div'),
      document.createElement('div')
    )
  ).toThrow('viewport failed');
  expect(mocks.handoff.tearDown).toHaveBeenCalledOnce();
  expect(controller.dispose).toHaveBeenCalledOnce();
});
