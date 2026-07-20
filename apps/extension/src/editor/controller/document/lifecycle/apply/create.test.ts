import { describe, expect, it, vi } from 'vitest';
import type { ApplyEditorControllerDocumentOptions } from '../../apply-types';
import { createApplyEditorControllerDocumentParams } from './create';

function createOptions(): ApplyEditorControllerDocumentOptions & {
  canvas: NonNullable<ApplyEditorControllerDocumentOptions['canvas']>;
} {
  return {
    applyOptions: { resetHistory: true, updateOriginal: true },
    applyToolMode: vi.fn(),
    canvas: { id: 'canvas' },
    document: {
      canvasHeight: 60,
      canvasWidth: 100,
      sourceHeight: 60,
      sourceWidth: 100,
    },
    hasHistory: false,
    options: { resetHistory: false, updateOriginal: false },
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
  } as unknown as ApplyEditorControllerDocumentOptions & {
    canvas: NonNullable<ApplyEditorControllerDocumentOptions['canvas']>;
  };
}

describe('editor-controller-document.lifecycle.apply.create', () => {
  it('keeps normalized state params and runtime sync in one apply payload', () => {
    const options = createOptions();

    expect(createApplyEditorControllerDocumentParams(options)).toEqual(
      expect.objectContaining({
        applyOptions: options.applyOptions,
        canvas: options.canvas,
        document: options.document,
        setActiveTool: options.setActiveTool,
        setCanvasDocumentSize: options.setCanvasDocumentSize,
        setCropState: options.setCropState,
        setHistory: options.setHistory,
        setOriginalDocument: options.setOriginalDocument,
        setSource: options.setSource,
        syncRuntimeState: options.syncRuntimeState,
      })
    );
  });

  it('keeps a nullable canvas slot when the lifecycle owner has not mounted fabric yet', () => {
    const options = createOptions();

    expect(
      createApplyEditorControllerDocumentParams({
        ...options,
        canvas: null,
      }).canvas
    ).toBeNull();
  });
});
