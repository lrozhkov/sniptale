import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRichShapeObject: vi.fn(() => ({ sniptaleId: 'rich-object' })),
  ensureEditorSourceLayer: vi.fn(async () => ({ id: 'source' })),
  prepareCanvasForDocumentLoad: vi.fn(),
  renderCanvasAfterDocumentLoad: vi.fn(),
}));

vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  createRichShapeObject: mocks.createRichShapeObject,
}));

vi.mock('../source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../source')>()),
  ensureEditorSourceLayer: mocks.ensureEditorSourceLayer,
}));

vi.mock('../../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/debug')>()),
  logEditorSourceTrace: vi.fn(),
}));

vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  prepareCanvasForDocumentLoad: mocks.prepareCanvasForDocumentLoad,
  renderCanvasAfterDocumentLoad: mocks.renderCanvasAfterDocumentLoad,
}));

import { loadPreparedDocumentOnCanvas, restoreRichShapeObjects } from './load';

function createPreparedDocument() {
  return {
    canvasSize: { height: 20, width: 30 },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
      richShapes: [{ id: 'rich-1' }],
    },
    source: { displayHeight: 20, displayWidth: 30 },
  };
}

describe('document apply load owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRichShapeObject.mockReturnValue({ sniptaleId: 'rich-object' });
  });

  it('loads prepared JSON, restores rich shapes, source, background, and render', async () => {
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => [{ sniptaleId: 'json-object' }]),
      loadFromJSON: vi.fn(async () => undefined),
    };
    const prepareObject = vi.fn();
    const syncBackgroundLayer = vi.fn(async () => undefined);

    await expect(
      loadPreparedDocumentOnCanvas({
        canvas: canvas as never,
        prepared: createPreparedDocument() as never,
        prepareObject,
        rebuildFrameDecorations: vi.fn(async () => undefined),
        syncBackgroundLayer,
        upgradeLegacyArrowObjects: vi.fn(),
        zoomLevel: 1,
      })
    ).resolves.toEqual({ id: 'source' });

    expect(canvas.loadFromJSON).toHaveBeenCalledWith('{"objects":[]}');
    expect(prepareObject).toHaveBeenCalledWith({ sniptaleId: 'json-object' });
    expect(canvas.add).toHaveBeenCalledWith({ sniptaleId: 'rich-object' });
    expect(syncBackgroundLayer).toHaveBeenCalledWith(
      { backgroundMode: 'color' },
      { height: 20, width: 30 }
    );
    expect(mocks.renderCanvasAfterDocumentLoad).toHaveBeenCalledWith(canvas);
  });

  it('skips rich shapes that cannot be reconstructed', () => {
    const canvas = { add: vi.fn() };
    mocks.createRichShapeObject.mockReturnValue(null as never);

    restoreRichShapeObjects(canvas as never, [{ id: 'rich-1' }] as never, {
      prepareObject: vi.fn(),
    });

    expect(canvas.add).not.toHaveBeenCalled();
  });
});
