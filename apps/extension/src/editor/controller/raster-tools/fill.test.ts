// @vitest-environment jsdom

import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_RASTER_FILL_MODE } from '../../state/raster-tools';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';

const mocks = vi.hoisted(() => ({
  applyRasterBitmap: vi.fn(async () => undefined),
  fillRasterBitmap: vi.fn(),
  fillRasterBitmapWithLinearGradient: vi.fn(),
  floodFillRasterBitmap: vi.fn(),
  getSelectionMaskForSnapshot: vi.fn(() => null),
  notifyEditorRasterOverlay: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 6, y: 8 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'overlay-object' })),
  resolveSnapshotForEdit: vi.fn(),
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  getSelectionMaskForSnapshot: mocks.getSelectionMaskForSnapshot,
  resolveSnapshotForEdit: mocks.resolveSnapshotForEdit,
}));

vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
}));

vi.mock('../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/mutations')>()),
  fillRasterBitmap: mocks.fillRasterBitmap,
  fillRasterBitmapWithLinearGradient: mocks.fillRasterBitmapWithLinearGradient,
  floodFillRasterBitmap: mocks.floodFillRasterBitmap,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

import { finishGradientDraft, handleFillMouseDown, updateGradientDraft } from './fill';

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

function enableGradientFillMode() {
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      fillMode: EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT,
    },
  });
}

function registerBucketFillTest() {
  it('handles bucket fills through the bitmap mutation seam', async () => {
    const { bindings, session } = createBindings();

    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(10, 12))).toBe(true);
    expect(mocks.floodFillRasterBitmap).toHaveBeenCalledOnce();
    expect(mocks.applyRasterBitmap).toHaveBeenCalledOnce();
    expect(session.gradientDraft).toBeNull();
  });
}

function registerPointerTargetTest() {
  it('passes pointer targets through fill snapshot resolution', async () => {
    const { bindings } = createBindings();
    const canvas = { id: 'canvas' };
    const fallbackTarget = { sniptaleId: 'pointer-layer' };

    await handleFillMouseDown(
      bindings as never,
      canvas as never,
      new Point(10, 12),
      fallbackTarget as never
    );

    expect(mocks.resolveSnapshotForEdit).toHaveBeenCalledWith(bindings, canvas, fallbackTarget);
  });
}

function registerGradientFillTest() {
  it('handles gradient fills and commit lifecycle', async () => {
    const { bindings, session } = createBindings();

    enableGradientFillMode();
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(12, 16))).toBe(true);
    expect(updateGradientDraft(session, {} as never, {} as never, new Point(14, 18))).toBe(true);
    expect(await finishGradientDraft(bindings as never, session)).toBe(true);
    expect(mocks.fillRasterBitmapWithLinearGradient).toHaveBeenCalledWith(
      expect.objectContaining({
        stops: [
          { color: '#112233', offset: 0 },
          { color: '#ffffff', offset: 1 },
        ],
      })
    );
    session.gradientDraft = null;
    expect(await finishGradientDraft(bindings as never, session)).toBe(false);
  });
}

function registerNoopGuardTest() {
  it('stays inert when snapshot or bitmap projection resolution fails', async () => {
    const { bindings, session } = createBindings();

    mocks.resolveSnapshotForEdit.mockResolvedValueOnce(null);
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(10, 12))).toBe(
      false
    );

    mocks.resolveSnapshotForEdit.mockResolvedValueOnce({
      snapshot: createSnapshot(),
      targetObject: { id: 'target-object' },
    });
    mocks.resolveBitmapPoint.mockReturnValueOnce(null as never);
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(10, 12))).toBe(
      false
    );

    expect(updateGradientDraft(session, {} as never, {} as never, new Point(10, 12))).toBe(false);
  });
}

describe('editor-controller/raster-tools/fill', () => {
  beforeEach(resetEnvironment);
  registerBucketFillTest();
  registerPointerTargetTest();
  registerGradientFillTest();
  registerNoopGuardTest();
});
