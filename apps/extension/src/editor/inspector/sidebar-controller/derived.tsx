import type React from 'react';

import type {
  EditorFrameSettings,
  EditorSelectionState,
  EditorTool,
} from '../../../features/editor/document/types';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import {
  createEditorFrameGradientCss,
  normalizeEditorFrameGradientStops,
} from '../../../features/editor/document/frame-gradient';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets';
import { getEditorToolbarDerivedState } from '../toolbar-derived-state';
import { getAspectRatio, getFramePaddingSummary } from '../sidebar-shared';
import { shouldShowSelectionToolSettings } from './actions.helpers';

const BACKGROUND_IMAGE_PREVIEW_STYLE = {
  contain: {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'contain',
  },
  cover: { backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: 'cover' },
  'fit-height': {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'auto 100%',
  },
  'fit-width': {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% auto',
  },
  stretch: {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
  },
  tile: { backgroundPosition: '0 0', backgroundRepeat: 'repeat', backgroundSize: 'auto' },
} satisfies Record<EditorFrameSettings['backgroundImageFit'], React.CSSProperties>;

function buildBackgroundPreviewStyle(frameDraft: EditorFrameSettings) {
  if (frameDraft.backgroundMode === 'image' && frameDraft.backgroundImageData) {
    return {
      ...BACKGROUND_IMAGE_PREVIEW_STYLE[frameDraft.backgroundImageFit],
      backgroundImage: `url("${frameDraft.backgroundImageData}")`,
    };
  }

  if (frameDraft.backgroundMode === 'gradient') {
    return {
      backgroundImage: createEditorFrameGradientCss(frameDraft),
    };
  }

  return {
    backgroundColor:
      frameDraft.backgroundMode === 'image' ? 'transparent' : frameDraft.backgroundColor,
  };
}

function getLayerSizeText(selection: EditorSelectionState): string {
  if (!selection.hasSelection) {
    return '0 × 0';
  }

  return `${selection.selectedObjectWidth ?? 0} × ${selection.selectedObjectHeight ?? 0}`;
}

function getInspectorToolSettings(args: {
  activeTool: EditorTool;
  selection: EditorSelectionState;
  selectionToolSettings: EditorToolSettings;
  toolSettings: EditorToolSettings;
}) {
  return shouldShowSelectionToolSettings(args) ? args.selectionToolSettings : args.toolSettings;
}

function buildDerivedMeasurements(args: {
  canvasHeight: number;
  canvasWidth: number;
  selection: EditorSelectionState;
  sourceHeight: number;
  sourceWidth: number;
}) {
  return {
    canvasAspectRatio: getAspectRatio(args.canvasWidth, args.canvasHeight),
    canvasSize: { width: args.canvasWidth, height: args.canvasHeight },
    canvasSizeText: `${args.canvasWidth} × ${args.canvasHeight}`,
    imageAspectRatio: getAspectRatio(args.sourceWidth, args.sourceHeight),
    imageSizeText: `${args.sourceWidth} × ${args.sourceHeight}`,
    layerAspectRatio: getAspectRatio(
      args.selection.selectedObjectWidth ?? 0,
      args.selection.selectedObjectHeight ?? 0
    ),
    layerSizeText: getLayerSizeText(args.selection),
  };
}

function buildFramePresentation(frameDraft: EditorFrameSettings) {
  return {
    backgroundModeLabel: frameDraft.backgroundMode,
    backgroundPreviewStyle: buildBackgroundPreviewStyle(frameDraft),
    backgroundSummary:
      frameDraft.backgroundMode === 'gradient'
        ? normalizeEditorFrameGradientStops(frameDraft).join(' → ')
        : frameDraft.backgroundMode === 'image'
          ? 'image'
          : frameDraft.backgroundColor,
    framePaddingSummary: getFramePaddingSummary(frameDraft),
    layoutModeLabel: frameDraft.layoutMode,
  };
}

export function useEditorInspectorSidebarDerived(args: {
  hasImage: boolean;
  activeTool: EditorTool;
  inspector: string;
  editorPresetState?: EditorPresetStorageState;
  selection: EditorSelectionState;
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  toolSettings: EditorToolSettings;
  selectionToolSettings: EditorToolSettings;
  frameDraft: EditorFrameSettings;
}) {
  const editorPresetState = args.editorPresetState ?? createDefaultEditorPresetStorageState();
  const toolbarState = getEditorToolbarDerivedState({
    activeTool: args.activeTool,
    inspector: args.inspector as Parameters<typeof getEditorToolbarDerivedState>[0]['inspector'],
    selection: args.selection,
  });
  const isResizableLayerSelection =
    args.selection.selectedObjectCount === 1 &&
    Boolean(args.selection.selectedObjectId) &&
    args.selection.selectedObjectType === 'image' &&
    !args.selection.selectedObjectLocked;
  const measurements = buildDerivedMeasurements(args);
  const framePresentation = buildFramePresentation(args.frameDraft);

  return {
    canDeleteSelection: args.selection.hasSelection,
    frameBackgroundPalette: editorPresetState.palette.sceneBackground,
    highlightedTool: toolbarState.highlightedTool,
    inspectorToolSettings: getInspectorToolSettings(args),
    isResizableLayerSelection,
    shapeFillPalette: editorPresetState.palette.shapeFill,
    shapeStrokePalette: editorPresetState.palette.shapeStroke,
    showDocumentActions: !args.hasImage || args.inspector === 'file',
    showViewportMetrics: args.hasImage && args.inspector !== 'file',
    textBackgroundPalette: editorPresetState.palette.textBackground,
    textColorPalette: editorPresetState.palette.textColor,
    ...framePresentation,
    ...measurements,
  };
}
