import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadPreparedDocumentOnCanvas: vi.fn(async () => ({ id: 'source' })),
  maskCanvasElementDuringLoad: vi.fn(() => vi.fn()),
  freezeCanvasVisualDuringLoad: vi.fn(() => vi.fn()),
  prepareAppliedDocument: vi.fn(() => ({
    canvasSize: { height: 20, width: 30 },
    normalizedDocument: { canvasJson: '{"objects":[]}' },
    source: { displayHeight: 20, displayWidth: 30 },
  })),
  storeGetState: vi.fn(() => ({ workspace: { backgroundColor: '#445566' } })),
}));

vi.mock('../../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/useEditorStore')>()),
  useEditorStore: { getState: mocks.storeGetState },
}));

vi.mock('..', async (importOriginal) => ({
  ...(await importOriginal<typeof import('..')>()),
  prepareAppliedDocument: mocks.prepareAppliedDocument,
}));

vi.mock('../../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/debug')>()),
  logEditorOpenTrace: vi.fn(),
}));

vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  maskCanvasElementDuringLoad: mocks.maskCanvasElementDuringLoad,
  freezeCanvasVisualDuringLoad: mocks.freezeCanvasVisualDuringLoad,
}));

vi.mock('./load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./load')>()),
  loadPreparedDocumentOnCanvas: mocks.loadPreparedDocumentOnCanvas,
}));

import { applyEditorDocumentToCanvas } from './orchestrate';
import { EditorCanvas } from '../../../document/canvas-surface/render-region';

function createOptions() {
  return {
    canvas: { id: 'canvas' },
    document: { id: 'document' },
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncBackgroundLayer: vi.fn(async () => undefined),
    upgradeLegacyArrowObjects: vi.fn(),
    viewportDevicePixelRatioBaseline: 2,
    zoomLevel: 1,
  };
}

describe('document apply orchestration owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPreparedDocumentOnCanvas.mockResolvedValue({ id: 'source' });
    mocks.maskCanvasElementDuringLoad.mockReturnValue(vi.fn());
    mocks.freezeCanvasVisualDuringLoad.mockReturnValue(vi.fn());
  });

  it('prepares the document, masks the canvas, and delegates prepared load', async () => {
    const result = await applyEditorDocumentToCanvas(createOptions() as never);

    expect(result.source).toEqual({ id: 'source' });
    expect(mocks.maskCanvasElementDuringLoad).toHaveBeenCalledWith({ id: 'canvas' }, '#445566');
    expect(mocks.loadPreparedDocumentOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 2, zoomLevel: 1 })
    );
  });

  it('restores the canvas mask when prepared load fails', async () => {
    const restore = vi.fn();
    mocks.maskCanvasElementDuringLoad.mockReturnValueOnce(restore);
    mocks.loadPreparedDocumentOnCanvas.mockRejectedValueOnce(new Error('load failed'));

    await expect(applyEditorDocumentToCanvas(createOptions() as never)).rejects.toThrow(
      'load failed'
    );
    expect(restore).toHaveBeenCalledOnce();
  });

  it('holds the previous visual during history replay and removes it on failure', async () => {
    const restoreVisual = vi.fn();
    mocks.freezeCanvasVisualDuringLoad.mockReturnValueOnce(restoreVisual);
    mocks.loadPreparedDocumentOnCanvas.mockRejectedValueOnce(new Error('load failed'));

    await expect(
      applyEditorDocumentToCanvas({ ...createOptions(), preserveViewport: true } as never)
    ).rejects.toThrow('load failed');
    expect(mocks.freezeCanvasVisualDuringLoad).toHaveBeenCalledWith({ id: 'canvas' });
    expect(restoreVisual).toHaveBeenCalledOnce();
  });

  it('keeps the old visual until a history document has finished loading', async () => {
    let finishLoad: (() => void) | undefined;
    const pendingLoad = new Promise<{ id: string }>((resolve) => {
      finishLoad = () => resolve({ id: 'restored-source' });
    });
    const restoreVisual = vi.fn();
    mocks.freezeCanvasVisualDuringLoad.mockReturnValueOnce(restoreVisual);
    mocks.loadPreparedDocumentOnCanvas.mockReturnValueOnce(pendingLoad);

    const applying = applyEditorDocumentToCanvas({
      ...createOptions(),
      preserveViewport: true,
    } as never);
    expect(restoreVisual).not.toHaveBeenCalled();
    finishLoad?.();
    await applying;
    expect(restoreVisual).toHaveBeenCalledOnce();
    expect(mocks.loadPreparedDocumentOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ preserveViewport: true })
    );
  });

  it('restores and renders the captured viewport before removing the history visual', async () => {
    const restoreVisual = vi.fn();
    const canvas = Object.assign(Object.create(EditorCanvas.prototype) as EditorCanvas, {
      captureDocumentViewportPosition: vi.fn(() => ({ x: 123, y: 45 })),
      restoreDocumentViewportPosition: vi.fn(),
      renderAll: vi.fn(),
    });
    mocks.freezeCanvasVisualDuringLoad.mockReturnValueOnce(restoreVisual);

    await applyEditorDocumentToCanvas({
      ...createOptions(),
      canvas,
      preserveViewport: true,
    } as never);

    expect(canvas.restoreDocumentViewportPosition).toHaveBeenCalledWith({ x: 123, y: 45 });
    expect(canvas.renderAll).toHaveBeenCalledOnce();
    expect(canvas.renderAll.mock.invocationCallOrder[0]).toBeLessThan(
      restoreVisual.mock.invocationCallOrder[0]!
    );
  });
});
