// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { nudgeEditorSelection } from './nudge';
import {
  createFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../../../frame-annotation/proxy';
import { createFabricCanvasFixture } from '../../../../testing/fabric-canvas.test-support';
import { readEditorDrawingObject } from '../../../../drawing/object/metadata';
import { createEditorDrawingFabricObject } from '../../../../drawing/object/vector';

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

it('persists a nudged shared drawing through authoritative reconstruction', () => {
  const object = createEditorDrawingFabricObject(
    {
      bounds: { height: 20, width: 40, x: 10, y: 15 },
      color: '#f00',
      fillColor: null,
      id: 'shape-1',
      kind: 'rectangle',
      width: 4,
    },
    1
  );
  const canvas = createFabricCanvasFixture({
    getActiveObject: () => object,
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
  });

  expect(
    nudgeEditorSelection({
      canvas,
      deltaX: 5,
      deltaY: -3,
      ensureObjectReachable: vi.fn(() => true),
      setSource: vi.fn(),
      source: null,
      syncRuntimeState: vi.fn(),
    })
  ).toBe(true);

  const drawing = readEditorDrawingObject(object);
  expect(drawing).toMatchObject({ bounds: { x: 15, y: 12 } });
  const reconstructed =
    drawing && drawing.kind !== 'blur' ? createEditorDrawingFabricObject(drawing, 1) : object;
  expect(reconstructed.getCenterPoint()).toMatchObject(object.getCenterPoint());
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
