import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorControllerDocumentStateMock: vi.fn(async () => undefined),
  logEditorOpenTraceMock: vi.fn(),
}));

vi.mock('./state', () => ({
  applyEditorControllerDocumentState: mocks.applyEditorControllerDocumentStateMock,
}));

vi.mock('../core/debug', () => ({
  logEditorOpenTrace: mocks.logEditorOpenTraceMock,
}));

import { runApplyEditorControllerDocument } from './runner';

function createOptions() {
  return {
    applyOptions: { resetHistory: true, updateOriginal: true },
    applyToolMode: vi.fn(),
    canvas: {
      getObjects: vi.fn(() => [{ id: 'one' }, { id: 'two' }]),
    } as never,
    document: {
      canvasHeight: 60,
      canvasWidth: 100,
      sourceHeight: 60,
      sourceWidth: 100,
    } as never,
    hasHistory: false,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    zoomLevel: 2,
  };
}

describe('editor-controller-document.runner skipped apply', () => {
  it('skips apply when the canvas is missing', async () => {
    const options = createOptions();

    await runApplyEditorControllerDocument({ ...options, canvas: null } as never);

    expect(mocks.applyEditorControllerDocumentStateMock).not.toHaveBeenCalled();
    expect(mocks.logEditorOpenTraceMock).toHaveBeenCalledWith(
      'apply:skipped',
      expect.objectContaining({
        canvasHeight: 60,
        canvasWidth: 100,
        reason: 'canvas-missing',
      })
    );
  });
});

describe('editor-controller-document.runner normalized apply options', () => {
  it('forwards normalized apply options and syncs runtime after state apply', async () => {
    const options = createOptions();

    const { applyOptions: _applyOptions, ...legacyOptions } = options;

    await runApplyEditorControllerDocument({
      ...legacyOptions,
      options: { resetHistory: false, updateOriginal: false },
    } as never);

    expect(mocks.applyEditorControllerDocumentStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyOptions: { resetHistory: false, updateOriginal: false },
        canvas: options.canvas,
      })
    );
    const appliedOptions = (
      mocks.applyEditorControllerDocumentStateMock.mock.calls as unknown as Array<
        [{ options?: unknown }]
      >
    )[0]?.[0];
    expect(appliedOptions).not.toHaveProperty('options');
    expect(options.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.logEditorOpenTraceMock).toHaveBeenCalledWith(
      'apply:runtime-synced',
      expect.objectContaining({
        canvasObjects: 2,
      })
    );
    expect(mocks.applyEditorControllerDocumentStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prepareObject: options.prepareObject,
        rebuildFrameDecorations: options.rebuildFrameDecorations,
      })
    );
  });
});

describe('editor-controller-document.runner explicit apply options', () => {
  it('prefers explicit applyOptions over the legacy options field', async () => {
    const options = createOptions();

    await runApplyEditorControllerDocument({
      ...options,
      options: { resetHistory: false, updateOriginal: false },
    } as never);

    expect(mocks.applyEditorControllerDocumentStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyOptions: { resetHistory: true, updateOriginal: true },
      })
    );
  });
});
