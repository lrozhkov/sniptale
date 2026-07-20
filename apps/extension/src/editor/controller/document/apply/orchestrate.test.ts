import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadPreparedDocumentOnCanvas: vi.fn(async () => ({ id: 'source' })),
  maskCanvasElementDuringLoad: vi.fn(() => vi.fn()),
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
}));

vi.mock('./load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./load')>()),
  loadPreparedDocumentOnCanvas: mocks.loadPreparedDocumentOnCanvas,
}));

import { applyEditorDocumentToCanvas } from './orchestrate';

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
});
