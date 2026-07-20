// @vitest-environment jsdom

import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_RASTER_FILL_MODE } from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import { createEditorRasterToolSession } from '../session';

const mocks = vi.hoisted(() => ({
  applyRasterBitmap: vi.fn(async () => undefined),
  fillRasterBitmap: vi.fn(),
  fillRasterBitmapWithLinearGradient: vi.fn(),
  getSelectionMaskForSnapshot: vi.fn(() => null),
  notifyEditorRasterOverlay: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 3, y: 4 })),
  resolveSnapshotForEdit: vi.fn(),
}));

vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  getSelectionMaskForSnapshot: mocks.getSelectionMaskForSnapshot,
  resolveSnapshotForEdit: mocks.resolveSnapshotForEdit,
}));

vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
}));

vi.mock('../../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/mutations')>()),
  fillRasterBitmap: mocks.fillRasterBitmap,
  fillRasterBitmapWithLinearGradient: mocks.fillRasterBitmapWithLinearGradient,
}));

vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

import { applyBucketFill } from './bucket';
import { finishGradientDraft } from './gradient-draft';
import { handleFillMouseDown } from './mouse-down';

function createSnapshot() {
  return {
    bitmap: document.createElement('canvas'),
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { height: 10, left: 0, top: 0, width: 10 },
  };
}

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

function resetEnvironment() {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterToolSettings: {
      brushColor: '#111827',
      brushHardness: 1,
      brushOpacity: 1,
      brushSize: 20,
      eraserSize: 20,
      fillColor: '#112233',
      fillMode: EDITOR_RASTER_FILL_MODE.BUCKET,
      gradientFrom: '#112233',
      gradientTo: '#ffffff',
      selectionMode: 'marquee',
    },
  });
  mocks.resolveSnapshotForEdit.mockResolvedValue({
    snapshot: createSnapshot(),
    targetObject: { id: 'target-object' },
  });
}

function registerBucketTest() {
  it('keeps bucket fill mutation separate from gradient draft state', async () => {
    const { bindings, session } = createBindings();
    const maskCanvas = document.createElement('canvas');
    mocks.getSelectionMaskForSnapshot.mockReturnValue(maskCanvas as never);

    expect(await applyBucketFill(bindings as never, {} as never, new Point(1, 2))).toBe(true);
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(true);
    expect(mocks.fillRasterBitmap).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#112233', maskCanvas })
    );
    expect(session.gradientDraft).toBeNull();
  });
}

function registerGradientLifecycleTest() {
  it('starts and finishes linear-gradient drafts through the fill owners', async () => {
    const { bindings, session } = createBindings();
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        fillMode: EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT,
      },
    });

    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(true);
    expect(session.gradientDraft?.startBitmapPoint).toEqual({ x: 3, y: 4 });
    expect(await finishGradientDraft(bindings as never, session)).toBe(true);
    expect(mocks.fillRasterBitmapWithLinearGradient).toHaveBeenCalledOnce();
    expect(mocks.notifyEditorRasterOverlay).toHaveBeenCalled();
  });
}

function registerGradientFallbackTest() {
  it('does not start gradient drafts without an editable snapshot or bitmap point', async () => {
    const { bindings } = createBindings();
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        fillMode: EDITOR_RASTER_FILL_MODE.LINEAR_GRADIENT,
      },
    });

    mocks.resolveSnapshotForEdit.mockResolvedValueOnce(null);
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(false);

    mocks.resolveSnapshotForEdit.mockResolvedValueOnce({
      snapshot: createSnapshot(),
      targetObject: { id: 'target-object' },
    });
    mocks.resolveBitmapPoint.mockReturnValueOnce(null as never);
    expect(await handleFillMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(false);
  });
}

describe('raster fill role owners', () => {
  beforeEach(resetEnvironment);
  registerBucketTest();
  registerGradientLifecycleTest();
  registerGradientFallbackTest();
});
