import type {
  BuildEditorInspectorCompactCommandGroupsParams,
  EditorInspectorCompactCommandContext,
} from './command-types';

function buildCompactCommonParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['common'] {
  return {
    hasImage: params.hasImage,
    showDocumentActions: params.showDocumentActions,
    defaultImagePresetId: params.defaultImagePresetId,
    inspector: params.inspector,
  };
}

function buildCompactSelectionParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['selection'] {
  return {
    selection: params.selection,
    canDeleteSelection: params.canDeleteSelection,
    cropReady: params.cropReady,
    highlightedTool: params.highlightedTool,
    inspectorToolSettings: params.inspectorToolSettings,
    isResizableLayerSelection: params.isResizableLayerSelection,
    richShapeSelection: params.richShapeSelection,
    toolPresetHeader: params.toolPresetHeader,
  };
}

function buildCompactSizeParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['sizes'] {
  return {
    imageSizeText: params.imageSizeText,
    canvasSizeText: params.canvasSizeText,
    layerSizeText: params.layerSizeText,
    imageSizeDraft: params.imageSizeDraft,
    canvasSizeDraft: params.canvasSizeDraft,
    layerSizeDraft: params.layerSizeDraft,
    imageSizeLocked: params.imageSizeLocked,
    canvasSizeLocked: params.canvasSizeLocked,
    layerSizeLocked: params.layerSizeLocked,
    imageAspectRatio: params.imageAspectRatio,
    canvasAspectRatio: params.canvasAspectRatio,
    layerAspectRatio: params.layerAspectRatio,
  };
}

function buildCompactFrameParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['frame'] {
  return {
    frameDraft: params.frameDraft,
    framePaddingSummary: params.framePaddingSummary,
    layoutModeLabel: params.layoutModeLabel,
    backgroundModeLabel: params.backgroundModeLabel,
    backgroundSummary: params.backgroundSummary,
    backgroundPreviewStyle: params.backgroundPreviewStyle,
    browserFrame: params.browserFrame,
    workspace: params.workspace,
    workspaceColorError: params.workspaceColorError,
    workspaceColorMatchesDefault: params.workspaceColorMatchesDefault,
    workspaceDefaultSavePending: params.workspaceDefaultSavePending,
  };
}

function buildCompactLayerEffectsParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['layerEffects'] {
  return {
    layers: params.layers,
    layerEffectsState: params.layerEffectsState,
  };
}

function buildCompactStyleOptions(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['styleOptions'] {
  return {
    recentColors: params.recentColors,
    shapeFillPalette: params.shapeFillPalette,
    shapeStrokePalette: params.shapeStrokePalette,
    textColorPalette: params.textColorPalette,
    borderPresets: params.borderPresets,
    borderPresetOptions: params.borderPresetOptions,
    blurTypeOptions: params.blurTypeOptions,
    arrowVariantOptions: params.arrowVariantOptions,
    arrowTypeOptions: params.arrowTypeOptions,
    arrowModeOptions: params.arrowModeOptions,
    arrowHeadOptions: params.arrowHeadOptions,
    lineStyleOptions: params.lineStyleOptions,
    lineCornerOptions: params.lineCornerOptions,
    lineFillModeOptions: params.lineFillModeOptions,
    lineRoughFillStyleOptions: params.lineRoughFillStyleOptions,
    textCalloutFormatOptions: params.textCalloutFormatOptions,
    fontOptions: params.fontOptions,
    textAlignOptions: params.textAlignOptions ?? [],
    textLayoutModeOptions: params.textLayoutModeOptions ?? [],
    stepTypeOptions: params.stepTypeOptions,
    stepAlphabetOptions: params.stepAlphabetOptions,
  };
}

function buildCompactFrameOptions(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['frameOptions'] {
  return {
    browserCanvasModeOptions: params.browserCanvasModeOptions,
    browserContentModeOptions: params.browserContentModeOptions,
    frameLayoutModeOptions: params.frameLayoutModeOptions,
    frameBackgroundModeOptions: params.frameBackgroundModeOptions,
    frameBackgroundImageFitOptions: params.frameBackgroundImageFitOptions,
    frameGradientPresets: params.frameGradientPresets,
    frameBackgroundPalette: params.frameBackgroundPalette,
    workspaceBackgroundPalette: params.workspaceBackgroundPalette,
    gridColorPalette: params.gridColorPalette,
    gridSizeMin: params.gridSizeMin,
    gridSizeMax: params.gridSizeMax,
    savePresets: params.savePresets,
    DimensionInput: params.DimensionInput,
  };
}

function buildCompactUtilityActions(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['utilityActions'] {
  return {
    renderSavePresetOptions: params.renderSavePresetOptions,
    previewColor: params.previewColor,
    updateColor: params.updateColor,
    toNumber: params.toNumber,
    clampGridSize: params.clampGridSize,
    updateLockedDraft: params.updateLockedDraft,
  };
}

function buildCompactEditorActions(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['editorActions'] {
  return {
    applyPreset: params.applyPreset,
    setPencilShapeCorrection: params.setPencilShapeCorrection,
    applyBrushPatch: params.applyBrushPatch,
    applyShapePatch: params.applyShapePatch,
    applyBlurPatch: params.applyBlurPatch,
    applyArrowPatch: params.applyArrowPatch,
    ...(params.applyLinePatch === undefined ? {} : { applyLinePatch: params.applyLinePatch }),
    applyTextPatch: params.applyTextPatch,
    applyTextStyle: params.applyTextStyle,
    applyStepPatch: params.applyStepPatch,
    ...(params.applyImagePatch === undefined ? {} : { applyImagePatch: params.applyImagePatch }),
    applyRichShapePatch: params.applyRichShapePatch,
    arrangeSelection: params.arrangeSelection,
    previewBrushPatch: params.previewBrushPatch,
    previewShapePatch: params.previewShapePatch,
    previewBlurPatch: params.previewBlurPatch,
    previewArrowPatch: params.previewArrowPatch,
    ...(params.previewLinePatch === undefined ? {} : { previewLinePatch: params.previewLinePatch }),
    previewTextPatch: params.previewTextPatch,
    previewStepPatch: params.previewStepPatch,
    ...(params.previewImagePatch === undefined
      ? {}
      : { previewImagePatch: params.previewImagePatch }),
    commitPendingSelectionSettings: params.commitPendingSelectionSettings,
    setImageSizeDraft: params.setImageSizeDraft,
    setCanvasSizeDraft: params.setCanvasSizeDraft,
    setLayerSizeDraft: params.setLayerSizeDraft,
    setImageSizeLocked: params.setImageSizeLocked,
    setCanvasSizeLocked: params.setCanvasSizeLocked,
    setLayerSizeLocked: params.setLayerSizeLocked,
    setFrameDraft: params.setFrameDraft,
    applyWorkspaceColor: params.applyWorkspaceColor,
    saveWorkspaceColorAsDefault: params.saveWorkspaceColorAsDefault,
    syncBrowserFrame: params.syncBrowserFrame,
    updateWorkspace: params.updateWorkspace,
    setLayerEffectsState: params.setLayerEffectsState,
    setUniformPadding: params.setUniformPadding,
    applyGradientPreset: params.applyGradientPreset,
    clearBackgroundImage: params.clearBackgroundImage,
    onPickBackgroundImage: params.onPickBackgroundImage,
    ...(params.insertOrUpdateBrowserFrame === undefined
      ? {}
      : { insertOrUpdateBrowserFrame: params.insertOrUpdateBrowserFrame }),
  };
}

function buildCompactDocumentActions(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams['document'] {
  return {
    onSaveImage: params.onSaveImage,
    onSaveImageAs: params.onSaveImageAs,
    onCopyRenderedImage: params.onCopyRenderedImage,
    onOpenImage: params.onOpenImage,
    onExportSession: params.onExportSession,
    onImportSession: params.onImportSession,
    onCloseDocument: params.onCloseDocument,
    onResizeImage: params.onResizeImage,
    onResizeCanvas: params.onResizeCanvas,
    onResizeLayer: params.onResizeLayer,
    onOpenLayerEffects: params.onOpenLayerEffects,
    applyLayerEffect: params.applyLayerEffect,
    updateLayerEffect: params.updateLayerEffect,
    previewLayerEffect: params.previewLayerEffect,
    resetLayerEffectPreview: params.resetLayerEffectPreview,
    removeLayerEffect: params.removeLayerEffect,
    applyLayerTransformation: params.applyLayerTransformation,
    onApplyFrame: params.onApplyFrame,
    ...(params.copyRenderedImageDisabledReason === undefined
      ? {}
      : { copyRenderedImageDisabledReason: params.copyRenderedImageDisabledReason }),
  };
}

export function createEditorInspectorCompactCommandGroupsParams(
  params: EditorInspectorCompactCommandContext
): BuildEditorInspectorCompactCommandGroupsParams {
  return {
    common: buildCompactCommonParams(params),
    selection: buildCompactSelectionParams(params),
    sizes: buildCompactSizeParams(params),
    frame: buildCompactFrameParams(params),
    layerEffects: buildCompactLayerEffectsParams(params),
    styleOptions: buildCompactStyleOptions(params),
    frameOptions: buildCompactFrameOptions(params),
    utilityActions: buildCompactUtilityActions(params),
    editorActions: buildCompactEditorActions(params),
    document: buildCompactDocumentActions(params),
  };
}

export function flattenEditorInspectorCompactCommandGroupsParams(
  params: BuildEditorInspectorCompactCommandGroupsParams
): EditorInspectorCompactCommandContext {
  return {
    ...params.common,
    ...params.selection,
    ...params.sizes,
    ...params.frame,
    ...params.layerEffects,
    ...params.styleOptions,
    ...params.frameOptions,
    ...params.utilityActions,
    ...params.editorActions,
    ...params.document,
  };
}
