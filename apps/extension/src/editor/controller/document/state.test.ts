import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorDocumentToCanvasMock: vi.fn(),
  applyPreparedEditorDocumentStateMock: vi.fn(),
  upgradeLegacyArrowObjectsMock: vi.fn(),
}));

vi.mock('./apply/orchestrate', () => ({
  applyEditorDocumentToCanvas: mocks.applyEditorDocumentToCanvasMock,
}));

vi.mock('./lifecycle-helpers', () => ({
  applyPreparedEditorDocumentState: mocks.applyPreparedEditorDocumentStateMock,
  createBrowserFrameRebuildDonePayload: vi.fn(),
  createBrowserFrameRebuildPayload: vi.fn(),
}));

vi.mock('../core/legacy/canvas', () => ({
  upgradeLegacyArrowObjects: mocks.upgradeLegacyArrowObjectsMock,
}));

import { applyEditorControllerDocumentState } from './state';

function createDocumentStateOptions(overrides: Record<string, unknown> = {}) {
  return {
    applyOptions: {},
    applyToolMode: vi.fn(),
    canvas: { getObjects: vi.fn(() => []), id: 'canvas' } as never,
    document: { id: 'document' } as never,
    hasHistory: false,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncBackgroundLayer: vi.fn(async () => undefined),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setSource: vi.fn(),
    zoomLevel: 2,
    ...overrides,
  };
}

function registerPreparedStateTest() {
  it('applies prepared document state after canvas hydration and legacy upgrades', async () => {
    const canvas = { getObjects: vi.fn(() => []), id: 'canvas' } as never;
    const prepared = { normalizedDocument: { id: 'prepared' } } as never;
    const source = { id: 'source' } as never;
    const options = createDocumentStateOptions({
      applyOptions: { resetHistory: true, updateOriginal: true },
      canvas,
    });
    mocks.applyEditorDocumentToCanvasMock.mockResolvedValue({ prepared, source });

    await applyEditorControllerDocumentState(options);

    const applyCall = mocks.applyEditorDocumentToCanvasMock.mock.calls[0]?.[0];
    applyCall.upgradeLegacyArrowObjects();

    expect(mocks.upgradeLegacyArrowObjectsMock).toHaveBeenCalledWith(canvas);
    expect(mocks.applyPreparedEditorDocumentStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyOptions: { resetHistory: true, updateOriginal: true },
        canvasObjects: [],
        prepared,
        setHistory: options.setHistory,
        setOriginalDocument: options.setOriginalDocument,
        source,
      })
    );
    await applyCall.syncBackgroundLayer({ backgroundMode: 'color' }, { height: 20, width: 40 });

    expect(options.syncBackgroundLayer).toHaveBeenCalledWith(
      { backgroundMode: 'color' },
      { height: 20, width: 40 }
    );
  });
}

function registerBaselinePatchTest() {
  it('passes page-zoom compensation baseline only when the controller provides one', async () => {
    vi.clearAllMocks();
    mocks.applyEditorDocumentToCanvasMock.mockResolvedValue({
      prepared: { normalizedDocument: { id: 'prepared' } },
      source: null,
    });

    await applyEditorControllerDocumentState(
      createDocumentStateOptions({ viewportDevicePixelRatioBaseline: 1 })
    );
    await applyEditorControllerDocumentState(createDocumentStateOptions());

    expect(mocks.applyEditorDocumentToCanvasMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
    );
    expect(mocks.applyEditorDocumentToCanvasMock).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ viewportDevicePixelRatioBaseline: expect.any(Number) })
    );
  });
}

describe('editor-controller-document.state', () => {
  registerPreparedStateTest();
  registerBaselinePatchTest();
});
