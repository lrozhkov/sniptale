import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorDocumentToCanvas: vi.fn(async () => ({
    prepared: { normalizedDocument: { id: 'document' } },
    source: null,
  })),
  applyPreparedEditorDocumentState: vi.fn<(options: unknown) => void>(),
}));

vi.mock('./apply/orchestrate', () => ({
  applyEditorDocumentToCanvas: mocks.applyEditorDocumentToCanvas,
}));
vi.mock('./lifecycle-helpers', () => ({
  applyPreparedEditorDocumentState: mocks.applyPreparedEditorDocumentState,
}));

import { applyEditorControllerDocumentState } from './state';

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  'forwards optional history viewport and background sync options: %s %s',
  async (preserveViewport, syncBackground) => {
    mocks.applyEditorDocumentToCanvas.mockClear();
    await applyEditorControllerDocumentState({
      canvas: { getObjects: () => [] } as never,
      document: { id: 'document' } as never,
      zoomLevel: 1,
      applyOptions: preserveViewport ? { preserveViewport: true } : {},
      prepareObject: vi.fn(),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      ...(syncBackground ? { syncBackgroundLayer: vi.fn(async () => undefined) } : {}),
      applyToolMode: vi.fn(),
      hasHistory: true,
      setCanvasDocumentSize: vi.fn(),
      setSource: vi.fn(),
      setCropState: vi.fn(),
      setActiveTool: vi.fn(),
      setOriginalDocument: vi.fn(),
      setHistory: vi.fn(),
    });

    const applyOptions = (
      mocks.applyEditorDocumentToCanvas.mock.calls as unknown as Array<[object]>
    )[0]?.[0];
    expect(applyOptions).toBeDefined();
    if (preserveViewport) expect(applyOptions).toHaveProperty('preserveViewport', true);
    else expect(applyOptions).not.toHaveProperty('preserveViewport');
    if (syncBackground)
      expect(applyOptions).toHaveProperty('syncBackgroundLayer', expect.any(Function));
    else expect(applyOptions).not.toHaveProperty('syncBackgroundLayer');
  }
);

it.each([true, false])(
  'admits fresh source content only with explicit creation intent: %s',
  async (freshSourceContent) => {
    const source = {
      sniptaleType: 'source-image',
      sniptaleRole: 'source',
      sniptaleLocked: true,
      sniptaleContentLocked: undefined as boolean | undefined,
      toObject() {
        return {
          sniptaleType: this.sniptaleType,
          sniptaleContentLocked: this.sniptaleContentLocked,
        };
      },
    };
    await applyEditorControllerDocumentState({
      canvas: { getObjects: () => [source] } as never,
      document: { id: 'document' } as never,
      zoomLevel: 1,
      applyOptions: { freshSourceContent, resetHistory: true, updateOriginal: true },
      prepareObject: vi.fn(),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      applyToolMode: vi.fn(),
      hasHistory: false,
      setCanvasDocumentSize: vi.fn(),
      setSource: vi.fn(),
      setCropState: vi.fn(),
      setActiveTool: vi.fn(),
      setOriginalDocument: vi.fn(),
      setHistory: vi.fn(),
    });
    expect(source.sniptaleLocked).toBe(true);
    expect(source.sniptaleContentLocked).toBe(freshSourceContent ? false : undefined);
    const result = mocks.applyPreparedEditorDocumentState.mock.lastCall?.[0];
    if (freshSourceContent)
      expect(result).toHaveProperty(
        'prepared.normalizedDocument.canvasJson',
        JSON.stringify({
          version: '7.2.0',
          objects: [{ sniptaleType: 'source-image', sniptaleContentLocked: false }],
        })
      );
  }
);
