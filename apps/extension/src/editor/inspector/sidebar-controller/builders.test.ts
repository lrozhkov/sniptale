import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const actionRailMocks = vi.hoisted(() => ({ exportSession: vi.fn() }));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./action-rail', () => ({
  createEditorActionRailHandlers: () => actionRailMocks,
}));
import {
  createEditorInspectorControllerActions,
  mergeEditorInspectorDerivedState,
  selectEditorInspectorSidebarDerivedInput,
  createCloseDocumentHandler,
} from './builders';
import { createController, createStoreSlice } from './builders.test-support';

beforeEach(() => vi.clearAllMocks());

function createControllerActionProps(
  store: ReturnType<typeof createStoreSlice>,
  controller: ReturnType<typeof createController>,
  openLayerEffects = vi.fn()
) {
  return {
    openLayerEffects,
    actionGroups: createEditorInspectorControllerActions({
      actions: { applyPreset: vi.fn() } as never,
      backgroundImageInputRef: { current: null } as never,
      controller: controller as never,
      frameDraft: { id: 'draft' } as never,
      importSessionInputRef: { current: null } as never,
      openImageInputRef: { current: null } as never,
      openLayerEffects,
      syncActiveTool: store.syncActiveTool,
      setImageData: store.setImageData,
      setInspector: store.setInspector,
      setLayerEffectsCategory: store.setLayerEffectsCategory,
    }),
  };
}

async function runLayerEffectActions(
  props: ReturnType<typeof createEditorInspectorControllerActions>['layerEffects']
) {
  await props.applyLayerEffect('vector-layer', {
    amount: 0.5,
    enabled: true,
    id: 'brightness',
  });
  await props.applyLayerTransformation('vector-layer', 'rotate-left');
  await props.updateLayerEffect('vector-layer', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  props.previewLayerEffect('vector-layer', {
    amount: 0.25,
    enabled: true,
    id: 'contrast',
  });
  props.resetLayerEffectPreview('vector-layer');
  props.removeLayerEffect('vector-layer', 'brightness');
  props.onOpenLayerEffects('vector-layer', 'filters', 'blur');
}

function expectLayerEffectControllerCalls(controller: ReturnType<typeof createController>) {
  expect(controller.selectLayer).toHaveBeenNthCalledWith(1, 'vector-layer', {
    focusViewport: false,
  });
  expect(controller.selectLayer).toHaveBeenNthCalledWith(2, 'vector-layer', {
    focusViewport: false,
  });
  expect(controller.withHistoryMuted).toHaveBeenCalledTimes(3);
  expect(controller.applyLayerEffect).toHaveBeenCalledWith('vector-layer', {
    amount: 0.5,
    enabled: true,
    id: 'brightness',
  });
  expect(controller.applyLayerTransformation).toHaveBeenCalledWith('vector-layer', 'rotate-left');
  expect(controller.updateLayerEffect).toHaveBeenCalledWith('vector-layer', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  expect(controller.previewLayerEffect).toHaveBeenCalledWith('vector-layer', {
    amount: 0.25,
    enabled: true,
    id: 'contrast',
  });
  expect(controller.resetLayerEffectPreview).toHaveBeenCalledWith('vector-layer');
  expect(controller.removeLayerEffect).toHaveBeenCalledWith('vector-layer', 'brightness');
}

function expectLayerEffectsOpened(
  store: ReturnType<typeof createStoreSlice>,
  openLayerEffects: ReturnType<typeof vi.fn>
) {
  expect(store.setActiveTool).not.toHaveBeenCalled();
  expect(store.syncActiveTool).toHaveBeenCalledWith('select');
  expect(openLayerEffects).toHaveBeenCalledWith('vector-layer', 'filters', 'blur');
  expect(store.setLayerEffectsCategory).toHaveBeenCalledWith('filters');
  expect(store.setInspector).toHaveBeenCalledWith('layer-effects');
}

function createBoundController(state: {
  activeTool: string | null;
  selectedLayerId: string | null;
}) {
  return {
    bound: true,
    applyFrameSettings: vi.fn(),
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    closeDocument: vi.fn(),
    removeLayerEffect: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    selectLayer(this: { bound: boolean }, layerId: string) {
      if (!this.bound) throw new Error('lost selectLayer binding');
      state.selectedLayerId = layerId;
    },
    setActiveTool(this: { bound: boolean }, tool: string) {
      if (!this.bound) throw new Error('lost setActiveTool binding');
      state.activeTool = tool;
    },
    updateLayerEffect: vi.fn(async () => undefined),
    withHistoryMuted<T>(this: { bound: boolean }, callback: () => T) {
      if (!this.bound) throw new Error('lost withHistoryMuted binding');
      return callback();
    },
  };
}

it('builds derived params and controller-derived props from the store seam', () => {
  const store = createStoreSlice();
  const derived = { id: 'derived' };

  expect(selectEditorInspectorSidebarDerivedInput(true, store)).toEqual({
    activeTool: 'select',
    canvasHeight: 600,
    canvasWidth: 800,
    hasImage: true,
    inspector: 'tool',
    selection: store.selection,
    selectionToolSettings: store.selectionToolSettings,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: store.toolSettings,
  });
  expect(
    mergeEditorInspectorDerivedState({
      browserFrame: store.browserFrame as never,
      cropReady: true,
      defaultImagePresetId: 'preset-1',
      derived: derived as never,
      savePresets: [{ id: 'preset-1' }] as never,
      selection: store.selection as never,
      workspace: store.workspace as never,
    })
  ).toEqual({
    browserFrame: store.browserFrame,
    cropReady: true,
    cropSelection: null,
    defaultImagePresetId: 'preset-1',
    id: 'derived',
    savePresets: [{ id: 'preset-1' }],
    selection: store.selection,
    workspace: store.workspace,
  });
});
it('runs raster-only actions immediately and opens layer-effects in the inspector', async () => {
  const store = createStoreSlice();
  const controller = createController();
  const { actionGroups, openLayerEffects } = createControllerActionProps(store, controller);

  await runLayerEffectActions(actionGroups.layerEffects);

  expectLayerEffectControllerCalls(controller);
  expectLayerEffectsOpened(store, openLayerEffects);
});
it('keeps controller method bindings intact for layer-effect opening', () => {
  const store = createStoreSlice();
  const openLayerEffects = vi.fn();
  const boundState = { activeTool: null as string | null, selectedLayerId: null as string | null };
  const controller = createBoundController(boundState);
  const { layerEffects } = createEditorInspectorControllerActions({
    actions: {} as never,
    backgroundImageInputRef: { current: null } as never,
    controller: controller as never,
    frameDraft: { id: 'draft' } as never,
    importSessionInputRef: { current: null } as never,
    openImageInputRef: { current: null } as never,
    openLayerEffects,
    syncActiveTool: store.syncActiveTool,
    setImageData: store.setImageData,
    setInspector: store.setInspector,
    setLayerEffectsCategory: store.setLayerEffectsCategory,
  });

  expect(() => layerEffects.onOpenLayerEffects('vector-layer', 'filters', 'blur')).not.toThrow();
  expect(boundState.selectedLayerId).toBe('vector-layer');
  expect(boundState.activeTool).toBe('select');
  expect(store.setActiveTool).not.toHaveBeenCalled();
  expect(store.syncActiveTool).toHaveBeenCalledWith('select');
  expect(openLayerEffects).toHaveBeenCalledWith('vector-layer', 'filters', 'blur');
  expect(store.setLayerEffectsCategory).toHaveBeenCalledWith('filters');
  expect(store.setInspector).toHaveBeenCalledWith('layer-effects');
});
it('keeps close-document confirmation while raster-only actions run immediately', async () => {
  const store = createStoreSlice();
  const controller = createController();
  const setSavePresetPickerOpen = vi.fn();
  const requestConfirm = vi.fn(
    async (dialog?: { title?: string }) => dialog?.title === 'editor.documentActions.closeFile'
  );
  const { document } = createEditorInspectorControllerActions({
    actions: {} as never,
    backgroundImageInputRef: { current: null } as never,
    controller: controller as never,
    frameDraft: { id: 'draft' } as never,
    importSessionInputRef: { current: null } as never,
    openImageInputRef: { current: null } as never,
    openLayerEffects: vi.fn(),
    syncActiveTool: store.syncActiveTool,
    setImageData: store.setImageData,
    setInspector: store.setInspector,
    setLayerEffectsCategory: store.setLayerEffectsCategory,
  });

  await document.onResizeLayer('vector-layer', 200, 100);
  expect(controller.resizeLayer).toHaveBeenCalledWith('vector-layer', 200, 100);

  const closeWithoutImage = createCloseDocumentHandler({
    controller: controller as never,
    hasImage: false,
    requestConfirm,
    setSavePresetPickerOpen,
  });
  const closeWithImage = createCloseDocumentHandler({
    controller: controller as never,
    hasImage: true,
    requestConfirm,
    setSavePresetPickerOpen,
  });

  closeWithoutImage();
  closeWithImage();
  await act(async () => undefined);

  expect(setSavePresetPickerOpen).toHaveBeenCalledWith(false);
  expect(controller.closeDocument).toHaveBeenCalledTimes(2);
});
