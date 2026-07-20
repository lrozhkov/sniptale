// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact shared raster proof keeps snapshot and selection ownership branches together */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorRasterToolSession } from './session';

const mocks = vi.hoisted(() => ({
  clearEditorRasterSelection: vi.fn(),
  createRasterTargetSnapshot: vi.fn(),
  createEmptyRasterMask: vi.fn((width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }),
  rasterMaskHasPixels: vi.fn(() => true),
  resolveRasterOverlayObject: vi.fn(),
  resolveRasterTarget: vi.fn(),
  setEditorRasterSelection: vi.fn(),
}));

vi.mock('./session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session');
  return {
    ...actual,
    clearEditorRasterSelection: mocks.clearEditorRasterSelection,
    setEditorRasterSelection: mocks.setEditorRasterSelection,
  };
});

vi.mock('../raster/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/selection')>()),
  createEmptyRasterMask: mocks.createEmptyRasterMask,
  rasterMaskHasPixels: mocks.rasterMaskHasPixels,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveRasterTarget: mocks.resolveRasterTarget,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import {
  createSelectionMaskForSnapshot,
  finalizeSelectionMask,
  getSelectionMaskForSnapshot,
  mapScenePointToBitmap,
  resolveSnapshotForEdit,
} from './shared';

describe('editor-controller/raster-tools/shared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves snapshots from active canvas targets and existing selection ownership', async () => {
    const session = createEditorRasterToolSession();
    const bindings = {
      getCanvas: () => ({ id: 'canvas' }),
      getRasterToolSession: () => session,
      syncRuntimeState: vi.fn(),
    };
    const resolvedTarget = {
      object: { id: 'object' },
      reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
    };
    const snapshot = {
      bitmap: document.createElement('canvas'),
      reference: resolvedTarget.reference,
      sceneBounds: { left: 10, top: 12, width: 40, height: 24 },
    };
    mocks.resolveRasterTarget.mockReturnValue(resolvedTarget);
    mocks.createRasterTargetSnapshot.mockResolvedValue(snapshot);

    expect(await resolveSnapshotForEdit(bindings as never, {} as never)).toEqual({
      snapshot,
      targetObject: resolvedTarget.object,
    });
    expect(mocks.resolveRasterTarget).toHaveBeenLastCalledWith({
      canvas: {},
    });

    session.selection = {
      reference: resolvedTarget.reference,
      maskCanvas: document.createElement('canvas'),
    };
    mocks.resolveRasterOverlayObject.mockReturnValue({ id: 'resolved-object' });
    expect(await resolveSnapshotForEdit(bindings as never, {} as never)).toEqual({
      snapshot,
      targetObject: { id: 'resolved-object' },
    });
  });

  it('clears stale selection sessions and projects mask helpers', async () => {
    const session = createEditorRasterToolSession();
    session.selection = {
      reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
      maskCanvas: document.createElement('canvas'),
    };
    const bindings = {
      getCanvas: () => ({ id: 'canvas' }),
      getRasterToolSession: () => session,
      syncRuntimeState: vi.fn(),
    };
    mocks.resolveRasterOverlayObject.mockReturnValue(null);
    expect(await resolveSnapshotForEdit(bindings as never, {} as never)).toBeNull();
    expect(mocks.clearEditorRasterSelection).toHaveBeenCalledWith(session);
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();

    const snapshot = {
      bitmap: document.createElement('canvas'),
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' } as const,
      sceneBounds: { left: 10, top: 20, width: 40, height: 20 },
    };
    const mask = createSelectionMaskForSnapshot(snapshot);
    session.selection = { reference: snapshot.reference, maskCanvas: mask };
    expect(getSelectionMaskForSnapshot(session, snapshot)).toBe(mask);
    expect(
      mapScenePointToBitmap(snapshot, {
        x: 30,
        y: 30,
      })
    ).toEqual({ x: 150, y: 75 });
    expect(finalizeSelectionMask(session, snapshot, mask)).toBe(true);
    expect(mocks.setEditorRasterSelection).toHaveBeenCalled();
  });

  it('returns null when there is no raster target and rejects mismatched selection masks', async () => {
    const session = createEditorRasterToolSession();
    const bindings = {
      getCanvas: () => ({ id: 'canvas' }),
      getRasterToolSession: () => session,
      syncRuntimeState: vi.fn(),
    };

    mocks.resolveRasterTarget.mockReturnValue(null);
    expect(await resolveSnapshotForEdit(bindings as never, {} as never)).toBeNull();

    const snapshot = {
      bitmap: document.createElement('canvas'),
      reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { left: 0, top: 0, width: 10, height: 10 },
    };
    session.selection = {
      reference: { kind: 'object' as const, objectId: 'layer-2', objectName: 'Layer 2' },
      maskCanvas: document.createElement('canvas'),
    };
    mocks.rasterMaskHasPixels.mockReturnValueOnce(false);

    expect(getSelectionMaskForSnapshot(session, snapshot)).toBeNull();
    expect(finalizeSelectionMask(session, snapshot, document.createElement('canvas'))).toBe(true);
    expect(mocks.clearEditorRasterSelection).toHaveBeenCalledWith(session);
  });

  it('resolves snapshots without canvas hover or event-target fallbacks', async () => {
    const session = createEditorRasterToolSession();
    const bindings = {
      getCanvas: () => ({ id: 'canvas' }),
      getRasterToolSession: () => session,
      syncRuntimeState: vi.fn(),
    };

    mocks.resolveRasterTarget.mockReturnValueOnce(null);
    await resolveSnapshotForEdit(bindings as never, {} as never);

    expect(mocks.resolveRasterTarget).toHaveBeenCalledWith({
      canvas: {},
    });
  });

  it('passes pointer targets through snapshot resolution when active selection is absent', async () => {
    const session = createEditorRasterToolSession();
    const bindings = {
      getCanvas: () => ({ id: 'canvas' }),
      getRasterToolSession: () => session,
      syncRuntimeState: vi.fn(),
    };
    const canvas = { id: 'canvas' };
    const fallbackTarget = { sniptaleId: 'pointer-layer' };

    mocks.resolveRasterTarget.mockReturnValueOnce(null);
    await resolveSnapshotForEdit(bindings as never, canvas as never, fallbackTarget as never);

    expect(mocks.resolveRasterTarget).toHaveBeenCalledWith({
      canvas,
      fallbackTarget,
    });
  });
});
