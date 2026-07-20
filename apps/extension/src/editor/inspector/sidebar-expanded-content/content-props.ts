import type { EditorInspectorContentController } from '../content/types';

type SidebarExpandedController = Omit<EditorInspectorContentController, 'hasImage'>;

function selectEditorInspectorDimensionState(
  hasImage: boolean,
  controller: SidebarExpandedController
) {
  return {
    hasImage,
    inspector: controller.inspector,
    showDocumentActions: controller.showDocumentActions,
    showViewportMetrics: controller.showViewportMetrics,
    imageSizeText: controller.imageSizeText,
    canvasSizeText: controller.canvasSizeText,
    canvasSize: controller.canvasSize,
    cropSelection: controller.cropSelection,
    imageSizeDraft: controller.imageSizeDraft,
    canvasSizeDraft: controller.canvasSizeDraft,
    layerSizeDraft: controller.layerSizeDraft,
    imageSizeLocked: controller.imageSizeLocked,
    canvasSizeLocked: controller.canvasSizeLocked,
    layerSizeLocked: controller.layerSizeLocked,
    imageAspectRatio: controller.imageAspectRatio,
    canvasAspectRatio: controller.canvasAspectRatio,
    layerAspectRatio: controller.layerAspectRatio,
    layerSizeText: controller.layerSizeText,
  };
}

function selectEditorInspectorCanvasState(controller: SidebarExpandedController) {
  return {
    frameDraft: controller.frameDraft,
    framePaddingSummary: controller.framePaddingSummary,
    layoutModeLabel: controller.layoutModeLabel,
    backgroundModeLabel: controller.backgroundModeLabel,
    backgroundSummary: controller.backgroundSummary,
    backgroundPreviewStyle: controller.backgroundPreviewStyle,
    browserFrame: controller.browserFrame,
    workspace: controller.workspace,
    recentColors: controller.recentColors,
    borderPresetOptions: controller.borderPresetOptions,
    savePresets: controller.savePresets,
    defaultImagePresetId: controller.defaultImagePresetId,
    frameBackgroundPalette: controller.frameBackgroundPalette,
    shapeFillPalette: controller.shapeFillPalette,
    shapeStrokePalette: controller.shapeStrokePalette,
    textBackgroundPalette: controller.textBackgroundPalette,
    textColorPalette: controller.textColorPalette,
    savePresetPickerOpen: controller.savePresetPickerOpen,
    setSavePresetPickerOpen: controller.setSavePresetPickerOpen,
    layerEffectsState: controller.layerEffectsState,
    setLayerEffectsState: controller.setLayerEffectsState,
  };
}

function selectEditorInspectorSelectionState(controller: SidebarExpandedController) {
  return {
    inspector: controller.inspector,
    scenePresetHeader: controller.scenePresetHeader,
    showDocumentActions: controller.showDocumentActions,
    showViewportMetrics: controller.showViewportMetrics,
    selection: controller.selection,
    cropReady: controller.cropReady,
    layers: controller.layers,
    highlightedTool: controller.highlightedTool,
    inspectorToolSettings: controller.inspectorToolSettings,
    richShapeSelection: controller.richShapeSelection,
    toolPresetHeader: controller.toolPresetHeader,
    canDeleteSelection: controller.canDeleteSelection,
    isResizableLayerSelection: controller.isResizableLayerSelection,
    confirmDialog: controller.confirmDialog,
  };
}

function createEditorInspectorContentState(
  hasImage: boolean,
  controller: SidebarExpandedController
) {
  return {
    ...selectEditorInspectorDimensionState(hasImage, controller),
    ...selectEditorInspectorCanvasState(controller),
    ...selectEditorInspectorSelectionState(controller),
  };
}

function selectBrowserFrameActions(controller: SidebarExpandedController) {
  return controller.insertOrUpdateBrowserFrame === undefined
    ? {}
    : { insertOrUpdateBrowserFrame: controller.insertOrUpdateBrowserFrame };
}

function selectEditorInspectorContentDraft(controller: SidebarExpandedController) {
  return {
    ...selectEditorInspectorSizeDraft(controller),
    ...selectEditorInspectorStyleDraft(controller),
    ...selectEditorInspectorPreviewDraft(controller),
    ...selectEditorInspectorContentLayerActions(controller),
    ...selectBrowserFrameActions(controller),
  };
}

function selectEditorInspectorSizeDraft(controller: SidebarExpandedController) {
  return {
    setImageSizeDraft: controller.setImageSizeDraft,
    setCanvasSizeDraft: controller.setCanvasSizeDraft,
    setLayerSizeDraft: controller.setLayerSizeDraft,
    setImageSizeLocked: controller.setImageSizeLocked,
    setCanvasSizeLocked: controller.setCanvasSizeLocked,
    setLayerSizeLocked: controller.setLayerSizeLocked,
    setFrameDraft: controller.setFrameDraft,
  };
}

function selectEditorInspectorStyleDraft(controller: SidebarExpandedController) {
  return {
    previewColor: controller.previewColor,
    updateColor: controller.updateColor,
    applyWorkspaceColor: controller.applyWorkspaceColor,
    saveWorkspaceColorAsDefault: controller.saveWorkspaceColorAsDefault,
    workspaceColorError: controller.workspaceColorError,
    workspaceColorMatchesDefault: controller.workspaceColorMatchesDefault,
    workspaceDefaultSavePending: controller.workspaceDefaultSavePending,
    applyPreset: controller.applyPreset,
    setPencilShapeCorrection: controller.setPencilShapeCorrection,
    saveShapeAsHighlighterPreset: controller.saveShapeAsHighlighterPreset,
    applyBrushPatch: controller.applyBrushPatch,
    applyShapePatch: controller.applyShapePatch,
    applyBlurPatch: controller.applyBlurPatch,
    applyArrowPatch: controller.applyArrowPatch,
    ...(controller.applyLinePatch === undefined
      ? {}
      : { applyLinePatch: controller.applyLinePatch }),
    applyTextPatch: controller.applyTextPatch,
    applyTextStyle: controller.applyTextStyle,
    applyStepPatch: controller.applyStepPatch,
    ...(controller.applyImagePatch === undefined
      ? {}
      : { applyImagePatch: controller.applyImagePatch }),
    applyRichShapePatch: controller.applyRichShapePatch,
    arrangeSelection: controller.arrangeSelection,
  };
}

function selectEditorInspectorPreviewDraft(controller: SidebarExpandedController) {
  return {
    previewBrushPatch: controller.previewBrushPatch,
    previewShapePatch: controller.previewShapePatch,
    previewBlurPatch: controller.previewBlurPatch,
    previewArrowPatch: controller.previewArrowPatch,
    ...(controller.previewLinePatch === undefined
      ? {}
      : { previewLinePatch: controller.previewLinePatch }),
    previewTextPatch: controller.previewTextPatch,
    previewStepPatch: controller.previewStepPatch,
    ...(controller.previewImagePatch === undefined
      ? {}
      : { previewImagePatch: controller.previewImagePatch }),
    commitPendingSelectionSettings: controller.commitPendingSelectionSettings,
    syncBrowserFrame: controller.syncBrowserFrame,
    updateWorkspace: controller.updateWorkspace,
  };
}

function selectEditorInspectorContentLayerActions(controller: SidebarExpandedController) {
  return {
    onResizeLayer: controller.onResizeLayer,
    onOpenLayerEffects: controller.onOpenLayerEffects,
    applyLayerEffect: controller.applyLayerEffect,
    updateLayerEffect: controller.updateLayerEffect,
    previewLayerEffect: controller.previewLayerEffect,
    resetLayerEffectPreview: controller.resetLayerEffectPreview,
    removeLayerEffect: controller.removeLayerEffect,
    applyLayerTransformation: controller.applyLayerTransformation,
  };
}

export function createEditorInspectorContentCoreView(
  hasImage: boolean,
  controller: SidebarExpandedController
) {
  return {
    ...createEditorInspectorContentState(hasImage, controller),
    ...selectEditorInspectorContentDraft(controller),
  };
}

export function createEditorInspectorContentActions(controller: SidebarExpandedController) {
  return {
    setUniformPadding: controller.setUniformPadding,
    applyGradientPreset: controller.applyGradientPreset,
    clearBackgroundImage: controller.clearBackgroundImage,
    saveToPreset: controller.saveToPreset,
    setInspector: controller.setInspector,
    onOpenImage: () => controller.openImageInputRef.current?.click(),
    onImportSession: () => controller.importSessionInputRef.current?.click(),
    onCloseDocument: controller.handleCloseDocument,
    onConfirmDialogConfirm: controller.onConfirmDialogConfirm,
    onConfirmDialogCancel: controller.onConfirmDialogCancel,
    onPickBackgroundImage: () => controller.backgroundImageInputRef.current?.click(),
    onSaveImage: controller.onSaveImage,
    onSaveImageAs: controller.onSaveImageAs,
    onCopyRenderedImage: controller.onCopyRenderedImage,
    onExportSession: controller.onExportSession,
    onApplyFrame: controller.onApplyFrame,
    ...(controller.copyRenderedImageDisabledReason === undefined
      ? {}
      : { copyRenderedImageDisabledReason: controller.copyRenderedImageDisabledReason }),
  };
}
