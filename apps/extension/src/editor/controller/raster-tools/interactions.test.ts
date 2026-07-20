// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact raster interaction proof keeps down, move, and up routing together */
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';
import {
  handleRasterToolMouseDown,
  handleRasterToolMouseMove,
  handleRasterToolMouseUp,
  isRasterEditorTool,
} from './interactions';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  resolveRasterTarget: vi.fn(),
  resolveRasterTargetState: vi.fn(),
  resolveBitmapPoint: vi.fn(),
  resolveRasterOverlayObject: vi.fn(),
  createEmptyRasterMask: vi.fn(),
  replaceRasterMaskWithRect: vi.fn(),
  rasterMaskHasPixels: vi.fn(() => true),
  fillRasterBitmap: vi.fn(),
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveRasterTarget: mocks.resolveRasterTarget,
  resolveRasterTargetState: mocks.resolveRasterTargetState,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

vi.mock('../raster/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/selection')>()),
  createEmptyRasterMask: mocks.createEmptyRasterMask,
  rasterMaskHasPixels: mocks.rasterMaskHasPixels,
  replaceRasterMaskWithFloodSelection: vi.fn(),
  replaceRasterMaskWithPolygon: vi.fn(),
  replaceRasterMaskWithRect: mocks.replaceRasterMaskWithRect,
}));

vi.mock('../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/mutations')>()),
  eraseRasterBitmap: vi.fn(),
  fillRasterBitmap: mocks.fillRasterBitmap,
  fillRasterBitmapWithLinearGradient: vi.fn(),
  floodFillRasterBitmap: vi.fn(),
}));

function createBindings(activeTool: 'selection' | 'brush' | 'fill' | 'eraser') {
  const session = createEditorRasterToolSession();
  const applyRasterBitmap = vi.fn(async () => undefined);
  const syncRuntimeState = vi.fn();

  return {
    applyRasterBitmap,
    session,
    syncRuntimeState,
    bindings: {
      getActiveTool: () => activeTool,
      getCanvas: () => ({}) as never,
      getCanvasDocumentSize: () => ({ width: 100, height: 100 }),
      getCropGuide: () => null,
      getCropSelection: () => null,
      getCropSelectionMouseEnabled: () => true,
      setCropState: vi.fn(),
      getDrawSession: () => null,
      setDrawSession: vi.fn(),
      getSource: () => null,
      setSource: vi.fn(),
      getHistoryMuted: () => 0,
      getIsSpacePressed: () => false,
      setIsSpacePressed: vi.fn(),
      getPanSession: () => null,
      setPanSession: vi.fn(),
      getViewportElement: () => null,
      getViewportSyncFrame: () => 0,
      setViewportSyncFrame: vi.fn(),
      getRasterToolSession: () => session,
      addObject: vi.fn(),
      cancelTransientInteraction: vi.fn(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      duplicateSelection: vi.fn(),
      copyRasterSelection: vi.fn(),
      cutRasterSelection: vi.fn(),
      pasteRasterClipboard: vi.fn(),
      deleteRasterSelectionPixels: vi.fn(),
      deleteSelection: vi.fn(),
      applyCropSelection: vi.fn(),
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(() => 1),
      syncRuntimeState,
      syncViewportState: vi.fn(),
      clearRasterSelection: vi.fn(),
      applyRasterBitmap,
    },
  };
}

function resetRasterInteractionEnvironment() {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterToolSettings: {
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      selectionMode: 'marquee',
      eraserSize: 24,
      fillMode: 'bucket',
      fillColor: '#112233',
      gradientFrom: '#112233',
      gradientTo: '#ffffff',
    },
    rasterSelection: {
      hasSelection: false,
      targetLayerId: null,
      targetLayerName: null,
    },
    rasterTarget: {
      status: 'ready',
      layerId: 'layer-1',
      layerName: 'Layer 1',
    },
  });
  mocks.resolveRasterTarget.mockReturnValue({
    object: { getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }) },
    reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
  });
  mocks.resolveRasterTargetState.mockReturnValue({
    summary: {
      layerId: 'layer-1',
      layerName: 'Layer 1',
      status: 'ready',
    },
    target: {
      object: { getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }) },
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    },
  });
  mocks.createRasterTargetSnapshot.mockResolvedValue({
    reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    bitmap: { width: 30, height: 40 },
    sceneBounds: { left: 10, top: 20, width: 30, height: 40 },
  });
  mocks.resolveBitmapPoint.mockReturnValue({ x: 6, y: 8 });
  mocks.resolveRasterOverlayObject.mockReturnValue({
    getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
  });
  mocks.createEmptyRasterMask.mockReturnValue({ width: 30, height: 40 });
}

describe('editor-controller/raster-tools/interactions', () => {
  beforeEach(() => {
    resetRasterInteractionEnvironment();
  });

  it('converts marquee drags into persistent raster selection masks', async () => {
    const { bindings, session } = createBindings('selection');
    const canvas = { getScenePoint: () => new Point(12, 16) } as never;

    await handleRasterToolMouseDown(bindings, { canvas, event: { e: {} as never } });
    await handleRasterToolMouseUp(bindings);

    expect(session.selection?.reference).toEqual({
      kind: 'object',
      objectId: 'layer-1',
      objectName: 'Layer 1',
    });
    expect(mocks.replaceRasterMaskWithRect).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().rasterSelection).toEqual({
      hasSelection: true,
      targetLayerId: 'layer-1',
      targetLayerName: 'Layer 1',
    });
  });

  it('applies bucket fills through the controller mutation seam when a raster selection is active', async () => {
    const { bindings, session, applyRasterBitmap } = createBindings('fill');
    session.selection = {
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      maskCanvas: { width: 30, height: 40 } as never,
    };
    const canvas = { getScenePoint: () => new Point(12, 16) } as never;

    await handleRasterToolMouseDown(bindings, { canvas, event: { e: {} as never } });

    expect(mocks.fillRasterBitmap).toHaveBeenCalledOnce();
    expect(applyRasterBitmap).toHaveBeenCalledWith(
      { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      expect.anything()
    );
  });

  it('updates transient move branches and keeps non-raster tools out of the raster interaction owner', async () => {
    const { bindings, session } = createBindings('selection');
    const canvas = { getScenePoint: () => new Point(20, 24) } as never;

    expect(isRasterEditorTool('selection')).toBe(true);
    expect(isRasterEditorTool('brush')).toBe(true);
    expect(isRasterEditorTool('text')).toBe(false);
    expect(handleRasterToolMouseMove(bindings, { canvas, event: { e: {} as never } })).toBe(false);

    session.marqueeDraft = {
      currentBitmapPoint: { x: 1, y: 1 },
      snapshot: {
        bitmap: { width: 30, height: 40 } as never,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
        sceneBounds: { left: 10, top: 20, width: 30, height: 40 },
      },
      startBitmapPoint: { x: 0, y: 0 },
    };
    expect(handleRasterToolMouseMove(bindings, { canvas, event: { e: {} as never } })).toBe(true);
    session.marqueeDraft = null;

    session.selection = null;
    const eraserBindings = createBindings('fill');
    expect(await handleRasterToolMouseUp(eraserBindings.bindings)).toBe(false);
  });

  it('keeps eraser hover gated by the canonical raster target status', async () => {
    useEditorStore.setState({
      rasterTarget: {
        status: 'missing',
        layerId: null,
        layerName: null,
      },
    });
    const { bindings, session } = createBindings('eraser');
    const canvas = { getScenePoint: () => new Point(30, 32) } as never;
    mocks.resolveRasterTargetState.mockReturnValueOnce({
      summary: {
        status: 'missing',
        layerId: null,
        layerName: null,
      },
      target: null,
    });

    expect(handleRasterToolMouseMove(bindings, { canvas, event: { e: {} as never } })).toBe(false);
    expect(session.hoverCursor).toBeNull();
    expect(await handleRasterToolMouseUp(bindings)).toBe(true);

    const nonRasterBindings = createBindings('selection').bindings;
    nonRasterBindings.getActiveTool = () => 'text' as never;
    expect(
      await handleRasterToolMouseDown(nonRasterBindings, { canvas, event: { e: {} as never } })
    ).toBe(false);
  });

  it('advances lasso and gradient drafts through mouse-move ownership', () => {
    const { bindings, session } = createBindings('selection');
    const canvas = { getScenePoint: () => new Point(14, 18) } as never;

    session.lassoDraft = {
      bitmapPoints: [],
      scenePoints: [new Point(10, 12)],
      snapshot: {
        bitmap: { width: 30, height: 40 } as never,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
        sceneBounds: { left: 10, top: 20, width: 30, height: 40 },
      },
    };
    expect(handleRasterToolMouseMove(bindings, { canvas, event: { e: {} as never } })).toBe(true);

    session.lassoDraft = null;
    session.gradientDraft = {
      currentBitmapPoint: { x: 6, y: 8 },
      currentScenePoint: new Point(10, 12),
      snapshot: {
        bitmap: { width: 30, height: 40 } as never,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
        sceneBounds: { left: 10, top: 20, width: 30, height: 40 },
      },
      startBitmapPoint: { x: 3, y: 4 },
      startScenePoint: new Point(10, 12),
    };
    expect(handleRasterToolMouseMove(bindings, { canvas, event: { e: {} as never } })).toBe(true);
  });
});
