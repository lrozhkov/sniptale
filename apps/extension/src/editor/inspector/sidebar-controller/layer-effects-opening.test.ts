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
});
