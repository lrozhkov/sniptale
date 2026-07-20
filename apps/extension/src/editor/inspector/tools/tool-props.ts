import { selectSharedToolProps } from './helpers';
import type { ShapeTool } from './brush-shape-sections/types';
import type { EditorInspectorToolsPanelProps } from './types';

export function createShapeControlsProps(
  props: EditorInspectorToolsPanelProps,
  shapeTool: ShapeTool
) {
  return {
    ...selectSharedToolProps(props),
    applyShapePatch: props.applyShapePatch,
    applyPreset: props.applyPreset,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    previewShapePatch: props.previewShapePatch,
    saveShapeAsHighlighterPreset: props.saveShapeAsHighlighterPreset,
    borderPresetOptions: props.borderPresetOptions,
    presetHeader: props.toolPresetHeader,
    shapeFillPalette: props.shapeFillPalette,
    shapeStrokePalette: props.shapeStrokePalette,
    shapeTool,
  };
}

export function createArrowControlsProps(props: EditorInspectorToolsPanelProps) {
  return {
    ...selectSharedToolProps(props),
    applyArrowPatch: props.applyArrowPatch,
    arrowVariantOptions: props.arrowVariantOptions,
    arrowTypeOptions: props.arrowTypeOptions,
    arrowModeOptions: props.arrowModeOptions,
    arrowHeadOptions: props.arrowHeadOptions,
    lineStyleOptions: props.lineStyleOptions,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    previewArrowPatch: props.previewArrowPatch,
    toolPresetHeader: props.toolPresetHeader,
    shapeStrokePalette: props.shapeStrokePalette,
  };
}

export function createLineControlsProps(props: EditorInspectorToolsPanelProps) {
  const noopLinePatch = () => undefined;
  return {
    ...selectSharedToolProps(props),
    applyLinePatch: props.applyLinePatch ?? noopLinePatch,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    lineCornerOptions: props.lineCornerOptions,
    lineFillModeOptions: props.lineFillModeOptions,
    lineRoughFillStyleOptions: props.lineRoughFillStyleOptions,
    lineStyleOptions: props.lineStyleOptions,
    previewLinePatch: props.previewLinePatch ?? noopLinePatch,
    shapeFillPalette: props.shapeFillPalette,
    shapeStrokePalette: props.shapeStrokePalette,
    toolPresetHeader: props.toolPresetHeader,
  };
}

export function createBlurControlsProps(props: EditorInspectorToolsPanelProps) {
  return {
    ...selectSharedToolProps(props),
    applyBlurPatch: props.applyBlurPatch,
    blurTypeOptions: props.blurTypeOptions,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    lineStyleOptions: props.lineStyleOptions,
    previewBlurPatch: props.previewBlurPatch,
    shapeStrokePalette: props.shapeStrokePalette,
    toolPresetHeader: props.toolPresetHeader,
  };
}

export function createTextControlsProps(props: EditorInspectorToolsPanelProps) {
  return {
    ...selectSharedToolProps(props),
    applyTextPatch: props.applyTextPatch,
    applyTextStyle: props.applyTextStyle,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    textCalloutFormatOptions: props.textCalloutFormatOptions,
    fontOptions: props.fontOptions,
    textAlignOptions: props.textAlignOptions ?? [],
    textLayoutModeOptions: props.textLayoutModeOptions ?? [],
    textVerticalAlignOptions: props.textVerticalAlignOptions ?? [],
    previewTextPatch: props.previewTextPatch,
    toolPresetHeader: props.toolPresetHeader,
    textBackgroundPalette: props.textBackgroundPalette,
    textColorPalette: props.textColorPalette,
  };
}

export function createStepControlsProps(props: EditorInspectorToolsPanelProps) {
  return {
    ...selectSharedToolProps(props),
    applyStepPatch: props.applyStepPatch,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    previewStepPatch: props.previewStepPatch,
    shapeStrokePalette: props.shapeStrokePalette,
    stepTypeOptions: props.stepTypeOptions,
    stepAlphabetOptions: props.stepAlphabetOptions,
    textColorPalette: props.textColorPalette,
    toolPresetHeader: props.toolPresetHeader,
  };
}
