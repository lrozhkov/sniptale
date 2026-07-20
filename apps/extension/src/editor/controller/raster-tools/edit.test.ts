// @vitest-environment jsdom

import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';

const mocks = vi.hoisted(() => ({
  applyRasterBitmap: vi.fn(async () => undefined),
  eraseRasterBitmap: vi.fn(),
  getSelectionMaskForSnapshot: vi.fn(() => null),
  mapScenePointToBitmap: vi.fn((snapshot, point) => ({
    x: point.x + snapshot.sceneBounds.left,
    y: point.y + snapshot.sceneBounds.top,
  })),
  notifyEditorRasterOverlay: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 6, y: 8 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'overlay-object' })),
  resolveSnapshotForEdit: vi.fn(),
}));

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    getSelectionMaskForSnapshot: mocks.getSelectionMaskForSnapshot,
    mapScenePointToBitmap: mocks.mapScenePointToBitmap,
    resolveSnapshotForEdit: mocks.resolveSnapshotForEdit,
  };
});

vi.mock('./session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session');
  return {
    ...actual,
    notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
  };
});

vi.mock('../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/mutations')>()),
  eraseRasterBitmap: mocks.eraseRasterBitmap,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

import {
  finishEraserDraft,
  handleEraserMouseDown,
  updateEraserDraft,
  updateRasterHoverCursor,
} from './edit';

function createBindings() {
  const session = createEditorRasterToolSession();
  return {
    bindings: {
      applyRasterBitmap: mocks.applyRasterBitmap,
      getRasterToolSession: () => session,
    },
    session,
  };
}

function createSnapshot() {
  return {
    bitmap: document.createElement('canvas'),
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { left: 10, top: 12, width: 30, height: 40 },
  };
}

function startEraserDraft(args: {
  bindings: ReturnType<typeof createBindings>['bindings'];
  canvas?: never;
}) {
  return handleEraserMouseDown(args.bindings as never, {} as never, new Point(10, 12));
}

function resetEnvironment() {
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
  });
  mocks.resolveSnapshotForEdit.mockResolvedValue({
    snapshot: createSnapshot(),
    targetObject: { id: 'target-object' },
  });
}

function registerEraserStartTest() {
  it('starts eraser drafts from the canonical active layer target', async () => {
    const { bindings } = createBindings();

    expect(await startEraserDraft({ bindings })).toBe(true);
    expect(mocks.resolveSnapshotForEdit).toHaveBeenCalledWith(bindings, {}, undefined);
    expect(mocks.eraseRasterBitmap).toHaveBeenCalledOnce();
  });
}

function registerEraserCommitTest() {
  it('updates eraser hover state and commits the bitmap on mouse-up', async () => {
    const { bindings, session } = createBindings();

    await startEraserDraft({ bindings });
    expect(updateEraserDraft(session, {} as never, null, new Point(14, 18))).toBe(true);
    expect(updateRasterHoverCursor(session, new Point(16, 20))).toBe(true);
    expect(await finishEraserDraft(bindings as never, session)).toBe(true);
    expect(mocks.applyRasterBitmap).toHaveBeenCalledWith(
      createSnapshot().reference,
      expect.any(HTMLCanvasElement)
    );
  });

  it('erases drag segments from the previous bitmap point to the current point', async () => {
    const { bindings, session } = createBindings();
    mocks.resolveBitmapPoint
      .mockReturnValueOnce({ x: 2, y: 3 })
      .mockReturnValueOnce({ x: 7, y: 3 });

    await startEraserDraft({ bindings });
    expect(updateEraserDraft(session, {} as never, null, new Point(18, 20))).toBe(true);

    expect(mocks.eraseRasterBitmap).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ points: [{ x: 2, y: 3 }] })
    );
    expect(mocks.eraseRasterBitmap).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        points: [
          { x: 2, y: 3 },
          { x: 7, y: 3 },
        ],
      })
    );
  });
}

function registerPointerTargetResolutionTest() {
  it('passes pointer targets through eraser snapshot resolution', async () => {
    const { bindings } = createBindings();
    const canvas = { id: 'canvas' };
    const fallbackTarget = { sniptaleId: 'pointer-layer' };

    await handleEraserMouseDown(
      bindings as never,
      canvas as never,
      new Point(10, 12),
      fallbackTarget as never
    );

    expect(mocks.resolveSnapshotForEdit).toHaveBeenCalledWith(bindings, canvas, fallbackTarget);
  });
}

function registerNoopGuardsTest() {
  it('stays inert when snapshot or bitmap projection resolution fails', async () => {
    const { bindings, session } = createBindings();

    mocks.resolveSnapshotForEdit.mockResolvedValueOnce(null);
    expect(await handleEraserMouseDown(bindings as never, {} as never, new Point(10, 12))).toBe(
      false
    );

    expect(updateEraserDraft(session, {} as never, null, new Point(10, 12))).toBe(false);
    expect(await finishEraserDraft(bindings as never, session)).toBe(false);
  });
}

describe('editor-controller/raster-tools/edit', () => {
  beforeEach(resetEnvironment);
  registerEraserStartTest();
  registerEraserCommitTest();
  registerPointerTargetResolutionTest();
  registerNoopGuardsTest();
});
