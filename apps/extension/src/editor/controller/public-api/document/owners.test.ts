import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { closeEditorControllerDocument } from '../../document/lifecycle/close/run';
import { openEditorControllerImage } from '../../document/lifecycle/open/image/run';
import { openLoadedEditorControllerDocument } from '../../document/lifecycle/open/load/run';
import {
  closeEditorDocumentViaController,
  loadEditorDocumentViaController,
  openEditorImageViaController,
} from './lifecycle';
import type {
  EditorDocumentCloseLifecycleController,
  EditorDocumentOpenLifecycleController,
} from './lifecycle-controller';

const mocks = vi.hoisted(() => ({
  closeDocument: vi.fn(),
  loadDocument: vi.fn(async () => undefined),
  openImage: vi.fn(async () => undefined),
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

function createOpenLifecycleController(): EditorDocumentOpenLifecycleController {
  return {
    applyDocument: vi.fn(async () => undefined),
    scheduleZoomToFit: vi.fn(),
  };
}

function createCloseLifecycleController(): EditorDocumentCloseLifecycleController {
  return {
    canvas: null,
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
  };
}

function createEditorDocument(): EditorDocument {
  return {
    canvasHeight: 180,
    canvasJson: '{}',
    canvasWidth: 320,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceDisplayHeight: 180,
    sourceDisplayWidth: 320,
    sourceHeight: 180,
    sourceImageData: 'data:image/png;base64,abc',
    sourceLeft: 0,
    sourceName: 'source.png',
    sourceTop: 0,
    sourceWidth: 320,
    version: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps document open and load actions on the open lifecycle slice', async () => {
  const controller = createOpenLifecycleController();

  await openEditorImageViaController(controller, 'data-url', 'Name');
  await loadEditorDocumentViaController(controller, createEditorDocument());

  const openArgs = vi.mocked(openEditorControllerImage).mock.calls[0]?.[0];
  const loadArgs = vi.mocked(openLoadedEditorControllerDocument).mock.calls[0]?.[0];
  if (!openArgs || !loadArgs) {
    throw new Error('Expected document lifecycle args');
  }

  await openArgs.applyDocument(createEditorDocument(), { resetHistory: false });
  await loadArgs.applyDocument(createEditorDocument(), { updateOriginal: false });
  openArgs.scheduleZoomToFit();
  loadArgs.scheduleZoomToFit();

  expect(controller.applyDocument).toHaveBeenCalledTimes(2);
  expect(controller.scheduleZoomToFit).toHaveBeenCalledTimes(2);
});

it('keeps document close actions on the close lifecycle slice', () => {
  const controller = createCloseLifecycleController();

  closeEditorDocumentViaController(controller);

  const closeArgs = vi.mocked(closeEditorControllerDocument).mock.calls[0]?.[0];
  if (!closeArgs) {
    throw new Error('Expected close lifecycle args');
  }

  closeArgs.setZoomLevel(1);
  closeArgs.setPanSession(null);

  expect(closeArgs.canvas).toBeNull();
  expect(controller.setZoomLevel).toHaveBeenCalledWith(1);
  expect(controller.setPanSession).toHaveBeenCalledWith(null);
});
