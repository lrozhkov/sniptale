// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const dependencyMocks = vi.hoisted(() => ({
  getSingleSelectionType: vi.fn(() => 'Rectangle'),
  isBlurObject: vi.fn(() => false),
  isEditableObject: vi.fn(() => true),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  getSingleSelectionType: dependencyMocks.getSingleSelectionType,
  isEditableObject: dependencyMocks.isEditableObject,
}));
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: dependencyMocks.isBlurObject,
}));

import { resolveRasterTarget, resolveRasterTargetState } from './target';

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses the pointer target when Fabric cleared the active selection before raster handling', () => {
  const pointerTarget = {
    sniptaleId: 'layer-4',
    sniptaleLabel: 'Layer 4',
    sniptaleLocked: false,
    sniptaleType: 'image',
    visible: true,
  };

  expect(
    resolveRasterTargetState({
      canvas: {
        getActiveObject: () => null,
        getActiveObjects: () => [],
      } as never,
      fallbackTarget: pointerTarget as never,
    })
  ).toEqual({
    summary: {
      layerId: 'layer-4',
      layerName: 'Layer 4',
      status: 'ready',
    },
    target: expect.objectContaining({
      object: pointerTarget,
      reference: { kind: 'object', objectId: 'layer-4', objectName: 'Layer 4' },
    }),
  });
});

it('prefers the pointer target over a stale single active object for raster tools', () => {
  const activeObject = {
    sniptaleId: 'active-layer',
    sniptaleLabel: 'Active Layer',
    sniptaleLocked: false,
    sniptaleType: 'image',
    visible: true,
  };
  const pointerTarget = {
    sniptaleId: 'pointer-shape',
    sniptaleLabel: 'Pointer Shape',
    sniptaleLocked: false,
    sniptaleType: 'rich-shape',
    visible: true,
  };

  expect(
    resolveRasterTargetState({
      canvas: {
        getActiveObjects: () => [activeObject as never],
      } as never,
      fallbackTarget: pointerTarget as never,
    })
  ).toEqual({
    summary: {
      layerId: 'pointer-shape',
      layerName: 'Pointer Shape',
      status: 'will-rasterize',
    },
    target: expect.objectContaining({
      object: pointerTarget,
      reference: {
        kind: 'object',
        objectId: 'pointer-shape',
        objectName: 'Pointer Shape',
      },
    }),
  });
});

it('allows blur annotations through the rasterize-on-edit target path', () => {
  const blurObject = {
    sniptaleId: 'blur-1',
    sniptaleLabel: 'Blur 1',
    sniptaleLocked: false,
    sniptaleType: 'blur',
    visible: true,
  };

  expect(
    resolveRasterTargetState({
      canvas: {
        getActiveObject: () => blurObject,
        getActiveObjects: () => [blurObject as never],
      } as never,
    })
  ).toEqual({
    summary: {
      layerId: 'blur-1',
      layerName: 'Blur 1',
      status: 'will-rasterize',
    },
    target: expect.objectContaining({
      object: blurObject,
      reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    }),
  });
  expect(resolveRasterTarget({ canvas: null, fallbackTarget: blurObject as never })).toEqual(
    expect.objectContaining({
      object: blurObject,
      reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    })
  );
});
