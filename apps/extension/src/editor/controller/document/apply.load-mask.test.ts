import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyViewportZoomMock: vi.fn(),
  ensureSourceLayerMock: vi.fn(async () => null),
  prepareAppliedDocumentMock: vi.fn(() => ({
    canvasSize: { height: 60, width: 100 },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
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

it('masks the canvas element with the workspace color while the document is loading', async () => {
  const style = { backgroundColor: 'initial-mask' };
  const canvas = {
    backgroundColor: 'transparent',
    getElement: vi.fn(() => ({ style })),
    getObjects: vi.fn(() => []),
    loadFromJSON: vi.fn(async () => {
      expect(style.backgroundColor).toBe('#445566');
    }),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  };

  await applyEditorDocumentToCanvas({
    canvas: canvas as never,
    document: { id: 'document' } as never,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    upgradeLegacyArrowObjects: vi.fn(),
    zoomLevel: 2,
  });

  expect(style.backgroundColor).toBe('initial-mask');
});
