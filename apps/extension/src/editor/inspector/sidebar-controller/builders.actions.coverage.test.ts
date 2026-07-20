import { expect, it, vi } from 'vitest';

const actionRailMocks = vi.hoisted(() => ({ exportSession: vi.fn() }));
const richShapeSelectionMocks = vi.hoisted(() => ({
  updateSelectedRichShapeFormatting: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./action-rail', () => ({
  createEditorActionRailHandlers: () => actionRailMocks,
}));

vi.mock('../../controller/public-actions/selection/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../controller/public-actions/selection/rich-shape')
  >()),
  updateSelectedRichShapeFormatting: richShapeSelectionMocks.updateSelectedRichShapeFormatting,
}));

import { createEditorInspectorControllerActions, createRichShapeActionHandlers } from './builders';

function createStoreSlice() {
  return {
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    syncActiveTool: vi.fn(),
  };
}

function createController() {
  return {
    applyFrameSettings: vi.fn(),
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    removeLayerEffect: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    selectLayer: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    setActiveTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    withHistoryMuted: vi.fn(<T>(callback: () => T) => callback()),
  };
}

function createControllerActionProps(args: {
  controller: ReturnType<typeof createController>;
  store: ReturnType<typeof createStoreSlice>;
}) {
  const groups = createEditorInspectorControllerActions({
    actions: {} as never,
    backgroundImageInputRef: { current: null } as never,
    controller: args.controller as never,
    frameDraft: { id: 'draft' } as never,
    importSessionInputRef: { current: null } as never,
    openImageInputRef: { current: null } as never,
    openLayerEffects: vi.fn(),
    syncActiveTool: args.store.syncActiveTool,
    setImageData: args.store.setImageData,
    setInspector: args.store.setInspector,
    setLayerEffectsCategory: args.store.setLayerEffectsCategory,
  });
  return { ...groups.document, ...groups.layerEffects };
}

it('routes controller actions and rich-shape arrangement branches', async () => {
  const store = createStoreSlice();
  const controller = createController();
  const props = createControllerActionProps({ controller, store });

  await props.applyLayerTransformation('vector-layer', 'rotate-left');
  props.removeLayerEffect('vector-layer', 'blur');
  await props.updateLayerEffect('vector-layer', {
    amount: 0.25,
    enabled: true,
    id: 'brightness',
  });
  props.onApplyFrame();
  props.onResizeCanvas(640, 480);
  props.onResizeImage(320, 240);

  const richShape = createRichShapeActionHandlers(controller as never);
  richShape.arrangeSelection('forward');
  richShape.arrangeSelection('backward');
  richShape.arrangeSelection('front');
  richShape.arrangeSelection('back');
  richShape.applyRichShapePatch({ fillColor: '#ffffff' } as never);

  expect(controller.applyLayerTransformation).toHaveBeenCalledWith('vector-layer', 'rotate-left');
  expect(controller.removeLayerEffect).toHaveBeenCalledWith('vector-layer', 'blur');
  expect(controller.updateLayerEffect).toHaveBeenCalledWith('vector-layer', {
    amount: 0.25,
    enabled: true,
    id: 'brightness',
  });
  expect(controller.applyFrameSettings).toHaveBeenCalledWith({ id: 'draft' });
  expect(controller.resizeCanvas).toHaveBeenCalledWith(640, 480);
  expect(controller.resizeImage).toHaveBeenCalledWith(320, 240);
  expect(controller.bringForwardSelection).toHaveBeenCalledOnce();
  expect(controller.sendBackwardSelection).toHaveBeenCalledOnce();
  expect(controller.bringSelectionToFront).toHaveBeenCalledOnce();
  expect(controller.sendSelectionToBack).toHaveBeenCalledOnce();
  expect(controller.withHistoryMuted).toHaveBeenCalled();
  expect(richShapeSelectionMocks.updateSelectedRichShapeFormatting).toHaveBeenCalled();
});
