// @vitest-environment jsdom
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorStore } from '../../../state/useEditorStore';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  createSelectionMaskForSnapshot: vi.fn(() => document.createElement('canvas')),
  finalizeSelectionMask: vi.fn(() => true),
  notifyEditorRasterOverlay: vi.fn(),
  replaceRasterMaskWithFloodSelection: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 4, y: 5 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'overlay' })),
  resolveRasterTarget: vi.fn(),
}));

vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  createSelectionMaskForSnapshot: mocks.createSelectionMaskForSnapshot,
  finalizeSelectionMask: mocks.finalizeSelectionMask,
}));

vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
}));

vi.mock('../../raster/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/selection')>()),
  replaceRasterMaskWithFloodSelection: mocks.replaceRasterMaskWithFloodSelection,
}));

vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
  resolveRasterTarget: mocks.resolveRasterTarget,
}));

vi.mock('../../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import { createEditorRasterToolSession } from '../session';
import { handleSelectionMouseDown } from './start';

function createBitmap() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 20;
  bitmap.height = 20;
  vi.spyOn(bitmap, 'getContext').mockReturnValue({
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(20 * 20 * 4) }) as ImageData),
  } as unknown as CanvasRenderingContext2D);
  return bitmap;
}

function createBindings() {
  const session = createEditorRasterToolSession();
  return {
    session,
    bindings: {
      getCanvas: () => null,
      getRasterToolSession: () => session,
    },
  };
}

function setSelectionMode(selectionMode: 'marquee' | 'lasso' | 'wand') {
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      selectionMode,
    },
  } as never);
}

function registerSelectionStartTests() {
  it('starts marquee and lasso drafts from the resolved raster target', async () => {
    const { bindings, session } = createBindings();

    setSelectionMode('marquee');
    expect(await handleSelectionMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(
      true
    );
    expect(session.marqueeDraft?.startBitmapPoint).toEqual({ x: 4, y: 5 });

    setSelectionMode('lasso');
    expect(await handleSelectionMouseDown(bindings as never, {} as never, new Point(3, 4))).toBe(
      true
    );
    expect(session.lassoDraft?.bitmapPoints).toEqual([{ x: 4, y: 5 }]);
  });

  it('applies wand selections through the selection mask owner', async () => {
    const { bindings } = createBindings();
    setSelectionMode('wand');

    expect(await handleSelectionMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(
      true
    );

    expect(mocks.replaceRasterMaskWithFloodSelection).toHaveBeenCalledWith(
      expect.objectContaining({ startX: 4, startY: 5, tolerance: 96 })
    );
    expect(mocks.finalizeSelectionMask).toHaveBeenCalledOnce();
  });
}

function registerSelectionBlockedTests() {
  it('returns false when target or bitmap point resolution fails', async () => {
    const { bindings } = createBindings();
    mocks.resolveRasterTarget.mockReturnValueOnce(null);
    expect(await handleSelectionMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(
      false
    );

    mocks.resolveBitmapPoint.mockReturnValueOnce(null as never);
    expect(await handleSelectionMouseDown(bindings as never, {} as never, new Point(1, 2))).toBe(
      false
    );
  });
}

function runSelectionStartSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRasterTarget.mockReturnValue({
      object: { id: 'object' },
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    });
    mocks.createRasterTargetSnapshot.mockResolvedValue({
      bitmap: createBitmap(),
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { left: 0, top: 0, width: 20, height: 20 },
    });
    mocks.resolveBitmapPoint.mockReturnValue({ x: 4, y: 5 });
    setSelectionMode('marquee');
  });

  registerSelectionStartTests();
  registerSelectionBlockedTests();
}

describe('raster selection start owner', runSelectionStartSuite);
