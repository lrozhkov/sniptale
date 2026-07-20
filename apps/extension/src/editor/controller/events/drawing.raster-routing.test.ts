/* eslint-disable max-lines-per-function --
   exact raster routing proof keeps event-binding construction and lifecycle routing together */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerEventBindings } from './types';

const mocks = vi.hoisted(() => ({
  handleRasterToolMouseDownMock: vi.fn(async () => false),
  handleRasterToolMouseMoveMock: vi.fn(() => false),
  handleRasterToolMouseUpMock: vi.fn(async () => false),
}));

vi.mock('../raster-tools/interactions/down', () => ({
  handleRasterToolMouseDown: mocks.handleRasterToolMouseDownMock,
}));

vi.mock('../raster-tools/interactions/move', () => ({
  handleRasterToolMouseMove: mocks.handleRasterToolMouseMoveMock,
}));

vi.mock('../raster-tools/interactions/up', () => ({
  handleRasterToolMouseUp: mocks.handleRasterToolMouseUpMock,
}));

vi.mock('../raster-tools/interactions/tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/interactions/tool')>()),
  isRasterEditorTool: (tool: string) =>
    tool === 'selection' || tool === 'brush' || tool === 'eraser' || tool === 'fill',
}));

import { createDrawingEventHandlers } from './drawing';

function createBindings(): EditorControllerEventBindings {
  const canvas = {
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
  };

  return {
    addObject: vi.fn(),
    advanceStepValue: vi.fn(),
    applyCropSelection: vi.fn(),
    applyGridSnap: vi.fn(),
    applyRasterBitmap: vi.fn(async () => undefined),
    cancelTransientInteraction: vi.fn(() => false),
    clearRasterSelection: vi.fn(),
    commitHistory: vi.fn(),
    decorateShape: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    getActiveCropRect: vi.fn(() => null),
    getActiveTool: () => 'selection',
    getCanvas: () => canvas as never,
    getCanvasDocumentSize: () => ({ height: 200, width: 320 }),
    getCropGuide: vi.fn(() => null),
    getCropSelection: vi.fn(() => null),
    getDrawSession: vi.fn(() => null),
    getHistoryMuted: () => 0,
    getIsSpacePressed: () => false,
    getPanSession: vi.fn(() => null),
    getRasterToolSession: vi.fn(() => ({
      brushDraft: null,
      eraserDraft: null,
      gradientDraft: null,
      hoverCursor: null,
      lassoDraft: null,
      marqueeDraft: null,
      overlayListeners: new Set(),
      selection: null,
      clipboard: null,
    })),
    getSource: () => ({ id: 'source' }) as never,
    getViewportElement: vi.fn(() => null),
    getViewportSyncFrame: () => 0,
    nextLabelIndex: vi.fn(() => 1),
    prepareObject: vi.fn(),
    redo: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setIsSpacePressed: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn(),
    setViewportSyncFrame: vi.fn(),
    startDrawSession: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    undo: vi.fn(),
  } as unknown as EditorControllerEventBindings;
}

describe('editor-controller-events-drawing raster routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes raster tools through raster interaction ownership for down, move, and up', async () => {
    const bindings = createBindings();
    mocks.handleRasterToolMouseDownMock.mockResolvedValueOnce(true);
    mocks.handleRasterToolMouseMoveMock.mockReturnValueOnce(true);
    mocks.handleRasterToolMouseUpMock.mockResolvedValueOnce(true);
    const handlers = createDrawingEventHandlers(bindings);

    handlers.handleMouseDown({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'layer-1' },
    } as never);
    handlers.handleMouseMove({ e: { kind: 'pointer' } } as never);
    handlers.handleMouseUp();
    await Promise.resolve();

    expect(mocks.handleRasterToolMouseDownMock).toHaveBeenCalledOnce();
    expect(mocks.handleRasterToolMouseDownMock).toHaveBeenCalledWith(
      bindings,
      expect.objectContaining({
        event: expect.objectContaining({
          target: expect.objectContaining({ sniptaleId: 'layer-1' }),
        }),
      })
    );
    expect(mocks.handleRasterToolMouseMoveMock).toHaveBeenCalledOnce();
    expect(mocks.handleRasterToolMouseUpMock).toHaveBeenCalledOnce();
  });

  it('keeps raster secondary-button mouse down out of raster mutation ownership', async () => {
    const bindings = createBindings();
    const handlers = createDrawingEventHandlers(bindings);

    handlers.handleMouseDown({
      e: { button: 2, kind: 'pointer' },
    } as never);
    await Promise.resolve();

    expect(mocks.handleRasterToolMouseDownMock).not.toHaveBeenCalled();
  });
});
