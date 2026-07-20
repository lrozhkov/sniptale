import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyViewportZoomMock: vi.fn(),
  createRichShapeObjectMock: vi.fn(() => ({ sniptaleId: 'rich-object' })),
  ensureSourceLayerMock: vi.fn(async () => null),
  prepareAppliedDocumentMock: vi.fn(() => ({
    canvasSize: { height: 60, width: 100 },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
      richShapes: [{ id: 'rich-1', objectType: 'rich-shape' }],
    },
    source: { displayHeight: 60, displayWidth: 100 },
  })),
  storeGetStateMock: vi.fn(() => ({
    workspace: { backgroundColor: '#445566' },
  })),
}));

vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  createRichShapeObject: mocks.createRichShapeObjectMock,
}));

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  prepareAppliedDocument: mocks.prepareAppliedDocumentMock,
}));

vi.mock('../core/debug', () => ({
  logEditorOpenTrace: vi.fn(),
  logEditorSourceTrace: vi.fn(),
}));

vi.mock('./source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source')>()),
  ensureEditorSourceLayer: mocks.ensureSourceLayerMock,
}));

vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  applyEditorViewportZoom: mocks.applyViewportZoomMock,
}));

import { applyEditorDocumentToCanvas } from './apply';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRichShapeObjectMock.mockReturnValue({ sniptaleId: 'rich-object' });
});

it('restores rich shape document objects after Fabric JSON load', async () => {
  const addedObjects: unknown[] = [];
  const prepareObject = vi.fn();
  const canvas = {
    add: vi.fn((object) => addedObjects.push(object)),
    backgroundColor: 'transparent',
    getObjects: vi.fn(() => []),
    loadFromJSON: vi.fn(async () => undefined),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  };

  await applyEditorDocumentToCanvas({
    canvas: canvas as never,
    document: { id: 'document' } as never,
    prepareObject,
    rebuildFrameDecorations: vi.fn(async () => undefined),
    upgradeLegacyArrowObjects: vi.fn(),
    zoomLevel: 1,
  });

  expect(mocks.createRichShapeObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'rich-1' })
  );
  expect(prepareObject).toHaveBeenCalledWith({ sniptaleId: 'rich-object' });
  expect(addedObjects).toEqual([{ sniptaleId: 'rich-object' }]);
});

it('skips rich shape document objects when their geometry cannot be restored', async () => {
  const canvas = {
    add: vi.fn(),
    backgroundColor: 'transparent',
    getObjects: vi.fn(() => []),
    loadFromJSON: vi.fn(async () => undefined),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  };

  mocks.createRichShapeObjectMock.mockReturnValue(null as never);

  await applyEditorDocumentToCanvas({
    canvas: canvas as never,
    document: { id: 'document' } as never,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    upgradeLegacyArrowObjects: vi.fn(),
    zoomLevel: 1,
  });

  expect(canvas.add).not.toHaveBeenCalled();
});

it('leaves applied documents without rich shape objects unchanged', async () => {
  const canvas = {
    add: vi.fn(),
    backgroundColor: 'transparent',
    getObjects: vi.fn(() => []),
    loadFromJSON: vi.fn(async () => undefined),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  };

  mocks.prepareAppliedDocumentMock.mockReturnValueOnce({
    canvasSize: { height: 60, width: 100 },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
    } as never,
    source: { displayHeight: 60, displayWidth: 100 },
  });

  await applyEditorDocumentToCanvas({
    canvas: canvas as never,
    document: { id: 'document' } as never,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    upgradeLegacyArrowObjects: vi.fn(),
    zoomLevel: 1,
  });

  expect(mocks.createRichShapeObjectMock).not.toHaveBeenCalled();
  expect(canvas.add).not.toHaveBeenCalled();
});
