import { describe, expect, it, vi } from 'vitest';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';

const mutationMocks = vi.hoisted(() => ({
  applyEditorLayerRasterEffect: vi.fn(async () => undefined),
  applyEditorLayerTransformation: vi.fn(async () => undefined),
  mergeEditorSelectedLayers: vi.fn(async () => undefined),
  previewEditorLayerRasterEffect: vi.fn(),
  removeEditorLayerRasterEffect: vi.fn(),
  resetEditorLayerRasterEffectPreview: vi.fn(),
  updateEditorLayerRasterEffect: vi.fn(async () => undefined),
}));

vi.mock('../layer-effects/merge', () => ({
  mergeEditorSelectedLayers: mutationMocks.mergeEditorSelectedLayers,
}));
vi.mock('../layer-effects/raster-mutations/effects', () => ({
  applyEditorLayerRasterEffect: mutationMocks.applyEditorLayerRasterEffect,
  previewEditorLayerRasterEffect: mutationMocks.previewEditorLayerRasterEffect,
  removeEditorLayerRasterEffect: mutationMocks.removeEditorLayerRasterEffect,
  resetEditorLayerRasterEffectPreview: mutationMocks.resetEditorLayerRasterEffectPreview,
  updateEditorLayerRasterEffect: mutationMocks.updateEditorLayerRasterEffect,
}));
vi.mock('../layer-effects/raster-mutations/transform', () => ({
  applyEditorLayerTransformation: mutationMocks.applyEditorLayerTransformation,
}));

import {
  applyEditorControllerLayerEffect,
  previewEditorControllerLayerEffect,
  removeEditorControllerLayerEffect,
  resetEditorControllerLayerEffectPreview,
  updateEditorControllerLayerEffect,
} from './layer-raster-actions/effects';
import { mergeEditorControllerSelectedLayers } from './layer-raster-actions/merge';
import { applyEditorControllerLayerTransformation } from './layer-raster-actions/transform';

function createController() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 5),
    isLayerMutationTokenCurrent: vi.fn((token: number) => token === 5),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

function resetControllerSpies(controller: ReturnType<typeof createController>) {
  controller.commitHistory.mockClear();
  controller.prepareObject.mockClear();
  controller.sendFrameObjectsToBack.mockClear();
  controller.setSource.mockClear();
  controller.syncRuntimeState.mockClear();
}

function expectCallArg<T>(calls: T[][], index: number, label: string): T {
  const args = calls[index]?.[0];
  if (!args) {
    throw new Error(`Expected ${label} args`);
  }

  return args;
}

function expectMutationBindings(
  args: {
    commitHistory: () => void;
    createLayerMutationToken: () => number;
    isLayerMutationTokenCurrent: (token: number) => boolean;
    prepareObject: (object: { id: string }) => void;
    sendFrameObjectsToBack: () => void;
    setSource: (source: { id: string }) => void;
    syncRuntimeState: () => void;
  },
  controller: ReturnType<typeof createController>
) {
  args.prepareObject({ id: 'prepared' });
  args.sendFrameObjectsToBack();
  args.setSource({ id: 'next-source' });
  args.commitHistory();
  args.syncRuntimeState();

  expect(args.createLayerMutationToken()).toBe(5);
  expect(args.isLayerMutationTokenCurrent(5)).toBe(true);
  expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'prepared' });
  expect(controller.sendFrameObjectsToBack).toHaveBeenCalledOnce();
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'next-source' });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
}

function expectMutationMetadata(
  controller: ReturnType<typeof createController>,
  effect: EditorRasterEffect
) {
  expect(mutationMocks.mergeEditorSelectedLayers).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas, source: controller.source })
  );
  expect(mutationMocks.applyEditorLayerRasterEffect).toHaveBeenCalledWith(
    expect.objectContaining({ effect, id: 'layer-1', source: controller.source })
  );
  expect(mutationMocks.updateEditorLayerRasterEffect).toHaveBeenCalledWith(
    expect.objectContaining({ effect, id: 'layer-1', source: controller.source })
  );
  expect(mutationMocks.previewEditorLayerRasterEffect).toHaveBeenCalledWith(
    expect.objectContaining({ effect, id: 'layer-1', source: controller.source })
  );
  expect(mutationMocks.resetEditorLayerRasterEffectPreview).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'layer-1', source: controller.source })
  );
  expect(mutationMocks.removeEditorLayerRasterEffect).toHaveBeenCalledWith(
    expect.objectContaining({ effectId: 'brightness', id: 'layer-1', source: controller.source })
  );
  expect(mutationMocks.applyEditorLayerTransformation).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'layer-1',
      source: controller.source,
      transformationId: 'rotate-right',
    })
  );
}

function expectMutationCallsForwarded(controller: ReturnType<typeof createController>) {
  const mutationCalls = [
    [mutationMocks.mergeEditorSelectedLayers.mock.calls, 'merge layers'],
    [mutationMocks.applyEditorLayerRasterEffect.mock.calls, 'apply effect'],
    [mutationMocks.updateEditorLayerRasterEffect.mock.calls, 'update effect'],
    [mutationMocks.previewEditorLayerRasterEffect.mock.calls, 'preview effect'],
    [mutationMocks.resetEditorLayerRasterEffectPreview.mock.calls, 'reset preview'],
    [mutationMocks.removeEditorLayerRasterEffect.mock.calls, 'remove effect'],
    [mutationMocks.applyEditorLayerTransformation.mock.calls, 'transform layer'],
  ] as const;

  for (const [calls, label] of mutationCalls) {
    const args = expectCallArg(calls as any[][], 0, label);
    expectMutationBindings(args, controller);
    resetControllerSpies(controller);
  }
}

describe('editor-controller public api layer raster actions', () => {
  it('forwards mutation bindings for merge and raster-effect exports', async () => {
    const controller = createController();
    const effect: EditorRasterEffect = { amount: 0.4, enabled: true, id: 'brightness' };

    await mergeEditorControllerSelectedLayers(controller as never);
    await applyEditorControllerLayerEffect(controller as never, 'layer-1', effect);
    await updateEditorControllerLayerEffect(controller as never, 'layer-1', effect);
    previewEditorControllerLayerEffect(controller as never, 'layer-1', effect);
    resetEditorControllerLayerEffectPreview(controller as never, 'layer-1');
    removeEditorControllerLayerEffect(controller as never, 'layer-1', 'brightness');
    await applyEditorControllerLayerTransformation(controller as never, 'layer-1', 'rotate-right');
    expectMutationMetadata(controller, effect);
    expectMutationCallsForwarded(controller);
  });
});
