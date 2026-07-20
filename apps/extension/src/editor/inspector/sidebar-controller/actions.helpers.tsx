import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { EditorObjectType, EditorTool } from '../../../features/editor/document/types';
import type { EditorShapeSettingsOwner } from '../../../features/editor/document/shape-settings';
import { buildSidebarBackgroundActions } from './background';
import { buildSidebarColorActions } from './colors';
import { buildSidebarSaveActions } from './save';
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
import type {
  ResolvedToolSettingTargets,
  SidebarToolSettingTargetArgs,
  SidebarUtilityActionArgs,
} from './types';
import type { SelectionSettingsOwner } from './selection-owner';

function resolveToolSettingsOwner(tool: EditorTool): SelectionSettingsOwner | null {
  switch (tool) {
    case 'pencil':
      return 'brush-pencil';
    case 'highlighter':
      return 'brush-highlighter';
    case 'rectangle':
    case 'diamond':
      return 'shape-rectangle';
    case 'ellipse':
      return 'shape-ellipse';
    case 'blur':
      return 'blur';
    case 'arrow':
      return 'arrow';
    case 'line':
      return 'line';
    case 'text':
      return 'text';
    case 'step':
      return 'step';
    case 'callout':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'brush':
    case 'selection':
    case 'eraser':
    case 'fill':
    case 'select':
    case 'shape-library':
    case 'image':
    case 'crop':
      return null;
  }
}

function resolveSelectionSettingsOwner(
  type: EditorObjectType | null
): SelectionSettingsOwner | null {
  switch (type) {
    case null:
      return null;
    case 'pencil':
      return 'brush-pencil';
    case 'highlighter':
      return 'brush-highlighter';
    case 'rectangle':
    case 'diamond':
    case 'rich-shape':
      return 'shape-rectangle';
    case 'ellipse':
      return 'shape-ellipse';
    case 'blur':
      return 'blur';
    case 'arrow':
      return 'arrow';
    case 'line':
      return 'line';
    case 'text':
    case 'meta-stamp':
      return 'text';
    case 'step':
      return 'step';
    case 'source-image':
    case 'image':
    case 'background':
      return 'image';
    case 'transparent-base':
    case 'browser-frame':
      return null;
  }
}

export function shouldShowSelectionToolSettings(args: {
  activeTool: EditorTool;
  selection: Pick<
    SidebarToolSettingTargetArgs['selection'],
    'hasSelection' | 'selectedObjectLocked' | 'selectedObjectType'
  >;
}): boolean {
  if (!args.selection.hasSelection || args.selection.selectedObjectLocked) {
    return false;
  }

  const selectionOwner = resolveSelectionSettingsOwner(args.selection.selectedObjectType);
  if (selectionOwner === null) {
    return false;
  }

  if (args.activeTool === 'select') {
    return true;
  }

  return selectionOwner === resolveToolSettingsOwner(args.activeTool);
}

export function buildBorderPresetOptions(borderPresets: BorderPreset[]) {
  return borderPresets
    .filter((preset) => preset.enabled !== false)
    .map((preset) => ({
      label: preset.name,
      value: preset.id,
    }));
}

export function shouldUseSelectionToolSettings(
  args: Pick<SidebarToolSettingTargetArgs, 'activeTool' | 'selection'>
): boolean {
  return shouldShowSelectionToolSettings(args);
}

export function createSelectionSettingsApplier(
  args: Pick<SidebarToolSettingTargetArgs, 'activeTool' | 'selection'> & {
    applyActiveSettingsToSelection: () => void;
  }
): (() => void) | null {
  if (!shouldUseSelectionToolSettings(args)) {
    return null;
  }

  return () => {
    args.applyActiveSettingsToSelection();
  };
}

export function resolveToolSettingTargets(
  args: SidebarToolSettingTargetArgs
): ResolvedToolSettingTargets {
  const useSelectionTargets = shouldUseSelectionToolSettings(args);
  const resolveShapeOwner = (): EditorShapeSettingsOwner | null => {
    const owner = useSelectionTargets
      ? resolveSelectionSettingsOwner(args.selection.selectedObjectType)
      : resolveToolSettingsOwner(args.activeTool);

    if (owner === 'shape-ellipse') {
      return 'ellipse';
    }

    return owner === 'shape-rectangle' ? 'rectangle' : null;
  };

  return {
    arrow: useSelectionTargets ? args.updateSelectionArrowSettings : args.updateArrowSettings,
    line: useSelectionTargets ? args.updateSelectionLineSettings : args.updateLineSettings,
    blur: useSelectionTargets ? args.updateSelectionBlurSettings : args.updateBlurSettings,
    brush: useSelectionTargets ? args.updateSelectionBrushSettings : args.updateBrushSettings,
    shape: (patch) => {
      const owner = resolveShapeOwner();
      if (!owner) {
        return;
      }

      (useSelectionTargets ? args.updateSelectionShapeSettings : args.updateShapeSettings)(
        owner,
        patch
      );
    },
    step: useSelectionTargets ? args.updateSelectionStepSettings : args.updateStepSettings,
    text: useSelectionTargets ? args.updateSelectionTextSettings : args.updateTextSettings,
    image:
      (useSelectionTargets ? args.updateSelectionImageSettings : args.updateImageSettings) ??
      (() => undefined),
  };
}

export function createStaticSidebarOptions() {
  return {
    ...getStaticArrowAndBrowserOptions(),
    ...getStaticFrameOptions(),
    ...getStaticWorkspaceOptions(),
    ...getStaticNumericOptions(),
  };
}

function getStaticArrowAndBrowserOptions() {
  return {
    arrowVariantOptions: getArrowVariantOptions(),
    arrowHeadOptions: getArrowHeadOptions(),
    arrowModeOptions: getArrowModeOptions(),
    arrowTypeOptions: getArrowTypeOptions(),
    lineStyleOptions: getLineStyleOptions(),
    lineCornerOptions: getLineCornerOptions(),
    lineFillModeOptions: getLineFillModeOptions(),
    lineRoughFillStyleOptions: getLineRoughFillStyleOptions(),
    blurTypeOptions: getBlurTypeOptions(),
    browserCanvasModeOptions: getBrowserCanvasModeOptions(),
    browserContentModeOptions: getBrowserContentModeOptions(),
  };
}

function getStaticFrameOptions() {
  return {
    fontOptions: getFontOptions(),
    frameBackgroundImageFitOptions: getFrameBackgroundImageFitOptions(),
    frameBackgroundModeOptions: getFrameBackgroundModeOptions(),
    frameGradientPresets: getFrameGradientPresets(),
    frameLayoutModeOptions: getFrameLayoutModeOptions(),
  };
}

function getStaticWorkspaceOptions() {
  return {
    gridColorPalette: GRID_COLOR_PALETTE,
    gridPalette: GRID_COLOR_PALETTE,
    stepAlphabetOptions: getStepAlphabetOptions(),
    stepTypeOptions: getStepTypeOptions(),
    textAlignOptions: getTextAlignOptions(),
    textCalloutFormatOptions: getTextCalloutFormatOptions(),
    textLayoutModeOptions: getTextLayoutModeOptions(),
    textVerticalAlignOptions: getTextVerticalAlignOptions(),
    workspaceBackgroundPalette: WORKSPACE_BACKGROUND_PALETTE,
  };
}

function getStaticNumericOptions() {
  return {
    clampGridSize,
    gridSizeMax: GRID_SIZE_MAX,
    gridSizeMin: GRID_SIZE_MIN,
  };
}

export function buildSidebarUtilityActions(args: SidebarUtilityActionArgs) {
  return {
    ...buildSidebarBackgroundActions(args),
    ...buildSidebarColorActions({
      rememberRecentColor: args.rememberRecentColor,
      withHistoryMuted: (callback) => {
        args.controller.withHistoryMuted(callback);
      },
    }),
    ...buildSidebarSaveActions(args),
    compactCommandGroups: [],
    setUniformPadding: (value: number) => {
      const padding = Math.max(0, Math.round(value));
      args.setFrameDraft((state) => ({
        ...state,
        paddingBottom: padding,
        paddingLeft: padding,
        paddingRight: padding,
        paddingTop: padding,
      }));
    },
    toNumber,
    updateLockedDraft,
  };
}
