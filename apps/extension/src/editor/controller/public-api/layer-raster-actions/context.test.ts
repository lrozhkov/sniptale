import { expect, it, vi } from 'vitest';
import { Canvas, Rect } from 'fabric';
import type { EditorRasterEffect } from '../../../../features/editor/document/effects';

const runtimeMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../raster-editing/runtime', () => ({ getEditorRasterRuntime: runtimeMocks.get }));

const effectMocks = vi.hoisted(() => ({
  applyEffect: vi.fn(async () => undefined),
  previewEffect: vi.fn(async () => undefined),
  removeEffect: vi.fn(async () => undefined),
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
  createControllerLayerCorrectionContext,
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

function correctionRuntime() {
  const identity = new Rect();
  identity.sniptaleEffects = [{ id: 'contrast', amount: 0.2, enabled: true }];
  const target = { id: 'background', identity, kind: 'background', permission: 'allowed' };
  const candidate = { derivedImageData: 'derived' };
  const transient = { object: new Rect(), dispose: vi.fn() };
  const current = vi.fn(() => true);
  return {
    current,
    target,
    candidate,
    transient,
    adapter: {
      hydrateTarget: vi.fn(async () => undefined),
      resolveById: vi.fn(() => target),
      isCurrent: current,
      prepareBackgroundCorrection: vi.fn(async () => candidate),
      prepareCorrectionPreview: vi.fn(async () => transient),
      prepareNativeCorrectionPreview: vi.fn(async () => transient),
    },
    publishCorrection: vi.fn(async () => true),
    runCorrectionPreparation: vi.fn(
      async (
        _id: string,
        work: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>
      ) => {
        await work(new AbortController().signal, current);
      }
    ),
    showPreparedPreview: vi.fn(),
    clearPreparedPreview: vi.fn(),
    reportError: vi.fn(),
  };
}

it('prepares exact-id background preview without publishing accepted state or history', async () => {
  const runtime = correctionRuntime();
  runtimeMocks.get.mockReturnValue(runtime);
  const canvas: Canvas = Object.create(Canvas.prototype);
  const controller = { ...createMutationController(), canvas };
  const context = createControllerLayerCorrectionContext(controller);
  const accepted = runtime.target.identity.sniptaleEffects;
  await context.rasterCorrections?.apply(
    'background',
    (effects) => [...effects, { id: 'brightness', amount: 0.4, enabled: true }],
    true
  );
  expect(runtime.adapter.resolveById).toHaveBeenCalledWith('background');
  expect(runtime.adapter.prepareBackgroundCorrection).toHaveBeenCalledWith(
    runtime.target,
    [...accepted!, { id: 'brightness', amount: 0.4, enabled: true }],
    expect.any(AbortSignal)
  );
  expect(runtime.showPreparedPreview).toHaveBeenCalledWith('background', runtime.transient);
  expect(runtime.publishCorrection).not.toHaveBeenCalled();
  expect(runtime.target.identity.sniptaleEffects).toBe(accepted);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  context.rasterCorrections?.reset();
  expect(runtime.clearPreparedPreview).toHaveBeenCalledOnce();
});

it('publishes corrections once through the candidate owner and discards late preview resources', async () => {
  const runtime = correctionRuntime();
  runtimeMocks.get.mockReturnValue(runtime);
  const canvas: Canvas = Object.create(Canvas.prototype);
  const controller = { ...createMutationController(), canvas };
  const context = createControllerLayerCorrectionContext(controller);
  await context.rasterCorrections?.apply('background', (effects) => effects, false);
  expect(runtime.publishCorrection).toHaveBeenCalledWith(
    runtime.target,
    runtime.candidate,
    expect.any(AbortSignal)
  );
  runtime.adapter.prepareCorrectionPreview.mockImplementation(async () => {
    runtime.current.mockReturnValue(false);
    return runtime.transient;
  });
  await context.rasterCorrections?.apply('background', (effects) => effects, true);
  expect(runtime.transient.dispose).toHaveBeenCalledOnce();
  expect(runtime.showPreparedPreview).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
});

it('uses transient source/image corrections without mutating the accepted render element', async () => {
  const runtime = correctionRuntime();
  runtime.target.kind = 'image';
  runtimeMocks.get.mockReturnValue(runtime);
  const canvas: Canvas = Object.create(Canvas.prototype);
  const controller = { ...createMutationController(), canvas };
  const context = createControllerLayerCorrectionContext(controller);
  await context.rasterCorrections?.apply('image-id', (effects) => effects, true);
  expect(runtime.adapter.prepareNativeCorrectionPreview).toHaveBeenCalledWith(
    runtime.target,
    runtime.target.identity.sniptaleEffects,
    expect.any(AbortSignal)
  );
  expect(runtime.adapter.prepareBackgroundCorrection).not.toHaveBeenCalled();
  expect(runtime.publishCorrection).not.toHaveBeenCalled();
  expect(runtime.showPreparedPreview).toHaveBeenCalledWith('image-id', runtime.transient);
  expect(controller.commitHistory).not.toHaveBeenCalled();
});

it('preserves accepted effects and history when candidate publication is refused', async () => {
  const runtime = correctionRuntime();
  runtime.publishCorrection.mockResolvedValue(false);
  runtimeMocks.get.mockReturnValue(runtime);
  const canvas: Canvas = Object.create(Canvas.prototype);
  const controller = { ...createMutationController(), canvas };
  const context = createControllerLayerCorrectionContext(controller);
  const accepted = runtime.target.identity.sniptaleEffects;
  await expect(context.rasterCorrections?.apply('background', () => [], false)).rejects.toThrow(
    'publication refused'
  );
  expect(runtime.target.identity.sniptaleEffects).toBe(accepted);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(controller.syncRuntimeState).not.toHaveBeenCalled();
});

it('catches void preview/remove/reset failures and reports them to the local runtime', async () => {
  const runtime = correctionRuntime();
  runtimeMocks.get.mockReturnValue(runtime);
  const canvas: Canvas = Object.create(Canvas.prototype);
  const controller = { ...createMutationController(), canvas };
  const error = new Error('Correction failed');
  effectMocks.previewEffect.mockRejectedValueOnce(error);
  effectMocks.removeEffect.mockRejectedValueOnce(error);
  effectMocks.resetPreview.mockImplementationOnce(() => {
    throw error;
  });
  previewEditorControllerLayerEffect(controller, 'background', {
    id: 'brightness',
    amount: 0.2,
    enabled: true,
  });
  removeEditorControllerLayerEffect(controller, 'background', 'brightness');
  expect(() => resetEditorControllerLayerEffectPreview(controller, 'background')).not.toThrow();
  await Promise.resolve();
  expect(runtime.reportError).toHaveBeenCalledTimes(3);
  expect(runtime.reportError).toHaveBeenCalledWith(error);
});

it.each(['preview', 'remove'] as const)(
  'settles a failed %s after the canvas closes without publishing or reporting to a disposed runtime',
  async (action) => {
    const runtime = correctionRuntime();
    runtimeMocks.get.mockReturnValue(runtime);
    const canvas: Canvas = Object.create(Canvas.prototype);
    const controller: LayerRasterMutationContextController = {
      ...createMutationController(),
      canvas,
    };
    let refuse: (reason: Error) => void = () => undefined;
    const pending = new Promise<undefined>((_resolve, reject) => {
      refuse = reject;
    });
    const accepted = runtime.target.identity.sniptaleEffects;
    if (action === 'preview') {
      effectMocks.previewEffect.mockReturnValueOnce(pending);
      previewEditorControllerLayerEffect(controller, 'background', {
        id: 'brightness',
        enabled: true,
        amount: 0.9,
      });
    } else {
      effectMocks.removeEffect.mockReturnValueOnce(pending);
      removeEditorControllerLayerEffect(controller, 'background', 'contrast');
    }
    controller.canvas = null;
    refuse(new Error('Canvas closed during correction'));
    await Promise.resolve();
    expect(runtime.target.identity.sniptaleEffects).toBe(accepted);
    expect(runtime.publishCorrection).not.toHaveBeenCalled();
    expect(runtime.showPreparedPreview).not.toHaveBeenCalled();
    expect(runtime.reportError).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it.each(['preview', 'remove'] as const)(
  'preserves accepted work when a failed %s outlives its mounted runtime',
  async (action) => {
    const runtime = correctionRuntime();
    runtimeMocks.get.mockReturnValue(runtime);
    const canvas: Canvas = Object.create(Canvas.prototype);
    const controller = { ...createMutationController(), canvas };
    let refuse: (reason: Error) => void = () => undefined;
    const pending = new Promise<undefined>((_resolve, reject) => {
      refuse = reject;
    });
    const accepted = runtime.target.identity.sniptaleEffects;
    if (action === 'preview') {
      effectMocks.previewEffect.mockReturnValueOnce(pending);
      previewEditorControllerLayerEffect(controller, 'background', {
        id: 'brightness',
        enabled: true,
        amount: 0.9,
      });
    } else {
      effectMocks.removeEffect.mockReturnValueOnce(pending);
      removeEditorControllerLayerEffect(controller, 'background', 'contrast');
    }
    runtimeMocks.get.mockReturnValue(null);
    refuse(new Error('Raster runtime disposed'));
    await Promise.resolve();
    expect(runtime.target.identity.sniptaleEffects).toBe(accepted);
    expect(runtime.reportError).not.toHaveBeenCalled();
    expect(runtime.publishCorrection).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it.each(['closed-canvas', 'unmounted-runtime'] as const)(
  'keeps reset failure local after %s and preserves accepted effects',
  (lifetime) => {
    const runtime = correctionRuntime();
    runtimeMocks.get.mockReturnValue(runtime);
    const canvas: Canvas = Object.create(Canvas.prototype);
    const controller: LayerRasterMutationContextController = {
      ...createMutationController(),
      canvas,
    };
    const accepted = runtime.target.identity.sniptaleEffects;
    effectMocks.resetPreview.mockImplementationOnce(() => {
      if (lifetime === 'closed-canvas') controller.canvas = null;
      else runtimeMocks.get.mockReturnValue(null);
      throw new Error('Reset interrupted by teardown');
    });
    expect(() => resetEditorControllerLayerEffectPreview(controller, 'background')).not.toThrow();
    expect(runtime.target.identity.sniptaleEffects).toBe(accepted);
    expect(runtime.reportError).not.toHaveBeenCalled();
    expect(runtime.publishCorrection).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);
