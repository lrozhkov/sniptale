import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoomMock: vi.fn(),
  reportEditorActionFailureMock: vi.fn(),
}));

vi.mock('../../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/async-actions')>()),
  reportEditorActionFailure: mocks.reportEditorActionFailureMock,
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
}));

import { finalizeEditorSceneMutation } from './helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

function createFinalizeOptions() {
  return {
    canvas: { id: 'canvas-1' } as never,
    commitHistory: vi.fn(),
    ensureReachableObjects: vi.fn(),
    getCanvasDocumentSize: vi.fn(() => ({ width: 1280, height: 720 })),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 2,
    zoomLevel: 1.25,
  };
}

it('finalizes a relayout mutation after the decoration rebuild resolves', async () => {
  const options = createFinalizeOptions();

  finalizeEditorSceneMutation(options);
  await Promise.resolve();

  expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
    options.canvas,
    { width: 1280, height: 720 },
    1.25,
    2
  );
  expect(options.ensureReachableObjects).toHaveBeenCalledOnce();
  expect(options.commitHistory).toHaveBeenCalledOnce();
  expect(options.syncRuntimeState).toHaveBeenCalledOnce();
  expect(mocks.reportEditorActionFailureMock).not.toHaveBeenCalled();
});

it('reports scene-mutation failures when the decoration rebuild rejects', async () => {
  const error = new Error('rebuild failed');
  const options = createFinalizeOptions();
  options.rebuildFrameDecorations.mockRejectedValueOnce(error);

  finalizeEditorSceneMutation(options);
  await Promise.resolve();
  await Promise.resolve();

  expect(options.commitHistory).not.toHaveBeenCalled();
  expect(options.syncRuntimeState).not.toHaveBeenCalled();
  expect(mocks.reportEditorActionFailureMock).toHaveBeenCalledWith('scene-mutation', error);
});
