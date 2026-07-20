// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact content-props proof keeps the pure view/action mapping assertions together */
import { describe, expect, it, vi } from 'vitest';

import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createEditorInspectorContentActions,
  createEditorInspectorContentCoreView,
} from './content-props';

function createSidebarExpandedController(overrides: Record<string, unknown> = {}) {
  const openImageInput = document.createElement('input');
  const importSessionInput = document.createElement('input');
  const backgroundInput = document.createElement('input');

  return {
    ...createContentProps(),
    backgroundImageInputRef: { current: backgroundInput },
    draggedLayerId: null,
    dragOverLayerId: null,
    handleCloseDocument: vi.fn(),
    importSessionInputRef: { current: importSessionInput },
    layers: [],
    layersExpanded: false,
    openImageInputRef: { current: openImageInput },
    requestConfirm: vi.fn(),
    setDragOverLayerId: vi.fn(),
    setDraggedLayerId: vi.fn(),
    setLayersExpanded: vi.fn(),
    ...overrides,
  };
}

describe('inspector/sidebar-expanded-content content props', () => {
  it('builds the core content view from the controller state', () => {
    const controller = createSidebarExpandedController({
      imageSizeText: '640 x 480',
      layerSizeText: '160 x 120',
      savePresetPickerOpen: true,
      showDocumentActions: true,
      showViewportMetrics: false,
    });

    const view = createEditorInspectorContentCoreView(false, controller as never);

    expect(view.hasImage).toBe(false);
    expect(view.inspector).toBe(controller.inspector);
    expect(view.imageSizeText).toBe('640 x 480');
    expect(view.canvasSize).toEqual(controller.canvasSize);
    expect(view.layerSizeText).toBe('160 x 120');
    expect(view.showDocumentActions).toBe(true);
    expect(view.showViewportMetrics).toBe(false);
    expect(view.savePresetPickerOpen).toBe(true);
    expect(view.framePaddingSummary).toBe(controller.framePaddingSummary);
    expect(view.setFrameDraft).toBe(controller.setFrameDraft);
    expect(view.saveShapeAsHighlighterPreset).toBe(controller.saveShapeAsHighlighterPreset);
    expect(view.updateColor).toBe(controller.updateColor);
    expect(view.applyWorkspaceColor).toBe(controller.applyWorkspaceColor);
    expect(view.saveWorkspaceColorAsDefault).toBe(controller.saveWorkspaceColorAsDefault);
    expect(view.workspaceColorError).toBe(controller.workspaceColorError);
    expect(view.workspaceColorMatchesDefault).toBe(controller.workspaceColorMatchesDefault);
    expect(view.workspaceDefaultSavePending).toBe(controller.workspaceDefaultSavePending);
    expect(view.updateWorkspace).toBe(controller.updateWorkspace);
    expect(view.applyTextStyle).toBe(controller.applyTextStyle);
    expect(view.richShapeSelection).toBe(controller.richShapeSelection);
    expect(view.applyRichShapePatch).toBe(controller.applyRichShapePatch);
    expect(view.arrangeSelection).toBe(controller.arrangeSelection);
    expect(view.applyBlurPatch).toBe(controller.applyBlurPatch);
    expect(view.applyImagePatch).toBe(controller.applyImagePatch);
    expect(view.applyLinePatch).toBe(controller.applyLinePatch);
    expect(view.previewColor).toBe(controller.previewColor);
    expect(view.setPencilShapeCorrection).toBe(controller.setPencilShapeCorrection);
    expect(view.previewArrowPatch).toBe(controller.previewArrowPatch);
    expect(view.previewLinePatch).toBe(controller.previewLinePatch);
    expect(view.previewBlurPatch).toBe(controller.previewBlurPatch);
    expect(view.previewShapePatch).toBe(controller.previewShapePatch);
    expect(view.previewBrushPatch).toBe(controller.previewBrushPatch);
    expect(view.previewTextPatch).toBe(controller.previewTextPatch);
    expect(view.previewStepPatch).toBe(controller.previewStepPatch);
    expect(view.previewImagePatch).toBe(controller.previewImagePatch);
    expect(view.commitPendingSelectionSettings).toBe(controller.commitPendingSelectionSettings);
    expect(view.insertOrUpdateBrowserFrame).toBe(controller.insertOrUpdateBrowserFrame);
    expect(view.onResizeLayer).toBe(controller.onResizeLayer);
    expect(view.onOpenLayerEffects).toBe(controller.onOpenLayerEffects);
    expect(view.applyLayerEffect).toBe(controller.applyLayerEffect);
    expect(view.updateLayerEffect).toBe(controller.updateLayerEffect);
    expect(view.removeLayerEffect).toBe(controller.removeLayerEffect);
    expect(view.applyLayerTransformation).toBe(controller.applyLayerTransformation);
  });

  it('omits optional line and image patch actions when the controller is legacy-shaped', () => {
    const view = createEditorInspectorContentCoreView(
      true,
      createSidebarExpandedController({
        applyImagePatch: undefined,
        applyLinePatch: undefined,
        previewImagePatch: undefined,
        previewLinePatch: undefined,
      }) as never
    );

    expect(view).not.toHaveProperty('applyLinePatch');
    expect(view).not.toHaveProperty('applyImagePatch');
    expect(view).not.toHaveProperty('previewImagePatch');
    expect(view).not.toHaveProperty('previewLinePatch');
  });

  it('omits optional browser-frame insertion when the controller is legacy-shaped', () => {
    const view = createEditorInspectorContentCoreView(
      true,
      createSidebarExpandedController({ insertOrUpdateBrowserFrame: undefined }) as never
    );

    expect(view).not.toHaveProperty('insertOrUpdateBrowserFrame');
  });

  it('builds click-driven actions and omits the disabled reason when it is undefined', () => {
    const openInput = document.createElement('input');
    const importInput = document.createElement('input');
    const backgroundInput = document.createElement('input');
    const openImageClick = vi.spyOn(openInput, 'click').mockImplementation(() => undefined);
    const importSessionClick = vi.spyOn(importInput, 'click').mockImplementation(() => undefined);
    const backgroundClick = vi.spyOn(backgroundInput, 'click').mockImplementation(() => undefined);
    const controller = createSidebarExpandedController({
      backgroundImageInputRef: { current: backgroundInput },
      copyRenderedImageDisabledReason: undefined,
      importSessionInputRef: { current: importInput },
      openImageInputRef: { current: openInput },
    });

    const actions = createEditorInspectorContentActions(controller as never);

    actions.onOpenImage();
    actions.onImportSession();
    actions.onPickBackgroundImage();

    expect('copyRenderedImageDisabledReason' in actions).toBe(false);
    expect(openImageClick).toHaveBeenCalledOnce();
    expect(importSessionClick).toHaveBeenCalledOnce();
    expect(backgroundClick).toHaveBeenCalledOnce();
    actions.applyGradientPreset('sunset' as never);
    actions.saveToPreset('scene-background' as never);
    actions.setInspector('workspace' as never);
    void actions.onSaveImageAs();
    void actions.onCopyRenderedImage();
    actions.onExportSession();
    actions.onConfirmDialogConfirm();
    actions.onConfirmDialogCancel();
    actions.onCloseDocument();
    void actions.onSaveImage();
    actions.onApplyFrame();
    actions.setUniformPadding(12);
    actions.clearBackgroundImage();

    expect(controller.handleCloseDocument).toHaveBeenCalledOnce();
    expect(controller.onSaveImage).toHaveBeenCalledOnce();
    expect(controller.onSaveImageAs).toHaveBeenCalledOnce();
    expect(controller.onCopyRenderedImage).toHaveBeenCalledOnce();
    expect(controller.onExportSession).toHaveBeenCalledOnce();
    expect(controller.onApplyFrame).toHaveBeenCalledOnce();
    expect(controller.setUniformPadding).toHaveBeenCalledWith(12);
    expect(controller.clearBackgroundImage).toHaveBeenCalledOnce();
    expect(controller.applyGradientPreset).toHaveBeenCalledWith('sunset');
    expect(controller.saveToPreset).toHaveBeenCalledWith('scene-background');
    expect(controller.setInspector).toHaveBeenCalledWith('workspace');
    expect(controller.onConfirmDialogConfirm).toHaveBeenCalledOnce();
    expect(controller.onConfirmDialogCancel).toHaveBeenCalledOnce();
    expect('previewColor' in actions).toBe(false);
  });

  it('preserves the copy-disabled reason when the controller exposes one', () => {
    const openInput = document.createElement('input');
    const importInput = document.createElement('input');
    const backgroundInput = document.createElement('input');
    const openClick = vi.spyOn(openInput, 'click').mockImplementation(() => undefined);
    const importClick = vi.spyOn(importInput, 'click').mockImplementation(() => undefined);
    const backgroundClick = vi.spyOn(backgroundInput, 'click').mockImplementation(() => undefined);
    const controller = createSidebarExpandedController({
      backgroundImageInputRef: { current: backgroundInput },
      copyRenderedImageDisabledReason: 'clipboard-denied',
      importSessionInputRef: { current: importInput },
      openImageInputRef: { current: openInput },
    });

    const actions = createEditorInspectorContentActions(controller as never);

    actions.onOpenImage();
    actions.onImportSession();
    actions.onPickBackgroundImage();

    expect(actions.copyRenderedImageDisabledReason).toBe('clipboard-denied');
    expect(openClick).toHaveBeenCalledOnce();
    expect(importClick).toHaveBeenCalledOnce();
    expect(backgroundClick).toHaveBeenCalledOnce();
  });

  it('keeps optional input handlers safe when refs are missing', () => {
    const controller = createSidebarExpandedController({
      backgroundImageInputRef: { current: null },
      importSessionInputRef: { current: null },
      openImageInputRef: { current: null },
    });

    const actions = createEditorInspectorContentActions(controller as never);

    expect(() => actions.onOpenImage()).not.toThrow();
    expect(() => actions.onImportSession()).not.toThrow();
    expect(() => actions.onPickBackgroundImage()).not.toThrow();
  });
});
