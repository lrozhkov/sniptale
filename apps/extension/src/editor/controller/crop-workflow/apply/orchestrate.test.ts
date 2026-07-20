import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hideCropGuideForApply: vi.fn(() => vi.fn()),
  loggerError: vi.fn(),
  normalizeEditorCropSelection: vi.fn(() => ({ height: 20, left: 1, top: 2, width: 30 })),
  runEditorCropSelection: vi.fn(async () => undefined),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: mocks.loggerError }),
}));

vi.mock('../../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/crop')>()),
  normalizeEditorCropSelection: mocks.normalizeEditorCropSelection,
}));

vi.mock('./guide', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./guide')>()),
  hideCropGuideForApply: mocks.hideCropGuideForApply,
}));

vi.mock('./scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scene')>()),
  runEditorCropSelection: mocks.runEditorCropSelection,
}));

import { applyEditorControllerCropSelection } from './orchestrate';

function createContext() {
  return {
    canvas: { discardActiveObject: vi.fn(), remove: vi.fn(), requestRenderAll: vi.fn() },
    canvasDocumentSize: { height: 100, width: 200 },
    commitHistory: vi.fn(),
    cropGuide: {},
    cropSelection: { height: 5, left: 1, top: 2, width: 6 },
    logCrop: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setSource: vi.fn(),
    source: null,
    switchToSelectTool: vi.fn(),
    syncViewportTransform: vi.fn(),
  };
}

describe('crop apply orchestration owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hideCropGuideForApply.mockReturnValue(vi.fn());
    mocks.runEditorCropSelection.mockResolvedValue(undefined);
  });

  it('returns null when required crop owners are missing', async () => {
    await expect(
      applyEditorControllerCropSelection({ ...createContext(), cropGuide: null } as never)
    ).resolves.toBeNull();
  });

  it('restores crop guide and rethrows when scene mutation fails', async () => {
    const restore = vi.fn();
    const error = new Error('crop failed');
    mocks.hideCropGuideForApply.mockReturnValue(restore);
    mocks.runEditorCropSelection.mockRejectedValueOnce(error);

    await expect(applyEditorControllerCropSelection(createContext() as never)).rejects.toThrow(
      'crop failed'
    );

    expect(restore).toHaveBeenCalledOnce();
    expect(mocks.loggerError).toHaveBeenCalledWith('apply failed', error);
  });
});
