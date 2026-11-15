import { describe, expect, it, vi } from 'vitest';

import { createEditorInspectorControllerActions } from './builders';

type OpenLayerEffects = Parameters<
  typeof createEditorInspectorControllerActions
>[0]['openLayerEffects'];

function createStoreSlice() {
  return {
    setActiveTool: vi.fn(),
    syncActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
  };
}

function createController() {
  return {
    getRasterRuntime: vi.fn<
      () => {
        getSnapshot: () => { available: boolean; editing: boolean; targetId: string | null };
      } | null
    >(() => null),
    applyFrameSettings: vi.fn(),
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    closeDocument: vi.fn(),
    removeLayerEffect: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    selectLayer: vi.fn(),
    setActiveTool: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    withHistoryMuted: vi.fn(<T>(callback: () => T) => callback()),
  };
}

function createLayerEffectActionProps(args: {
  controller: ReturnType<typeof createController>;
  openLayerEffects?: OpenLayerEffects;
  store: ReturnType<typeof createStoreSlice>;
}) {
  return createEditorInspectorControllerActions({
    actions: {} as never,
    backgroundImageInputRef: { current: null } as never,
    controller: args.controller as never,
    frameDraft: { id: 'draft' } as never,
    importSessionInputRef: { current: null } as never,
    openImageInputRef: { current: null } as never,
    openLayerEffects: args.openLayerEffects ?? (vi.fn() as unknown as OpenLayerEffects),
    syncActiveTool: args.store.syncActiveTool,
    setImageData: args.store.setImageData,
    setInspector: args.store.setInspector,
    setLayerEffectsCategory: args.store.setLayerEffectsCategory,
  }).layerEffects;
}

describe('sidebar-controller layer-effects opening', () => {
  it('forces select mode in both store and controller before opening layer-effects', () => {
    const store = createStoreSlice();
    const controller = createController();
    const openLayerEffects = vi.fn() as unknown as OpenLayerEffects;
    const props = createLayerEffectActionProps({ controller, openLayerEffects, store });

    props.onOpenLayerEffects('vector-layer', 'filters', 'blur');

    expect(controller.selectLayer).toHaveBeenCalledWith('vector-layer', { focusViewport: false });
    expect(store.syncActiveTool).toHaveBeenCalledWith('select');
    expect(store.setActiveTool).not.toHaveBeenCalled();
    expect(controller.setActiveTool).toHaveBeenCalledWith('select');
    expect(openLayerEffects).toHaveBeenCalledWith('vector-layer', 'filters', 'blur');
    expect(store.setLayerEffectsCategory).toHaveBeenCalledWith('filters');
    expect(store.setInspector).toHaveBeenCalledWith('layer-effects');
  });

  it('keeps the viewport in place when layer auto-navigation is disabled', () => {
    const store = createStoreSlice();
    const controller = createController();
    const props = createLayerEffectActionProps({ controller, store });

    props.onOpenLayerEffects('vector-layer', 'adjustments', 'brightness', {
      focusViewport: false,
    });

    expect(controller.selectLayer).toHaveBeenCalledWith('vector-layer', { focusViewport: false });
    expect(store.setInspector).toHaveBeenCalledWith('layer-effects');
  });

  it('keeps the active raster target and tool when opening its adjustments', () => {
    const store = createStoreSlice();
    const controller = createController();
    controller.getRasterRuntime.mockReturnValue({
      getSnapshot: () => ({ available: true, editing: true, targetId: 'image-layer' }),
    });
    const openLayerEffects = vi.fn() as unknown as OpenLayerEffects;
    const props = createLayerEffectActionProps({ controller, openLayerEffects, store });

    props.onOpenLayerEffects('image-layer', 'adjustments', 'brightness');

    expect(controller.selectLayer).toHaveBeenCalledWith('image-layer', {
      focusViewport: false,
      preserveActiveTool: true,
    });
    expect(controller.setActiveTool).not.toHaveBeenCalled();
    expect(openLayerEffects).toHaveBeenCalledWith('image-layer', 'adjustments', 'brightness');
    expect(store.setInspector).toHaveBeenCalledWith('layer-effects');
  });

  it('keeps same-target raster admission while applying the correction', async () => {
    const store = createStoreSlice();
    const controller = createController();
    controller.getRasterRuntime.mockReturnValue({
      getSnapshot: () => ({ available: true, editing: true, targetId: 'image-layer' }),
    });
    const props = createLayerEffectActionProps({ controller, store });
    const effect = { id: 'brightness', amount: 0.4, enabled: true } as const;

    await props.applyLayerEffect('image-layer', effect);

    expect(controller.selectLayer).toHaveBeenCalledWith('image-layer', {
      focusViewport: false,
      preserveActiveTool: true,
    });
    expect(controller.applyLayerEffect).toHaveBeenCalledWith('image-layer', effect);
    expect(controller.setActiveTool).not.toHaveBeenCalled();
  });

  it.each([
    { available: true, editing: true, targetId: 'other-layer' },
    { available: true, editing: false, targetId: 'image-layer' },
    { available: false, editing: true, targetId: 'image-layer' },
  ])('retains ordinary selection admission outside the current raster target: %j', (snapshot) => {
    const store = createStoreSlice();
    const controller = createController();
    controller.getRasterRuntime.mockReturnValue({ getSnapshot: () => snapshot });
    const props = createLayerEffectActionProps({ controller, store });

    props.onOpenLayerEffects('image-layer', 'adjustments', 'brightness', { focusViewport: true });

    expect(controller.selectLayer).toHaveBeenCalledWith('image-layer', { focusViewport: true });
    expect(controller.setActiveTool).toHaveBeenCalledWith('select');
  });
});
