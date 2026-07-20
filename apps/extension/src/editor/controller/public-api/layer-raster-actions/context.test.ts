import { expect, it, vi } from 'vitest';
import { Rect } from 'fabric';
import type { EditorRasterEffect } from '../../../../features/editor/document/effects';

const effectMocks = vi.hoisted(() => ({
  applyEffect: vi.fn(async () => undefined),
  previewEffect: vi.fn(),
  removeEffect: vi.fn(),
  resetPreview: vi.fn(),
  updateEffect: vi.fn(async () => undefined),
}));

vi.mock('../../layer-effects/raster-mutations/effects', () => ({
  applyEditorLayerRasterEffect: effectMocks.applyEffect,
  previewEditorLayerRasterEffect: effectMocks.previewEffect,
  removeEditorLayerRasterEffect: effectMocks.removeEffect,
  resetEditorLayerRasterEffectPreview: effectMocks.resetPreview,
  updateEditorLayerRasterEffect: effectMocks.updateEffect,
}));

import {
  applyEditorControllerLayerEffect,
  previewEditorControllerLayerEffect,
  removeEditorControllerLayerEffect,
  resetEditorControllerLayerEffectPreview,
  updateEditorControllerLayerEffect,
} from './effects';
import {
  createControllerLayerMutationContext,
  createControllerLayerReachableSourceContext,
  type LayerRasterMutationContextController,
  type LayerRasterReachableSourceContextController,
} from './context';

function createMutationController() {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 7),
    isLayerMutationTokenCurrent: vi.fn((token: number) => token === 7),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
  } satisfies LayerRasterMutationContextController;
}

function createReachableSourceController() {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    setSource: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
  } satisfies LayerRasterReachableSourceContextController;
}

function readFirstCall(mock: ReturnType<typeof vi.fn>) {
  const args = mock.mock.calls[0]?.[0];
  if (!args) {
    throw new Error('Expected mocked raster effect call');
  }

  return args;
}

it('builds raster mutation context from role-local source and mutation bindings', () => {
  const controller = createMutationController();
  const context = createControllerLayerMutationContext(controller);
  const object = new Rect();

  context.prepareObject(object);
  context.sendFrameObjectsToBack();
  context.setSource(null);
  context.commitHistory();
  context.syncRuntimeState();

  expect(context.canvas).toBeNull();
  expect(context.source).toBeNull();
  expect(context.createLayerMutationToken()).toBe(7);
  expect(context.isLayerMutationTokenCurrent(7)).toBe(true);
  expect(controller.prepareObject).toHaveBeenCalledWith(object);
  expect(controller.sendFrameObjectsToBack).toHaveBeenCalledOnce();
  expect(controller.setSource).toHaveBeenCalledWith(null);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('builds reachable source context without raster mutation token ownership', () => {
  const controller = createReachableSourceController();
  const context = createControllerLayerReachableSourceContext(controller);
  const object = new Rect();

  expect(context.ensureObjectReachable(object)).toBe(true);
  context.setSource(null);
  context.commitHistory();
  context.syncRuntimeState();

  expect(context.canvas).toBeNull();
  expect(context.source).toBeNull();
  expect(controller.ensureObjectReachable).toHaveBeenCalledWith(object);
  expect(controller.setSource).toHaveBeenCalledWith(null);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('forwards raster effect wrappers through the mutation context contract', async () => {
  const controller = createMutationController();
  const effect: EditorRasterEffect = { amount: 0.4, enabled: true, id: 'brightness' };

  await applyEditorControllerLayerEffect(controller, 'layer-1', effect);
  await updateEditorControllerLayerEffect(controller, 'layer-1', effect);
  previewEditorControllerLayerEffect(controller, 'layer-1', effect);
  resetEditorControllerLayerEffectPreview(controller, 'layer-1');
  removeEditorControllerLayerEffect(controller, 'layer-1', 'brightness');

  expect(readFirstCall(effectMocks.applyEffect)).toEqual(
    expect.objectContaining({ effect, id: 'layer-1', source: null })
  );
  expect(readFirstCall(effectMocks.updateEffect)).toEqual(
    expect.objectContaining({ effect, id: 'layer-1', source: null })
  );
  expect(readFirstCall(effectMocks.previewEffect)).toEqual(
    expect.objectContaining({ effect, id: 'layer-1', source: null })
  );
  expect(readFirstCall(effectMocks.resetPreview)).toEqual(
    expect.objectContaining({ id: 'layer-1', source: null })
  );
  expect(readFirstCall(effectMocks.removeEffect)).toEqual(
    expect.objectContaining({ effectId: 'brightness', id: 'layer-1', source: null })
  );
});
