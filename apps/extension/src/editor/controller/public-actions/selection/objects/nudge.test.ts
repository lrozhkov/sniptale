import { expect, it, vi } from 'vitest';

import { nudgeEditorSelection } from './nudge';
import {
  createFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import { createFabricCanvasFixture } from '../../../../testing/fabric-canvas.test-support';

it('moves selected objects, refreshes coordinates, and syncs runtime state', () => {
  const object = {
    left: 10,
    sniptaleId: 'object',
    sniptaleLocked: false,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 20,
  };
  const canvas = {
    getActiveObject: () => object,
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
  };
  const setSource = vi.fn();
  const syncRuntimeState = vi.fn();

  expect(
    nudgeEditorSelection({
      canvas: canvas as never,
      deltaX: 4,
      deltaY: -2,
      ensureObjectReachable: vi.fn(),
      setSource,
      source: null,
      syncRuntimeState,
    })
  ).toBe(true);

  expect(object.set).toHaveBeenCalledWith({ left: 14, top: 18 });
  expect(object.setCoords).toHaveBeenCalled();
  expect(setSource).toHaveBeenCalledWith(null);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('normalizes a nudged frame-annotation proxy back into canonical metadata', () => {
  const object = createFrameAnnotationProxy({
    frame: { id: 'frame-1', x: 10, y: 20, width: 40, height: 30 },
    label: 'Frame annotation',
    ordering: 0,
  });
  const canvas = {
    getActiveObject: () => object,
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
  };
  expect(
    nudgeEditorSelection({
      canvas: createFabricCanvasFixture(canvas),
      deltaX: 5,
      deltaY: 6,
      ensureObjectReachable: vi.fn(),
      setSource: vi.fn(),
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).toBe(true);
  expect(readFrameAnnotationSnapshot(object)).toMatchObject({ x: 15, y: 26 });
});

it('does not nudge without a canvas or mutable active selection', () => {
  const options = {
    deltaX: 1,
    deltaY: 1,
    ensureObjectReachable: vi.fn(),
    setSource: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
  };
  expect(nudgeEditorSelection({ ...options, canvas: null })).toBe(false);
  expect(
    nudgeEditorSelection({
      ...options,
      canvas: createFabricCanvasFixture({
        getActiveObject: () => null,
        getActiveObjects: () => [],
      }),
    })
  ).toBe(false);
});
