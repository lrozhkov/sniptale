import {
  GRID_COLOR_PALETTE,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  WORKSPACE_BACKGROUND_PALETTE,
  clampGridSize,
  getArrowHeadOptions,
  getArrowModeOptions,
  getArrowVariantOptions,
  getBlurTypeOptions,
  getBrowserCanvasModeOptions,
  getBrowserContentModeOptions,
  getFontOptions,
  getFrameBackgroundImageFitOptions,
  getFrameBackgroundModeOptions,
  getFrameGradientPresets,
  getFrameLayoutModeOptions,
  getStepAlphabetOptions,
  getStepTypeOptions,
  getTextAlignOptions,
  getTextCalloutFormatOptions,
  getTextLayoutModeOptions,
  getTextVerticalAlignOptions,
  toNumber,
  updateLockedDraft,
} from '../sidebar-shared';
import {
  getArrowTypeOptions,
  getLineCornerOptions,
  getLineFillModeOptions,
  getLineRoughFillStyleOptions,
  getLineStyleOptions,
} from '../sidebar-shared/options';

import type { EditorInspectorContentProps } from './types';

function getEditorInspectorContentOptions() {
  return {
    arrowVariantOptions: getArrowVariantOptions(),
    arrowTypeOptions: getArrowTypeOptions(),
    arrowModeOptions: getArrowModeOptions(),
    arrowHeadOptions: getArrowHeadOptions(),
    lineStyleOptions: getLineStyleOptions(),
    lineCornerOptions: getLineCornerOptions(),
    lineFillModeOptions: getLineFillModeOptions(),
    lineRoughFillStyleOptions: getLineRoughFillStyleOptions(),
    blurTypeOptions: getBlurTypeOptions(),
    browserCanvasModeOptions: getBrowserCanvasModeOptions(),
    browserContentModeOptions: getBrowserContentModeOptions(),
    fontOptions: getFontOptions(),
    frameBackgroundImageFitOptions: getFrameBackgroundImageFitOptions(),
    frameBackgroundModeOptions: getFrameBackgroundModeOptions(),
    frameGradientPresets: getFrameGradientPresets(),
    frameLayoutModeOptions: getFrameLayoutModeOptions(),
    stepAlphabetOptions: getStepAlphabetOptions(),
    stepTypeOptions: getStepTypeOptions(),
    textAlignOptions: getTextAlignOptions(),
    textCalloutFormatOptions: getTextCalloutFormatOptions(),
    textLayoutModeOptions: getTextLayoutModeOptions(),
    textVerticalAlignOptions: getTextVerticalAlignOptions(),
    workspaceBackgroundPalette: WORKSPACE_BACKGROUND_PALETTE,
    gridPalette: GRID_COLOR_PALETTE,
    gridSizeMin: GRID_SIZE_MIN,
    gridSizeMax: GRID_SIZE_MAX,
    clampGridSize,
    toNumber,
    updateLockedDraft,
  };
}

function selectEditorInspectorContentActions(props: EditorInspectorContentProps) {
  return {
    setImageSizeDraft: props.setImageSizeDraft,
    setCanvasSizeDraft: props.setCanvasSizeDraft,
    setLayerSizeDraft: props.setLayerSizeDraft,
    setImageSizeLocked: props.setImageSizeLocked,
    setCanvasSizeLocked: props.setCanvasSizeLocked,
    setLayerSizeLocked: props.setLayerSizeLocked,
    setFrameDraft: props.setFrameDraft,
    previewColor: props.previewColor,
    updateColor: props.updateColor,
    applyPreset: props.applyPreset,
    setPencilShapeCorrection: props.setPencilShapeCorrection,
    saveShapeAsHighlighterPreset: props.saveShapeAsHighlighterPreset,
    ...selectEditorInspectorContentToolActions(props),
    ...selectEditorInspectorContentSessionActions(props),
    ...selectEditorInspectorContentUtilityActions(props),
    ...selectEditorInspectorContentLayerEffectActions(props),
  };
}

function selectEditorInspectorContentToolActions(props: EditorInspectorContentProps) {
  return {
    applyBrushPatch: props.applyBrushPatch,
    applyShapePatch: props.applyShapePatch,
    applyBlurPatch: props.applyBlurPatch,
    applyArrowPatch: props.applyArrowPatch,
    ...(props.applyLinePatch === undefined ? {} : { applyLinePatch: props.applyLinePatch }),
    applyTextPatch: props.applyTextPatch,
    applyTextStyle: props.applyTextStyle,
    applyStepPatch: props.applyStepPatch,
    ...(props.applyImagePatch === undefined ? {} : { applyImagePatch: props.applyImagePatch }),
    applyRichShapePatch: props.applyRichShapePatch,
    arrangeSelection: props.arrangeSelection,
    previewBrushPatch: props.previewBrushPatch,
    previewShapePatch: props.previewShapePatch,
    previewBlurPatch: props.previewBlurPatch,
    previewArrowPatch: props.previewArrowPatch,
    ...(props.previewLinePatch === undefined ? {} : { previewLinePatch: props.previewLinePatch }),
    previewTextPatch: props.previewTextPatch,
    previewStepPatch: props.previewStepPatch,
    ...(props.previewImagePatch === undefined
      ? {}
      : { previewImagePatch: props.previewImagePatch }),
  };
}

function selectEditorInspectorContentSessionActions(props: EditorInspectorContentProps) {
  return {
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    syncBrowserFrame: props.syncBrowserFrame,
    updateWorkspace: props.updateWorkspace,
    ...(props.insertOrUpdateBrowserFrame === undefined
      ? {}
      : { insertOrUpdateBrowserFrame: props.insertOrUpdateBrowserFrame }),
  };
}

function selectEditorInspectorContentUtilityActions(props: EditorInspectorContentProps) {
  return {
    applyWorkspaceColor: props.applyWorkspaceColor,
    saveWorkspaceColorAsDefault: props.saveWorkspaceColorAsDefault,
    workspaceColorError: props.workspaceColorError,
    workspaceColorMatchesDefault: props.workspaceColorMatchesDefault,
    workspaceDefaultSavePending: props.workspaceDefaultSavePending,
    setUniformPadding: props.setUniformPadding,
    applyGradientPreset: props.applyGradientPreset,
    clearBackgroundImage: props.clearBackgroundImage,
    onPickBackgroundImage: props.onPickBackgroundImage,
    onApplyFrame: props.onApplyFrame,
    onResizeLayer: props.onResizeLayer,
    layers: props.layers,
  };
}

function selectEditorInspectorContentLayerEffectActions(props: EditorInspectorContentProps) {
  return {
    layerEffectsState: props.layerEffectsState,
    setLayerEffectsState: props.setLayerEffectsState,
    onOpenLayerEffects: props.onOpenLayerEffects,
    applyLayerEffect: props.applyLayerEffect,
    updateLayerEffect: props.updateLayerEffect,
    previewLayerEffect: props.previewLayerEffect,
    resetLayerEffectPreview: props.resetLayerEffectPreview,
    removeLayerEffect: props.removeLayerEffect,
    applyLayerTransformation: props.applyLayerTransformation,
  };
}

export function createEditorInspectorContentBodyProps(props: EditorInspectorContentProps) {
  return {
    ...selectEditorInspectorContentSelection(props),
    ...selectEditorInspectorContentSizing(props),
    ...selectEditorInspectorContentFrame(props),
    ...selectEditorInspectorContentWorkspace(props),
    ...getEditorInspectorContentOptions(),
    ...selectEditorInspectorContentActions(props),
  };
}

function selectEditorInspectorContentSelection(props: EditorInspectorContentProps) {
  return {
    inspector: props.inspector,
    scenePresetHeader: props.scenePresetHeader,
    selection: props.selection,
    cropReady: props.cropReady,
    cropSelection: props.cropSelection,
    highlightedTool: props.highlightedTool,
    inspectorToolSettings: props.inspectorToolSettings,
    richShapeSelection: props.richShapeSelection,
    toolPresetHeader: props.toolPresetHeader,
    canDeleteSelection: props.canDeleteSelection,
    isResizableLayerSelection: props.isResizableLayerSelection,
  };
}

function selectEditorInspectorContentSizing(props: EditorInspectorContentProps) {
  return {
    imageSizeText: props.imageSizeText,
    canvasSizeText: props.canvasSizeText,
    canvasSize: props.canvasSize,
    layerSizeText: props.layerSizeText,
    imageSizeDraft: props.imageSizeDraft,
    canvasSizeDraft: props.canvasSizeDraft,
    layerSizeDraft: props.layerSizeDraft,
    imageSizeLocked: props.imageSizeLocked,
    canvasSizeLocked: props.canvasSizeLocked,
    layerSizeLocked: props.layerSizeLocked,
    imageAspectRatio: props.imageAspectRatio,
    canvasAspectRatio: props.canvasAspectRatio,
    layerAspectRatio: props.layerAspectRatio,
  };
}

function selectEditorInspectorContentFrame(props: EditorInspectorContentProps) {
  return {
    frameDraft: props.frameDraft,
    framePaddingSummary: props.framePaddingSummary,
    layoutModeLabel: props.layoutModeLabel,
    backgroundModeLabel: props.backgroundModeLabel,
    backgroundSummary: props.backgroundSummary,
    backgroundPreviewStyle: props.backgroundPreviewStyle,
    browserFrame: props.browserFrame,
  };
}

function selectEditorInspectorContentWorkspace(props: EditorInspectorContentProps) {
  return {
    workspace: props.workspace,
    workspaceColorError: props.workspaceColorError,
    workspaceColorMatchesDefault: props.workspaceColorMatchesDefault,
    workspaceDefaultSavePending: props.workspaceDefaultSavePending,
    recentColors: props.recentColors,
    borderPresetOptions: props.borderPresetOptions,
    frameBackgroundPalette: props.frameBackgroundPalette,
    shapeFillPalette: props.shapeFillPalette,
    shapeStrokePalette: props.shapeStrokePalette,
    textBackgroundPalette: props.textBackgroundPalette,
    textColorPalette: props.textColorPalette,
  };
}
