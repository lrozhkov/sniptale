import { beforeEach, expect, it, vi } from 'vitest';
import {
  closeEditorDocumentViaController,
  loadEditorDocumentViaController,
  openEditorImageViaController,
} from './lifecycle';
import { EditorCanvas } from '../../viewport/render-region';

const mocks = vi.hoisted(() => ({
  closeDocument: vi.fn(),
  loadDocument: vi.fn(async () => undefined),
  openImage: vi.fn(async () => undefined),
}));

const visibility = vi.hoisted(() => ({
  activeTool: 'select' as 'select' | 'crop',
  canvasCropMode: 'crop' as 'crop' | 'expand',
  showOutsideCanvas: true,
  setCanvasCropMode: vi.fn(),
  setShowOutsideCanvas: vi.fn(),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => visibility },
}));

vi.mock('../../document/lifecycle/close/run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/lifecycle/close/run')>()),
  closeEditorControllerDocument: mocks.closeDocument,
}));

vi.mock('../../document/lifecycle/open/load/run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/lifecycle/open/load/run')>()),
  openLoadedEditorControllerDocument: mocks.loadDocument,
}));

vi.mock('../../document/lifecycle/open/image/run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/lifecycle/open/image/run')>()),
  openEditorControllerImage: mocks.openImage,
}));

function createController() {
  return {
    applyDocument: vi.fn(async () => undefined),
    canvas: { id: 'canvas' },
    scheduleZoomToFit: vi.fn(),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn(),
    setZoomLevel: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  visibility.activeTool = 'select';
  visibility.canvasCropMode = 'crop';
  visibility.showOutsideCanvas = true;
  visibility.setCanvasCropMode.mockImplementation((mode: 'crop' | 'expand') => {
    visibility.canvasCropMode = mode;
  });
  visibility.setShowOutsideCanvas.mockImplementation((show: boolean) => {
    visibility.showOutsideCanvas = show;
  });
});

it('masks outside pixels before applying a replacement document and leaves them hidden', async () => {
  const controller = createController();
  const canvas = Object.create(EditorCanvas.prototype) as EditorCanvas;
  canvas.setShowOutsideCanvas = vi.fn();
  controller.canvas = canvas;
  controller.applyDocument.mockImplementation(async () => {
    expect(canvas.setShowOutsideCanvas).toHaveBeenCalledWith(false);
    expect(visibility.showOutsideCanvas).toBe(false);
    expect(visibility.canvasCropMode).toBe('crop');
  });

  await openEditorImageViaController(controller, 'data-url');
  const openArgs = (mocks.openImage.mock.calls as any[][])[0]?.[0];
  await openArgs.applyDocument({ id: 'second-document' }, { resetHistory: true });

  expect(visibility.showOutsideCanvas).toBe(false);
  expect(canvas.setShowOutsideCanvas).toHaveBeenCalledTimes(1);
});

it('keeps outside pixels hidden when replacement fails after changing the canvas', async () => {
  const controller = createController();
  const canvas = Object.create(EditorCanvas.prototype) as EditorCanvas;
  canvas.setShowOutsideCanvas = vi.fn();
  controller.canvas = canvas;
  visibility.activeTool = 'crop';
  visibility.canvasCropMode = 'expand';
  visibility.showOutsideCanvas = true;
  controller.applyDocument.mockRejectedValueOnce(new Error('apply failed'));

  await loadEditorDocumentViaController(controller, { id: 'next-document' } as never);
  const loadArgs = (mocks.loadDocument.mock.calls as any[][])[0]?.[0];
  await expect(
    loadArgs.applyDocument({ id: 'next-document' }, { resetHistory: true })
  ).rejects.toThrow('apply failed');

  expect(visibility.showOutsideCanvas).toBe(false);
  expect(visibility.canvasCropMode).toBe('crop');
  expect(canvas.setShowOutsideCanvas).toHaveBeenNthCalledWith(1, false);
  expect(canvas.setShowOutsideCanvas).toHaveBeenCalledTimes(1);
});

it('bridges open and load callbacks back into the controller', async () => {
  const controller = createController();

  await openEditorImageViaController(controller, 'data-url', 'Name', { pageTitle: 'Page' });
  await loadEditorDocumentViaController(controller, { id: 'document' } as never);

  const openArgs = (mocks.openImage.mock.calls as any[][])[0]?.[0];
  await openArgs.applyDocument({ id: 'open-doc' }, { resetHistory: false, updateOriginal: false });
  openArgs.scheduleZoomToFit();
  const loadArgs = (mocks.loadDocument.mock.calls as any[][])[0]?.[0];
  await loadArgs.applyDocument({ id: 'load-doc' }, { resetHistory: false, updateOriginal: false });
  loadArgs.scheduleZoomToFit();

  expect(controller.applyDocument).toHaveBeenCalledWith(
    { id: 'open-doc' },
    { resetHistory: false, updateOriginal: false }
  );
  expect(controller.applyDocument).toHaveBeenCalledWith(
    { id: 'load-doc' },
    { resetHistory: false, updateOriginal: false }
  );
  expect(controller.scheduleZoomToFit).toHaveBeenCalledTimes(2);
});

it('bridges close callbacks and controller state into the close owner', () => {
  const controller = createController();

  closeEditorDocumentViaController(controller);

  const closeArgs = (mocks.closeDocument.mock.calls as any[][])[0]?.[0];
  expect(closeArgs.viewportDevicePixelRatioBaseline).toBe(1);
  closeArgs.setCanvasDocumentSize({ height: 10, width: 20 });
  closeArgs.setDrawSession(null);
  closeArgs.setCropState(null, null);
  closeArgs.setSource({ id: 'next-source' });
  closeArgs.setOriginalDocument({ id: 'next-original' });
  closeArgs.setHistory(null);
  closeArgs.setActiveTool('select');
  closeArgs.setZoomLevel(1);
  closeArgs.setPanSession(null);

  expect(controller.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 10, width: 20 });
  expect(controller.setDrawSession).toHaveBeenCalledWith(null);
  expect(controller.setCropState).toHaveBeenCalledWith(null, null);
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'next-source' });
  expect(controller.setOriginalDocument).toHaveBeenCalledWith({ id: 'next-original' });
  expect(controller.setHistory).toHaveBeenCalledWith(null);
  expect(controller.setActiveTool).toHaveBeenCalledWith('select');
  expect(controller.setZoomLevel).toHaveBeenCalledWith(1);
  expect(controller.setPanSession).toHaveBeenCalledWith(null);
});
