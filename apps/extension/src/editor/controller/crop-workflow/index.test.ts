import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelEditorCropDrawSessionMock: vi.fn(),
  clearEditorCropGuideMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(),
  applyCropGuideSelectionMock: vi.fn(),
  createCropGuideRectMock: vi.fn(),
  normalizeEditorCropSelectionMock: vi.fn(),
  setCropReadyMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.getEditorStoreStateMock,
  },
}));

vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  applyCropGuideSelection: mocks.applyCropGuideSelectionMock,
  createCropGuideRect: mocks.createCropGuideRectMock,
  normalizeEditorCropSelection: mocks.normalizeEditorCropSelectionMock,
}));

vi.mock('../transient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transient')>()),
  cancelEditorCropDrawSession: mocks.cancelEditorCropDrawSessionMock,
  clearEditorCropGuide: mocks.clearEditorCropGuideMock,
}));

import {
  clearEditorCanvasSizePreview,
  cancelEditorControllerCropMode,
  clearEditorControllerCropSelection,
  previewEditorCanvasSizeSelection,
} from './';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditorStoreStateMock.mockReturnValue({
    browserFrame: { enabled: false },
    frame: { mode: 'frame' },
    setCropReady: mocks.setCropReadyMock,
  });
  mocks.clearEditorCropGuideMock.mockReturnValue({ cropGuide: null, cropSelection: null });
  mocks.cancelEditorCropDrawSessionMock.mockReturnValue({ drawSession: null, cropSelection: null });
  mocks.createCropGuideRectMock.mockReturnValue({ id: 'preview-guide' });
  mocks.normalizeEditorCropSelectionMock.mockReturnValue({
    left: 10,
    top: 20,
    width: 100,
    height: 60,
  });
});

function expectCropGuideCleared(
  canvas: { requestRenderAll: ReturnType<typeof vi.fn> },
  cropGuide: { id: string }
) {
  expect(mocks.clearEditorCropGuideMock).toHaveBeenCalledWith({ canvas, cropGuide });
  expect(mocks.setCropReadyMock).toHaveBeenCalledWith(false);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
}

it('clears the crop guide through the transient crop seam', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const cropGuide = { id: 'guide' };

  expect(
    clearEditorControllerCropSelection({ canvas: null as never, cropGuide: cropGuide as never })
  ).toBeNull();

  const nextState = clearEditorControllerCropSelection({
    canvas: canvas as never,
    cropGuide: cropGuide as never,
  });

  expectCropGuideCleared(canvas, cropGuide);
  expect(nextState).toEqual({ cropGuide: null, cropSelection: null });
});

it('previews canvas size without making crop apply ready until a selection exists', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const previewGuide = { id: 'preview-guide' };
  mocks.createCropGuideRectMock.mockReturnValueOnce(previewGuide);

  const nextState = previewEditorCanvasSizeSelection({
    canvas: canvas as never,
    cropGuide: null,
    cropSelection: null,
    canvasDocumentSize: { width: 1280, height: 720 },
    width: 640,
    height: 360,
  });

  expect(mocks.applyCropGuideSelectionMock).toHaveBeenCalledWith(
    previewGuide,
    { height: 360, left: 0, top: 0, width: 640 },
    'preview'
  );
  expect(canvas.add).toHaveBeenCalledWith(previewGuide);
  expect(mocks.setCropReadyMock).toHaveBeenCalledWith(false);
  expect(nextState).toEqual({ cropGuide: previewGuide, cropSelection: null });
});

it('does not create a canvas size preview for the current canvas size', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };

  const nextState = previewEditorCanvasSizeSelection({
    canvas: canvas as never,
    cropGuide: null,
    cropSelection: null,
    canvasDocumentSize: { width: 1280, height: 720 },
    width: 1280,
    height: 720,
  });

  expect(nextState).toBeNull();
  expect(mocks.createCropGuideRectMock).not.toHaveBeenCalled();
  expect(canvas.add).not.toHaveBeenCalled();
  expect(mocks.setCropReadyMock).not.toHaveBeenCalled();
});

it('updates an existing crop selection from the canvas size preview owner', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const cropGuide = { id: 'guide' };
  mocks.normalizeEditorCropSelectionMock.mockReturnValueOnce({
    left: 10,
    top: 20,
    width: 640,
    height: 360,
  });

  const nextState = previewEditorCanvasSizeSelection({
    canvas: canvas as never,
    cropGuide: cropGuide as never,
    cropSelection: { left: 10, top: 20, width: 100, height: 60 },
    canvasDocumentSize: { width: 1280, height: 720 },
    width: 640,
    height: 360,
  });

  expect(mocks.normalizeEditorCropSelectionMock).toHaveBeenCalledWith(
    { height: 360, left: 10, top: 20, width: 640 },
    { width: 1280, height: 720 }
  );
  expect(mocks.applyCropGuideSelectionMock).toHaveBeenCalledWith(
    cropGuide,
    { height: 360, left: 10, top: 20, width: 640 },
    'selection'
  );
  expect(canvas.add).not.toHaveBeenCalled();
  expect(mocks.setCropReadyMock).toHaveBeenCalledWith(true);
  expect(nextState).toEqual({
    cropGuide,
    cropSelection: { left: 10, top: 20, width: 640, height: 360 },
  });
});

it('does not resync the same crop selection preview', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const cropGuide = { id: 'guide' };
  mocks.normalizeEditorCropSelectionMock.mockReturnValueOnce({
    left: 10,
    top: 20,
    width: 100,
    height: 60,
  });

  const nextState = previewEditorCanvasSizeSelection({
    canvas: canvas as never,
    cropGuide: cropGuide as never,
    cropSelection: { left: 10, top: 20, width: 100, height: 60 },
    canvasDocumentSize: { width: 1280, height: 720 },
    width: 100,
    height: 60,
  });

  expect(nextState).toBeNull();
  expect(mocks.applyCropGuideSelectionMock).not.toHaveBeenCalled();
  expect(mocks.setCropReadyMock).not.toHaveBeenCalled();
});

it('clears only preview canvas size guides', () => {
  const canvas = {
    discardActiveObject: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const cropGuide = { id: 'preview-guide' };

  expect(
    clearEditorCanvasSizePreview({
      canvas: canvas as never,
      cropGuide: cropGuide as never,
      cropSelection: { left: 0, top: 0, width: 10, height: 10 },
    })
  ).toBeNull();

  const nextState = clearEditorCanvasSizePreview({
    canvas: canvas as never,
    cropGuide: cropGuide as never,
    cropSelection: null,
  });

  expect(canvas.remove).toHaveBeenCalledWith(cropGuide);
  expect(mocks.setCropReadyMock).toHaveBeenCalledWith(false);
  expect(nextState).toEqual({ cropGuide: null, cropSelection: null });
});

it('cancels crop mode, clears active guides, and syncs runtime state', () => {
  const canvas = { requestRenderAll: vi.fn() };
  const clearCropSelection = vi.fn();
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();

  expect(
    cancelEditorControllerCropMode({
      canvas: null as never,
      cropGuide: null,
      drawSession: null,
      clearCropSelection,
      switchToSelectTool,
      syncRuntimeState,
    })
  ).toBeNull();

  const nextState = cancelEditorControllerCropMode({
    canvas: canvas as never,
    cropGuide: { id: 'guide' } as never,
    drawSession: { tool: 'crop' } as never,
    clearCropSelection,
    switchToSelectTool,
    syncRuntimeState,
  });

  expect(clearCropSelection).toHaveBeenCalledOnce();
  expect(mocks.cancelEditorCropDrawSessionMock).toHaveBeenCalledWith({
    canvas,
    drawSession: { tool: 'crop' },
  });
  expect(switchToSelectTool).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  expect(nextState).toEqual({ drawSession: null, cropSelection: null });
});
