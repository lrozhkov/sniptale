// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyViewportZoom: vi.fn(),
  ensureSourceLayer: vi.fn(),
  prepareAppliedDocument: vi.fn(),
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

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  prepareAppliedDocument: mocks.prepareAppliedDocument,
}));

vi.mock('../core/debug', () => ({
  logEditorOpenTrace: vi.fn(),
  logEditorSourceTrace: vi.fn(),
}));

vi.mock('./source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source')>()),
  ensureEditorSourceLayer: mocks.ensureSourceLayer,
}));

vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  applyEditorViewportZoom: mocks.applyViewportZoom,
}));

import { applyEditorDocumentToCanvas } from './apply';

it('syncs legacy frame background against the prepared canvas size during document apply', async () => {
  const canvas = {
    backgroundColor: 'black',
    backgroundImage: 'image',
    clear: vi.fn(),
    getElement: vi.fn(() => ({ style: { backgroundColor: '' } })),
    getObjects: vi.fn(() => []),
    loadFromJSON: vi.fn(async () => undefined),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  } as never;
  const syncBackgroundLayer = vi.fn(async () => undefined);

  mocks.prepareAppliedDocument.mockReturnValue({
    canvasSize: { height: 180, width: 320 },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
    },
    source: { displayHeight: 90, displayWidth: 160, intrinsicHeight: 90, intrinsicWidth: 160 },
  });
  mocks.ensureSourceLayer.mockResolvedValue(null);

  await applyEditorDocumentToCanvas({
    canvas,
    document: { id: 'document' } as never,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncBackgroundLayer,
    upgradeLegacyArrowObjects: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  });

  expect(syncBackgroundLayer).toHaveBeenCalledWith(
    { backgroundMode: 'color' },
    { height: 180, width: 320 }
  );
  expect(mocks.applyViewportZoom).toHaveBeenCalledWith(canvas, { height: 180, width: 320 }, 2, 1);
});
