import { expect, it, vi } from 'vitest';

const actionRailMocks = vi.hoisted(() => ({ exportSession: vi.fn() }));

vi.mock('./action-rail', () => ({
  createEditorActionRailHandlers: () => actionRailMocks,
}));

import { createEditorInspectorControllerActions } from './builders';
import { DimensionInput } from '../sidebar-shared';

function createStoreSlice() {
  return {
    syncActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
  };
}

function createController() {
  return {
    applyFrameSettings: vi.fn(),
    applyLayerEffect: vi.fn(),
    applyLayerTransformation: vi.fn(),
    closeDocument: vi.fn(),
    previewLayerEffect: vi.fn(),
    removeLayerEffect: vi.fn(),
    resetLayerEffectPreview: vi.fn(),
    resizeCanvas: vi.fn(),
    resizeImage: vi.fn(),
    resizeLayer: vi.fn(),
    selectLayer: vi.fn(),
    setActiveTool: vi.fn(),
    updateLayerEffect: vi.fn(),
    withHistoryMuted: vi.fn(<T>(callback: () => T) => callback()),
  };
}

it('exposes shared dimension inputs and input-click handlers in the action props', () => {
  const store = createStoreSlice();
  const controller = createController();
  const openImageClick = vi.fn();
  const importClick = vi.fn();
  const backgroundClick = vi.fn();
  const { document } = createEditorInspectorControllerActions({
    actions: {} as never,
    backgroundImageInputRef: { current: { click: backgroundClick } } as never,
    controller: controller as never,
    frameDraft: { id: 'draft' } as never,
    importSessionInputRef: { current: { click: importClick } } as never,
    openImageInputRef: { current: { click: openImageClick } } as never,
    openLayerEffects: vi.fn(),
    syncActiveTool: store.syncActiveTool,
    setImageData: store.setImageData,
    setInspector: store.setInspector,
    setLayerEffectsCategory: store.setLayerEffectsCategory,
  });

  document.onOpenImage();
  document.onImportSession();
  document.onPickBackgroundImage();
  document.onExportSession();

  expect(document.DimensionInput).toBe(DimensionInput);
  expect(openImageClick).toHaveBeenCalledOnce();
  expect(importClick).toHaveBeenCalledOnce();
  expect(backgroundClick).toHaveBeenCalledOnce();
  expect(actionRailMocks.exportSession).toHaveBeenCalledOnce();
});
