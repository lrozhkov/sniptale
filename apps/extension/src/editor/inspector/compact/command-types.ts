import type React from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { SavePreset } from '../../../contracts/settings';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorLayerItem,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';
import type {
  EditorInspectorDocumentActions,
  EditorInspectorFrameMutationActions,
  EditorInspectorNumberParser,
  EditorInspectorPaletteState,
  EditorInspectorRecentColorState,
  EditorInspectorSizeDraft,
} from '../types';
import type { EditorInspectorToolChoiceOptions, EditorInspectorToolPatchActions } from '../types';
import type { EditorInspectorLayerEffectsState } from '../layer-effects/shared';
import type { EditorInspectorLayerEffectActions } from '../layer-effects/types';
import type { EditorInspectorPresetHeaderState } from '../presets';
import type {
  EditorInspectorConfigurableToolPanelProps,
  EditorInspectorSelectionAndLayerPanelProps,
} from '../panel-types';
import type { CompactSelectOption } from '../../chrome/ui';
import type { BackgroundGradientPreset } from '../sidebar-shared';

interface EditorInspectorCompactCommonParams {
  hasImage: boolean;
  showDocumentActions: boolean;
  defaultImagePresetId: string | null;
  inspector: string;
}

type EditorInspectorCompactSelectionParams = Pick<
  EditorInspectorSelectionAndLayerPanelProps,
  | 'selection'
  | 'highlightedTool'
  | 'inspectorToolSettings'
  | 'richShapeSelection'
  | 'canDeleteSelection'
  | 'cropReady'
  | 'isResizableLayerSelection'
> & {
  toolPresetHeader: EditorInspectorPresetHeaderState | null;
};

interface EditorInspectorCompactSizeStateParams extends Pick<
  EditorInspectorSelectionAndLayerPanelProps,
  'layerAspectRatio' | 'layerSizeDraft' | 'layerSizeLocked' | 'layerSizeText'
> {
  imageSizeText: string;
  canvasSizeText: string;
  imageSizeDraft: EditorInspectorSizeDraft;
  canvasSizeDraft: EditorInspectorSizeDraft;
  imageSizeLocked: boolean;
  canvasSizeLocked: boolean;
  imageAspectRatio: number | null;
  canvasAspectRatio: number | null;
}

interface EditorInspectorCompactFrameStateParams {
  frameDraft: EditorFrameSettings;
  framePaddingSummary: string;
  layoutModeLabel: string;
  backgroundModeLabel: string;
  backgroundSummary: string;
  backgroundPreviewStyle: React.CSSProperties;
  browserFrame: BrowserFrameState;
  workspace: EditorWorkspaceSettings;
  workspaceColorError: string | null;
  workspaceColorMatchesDefault: boolean;
  workspaceDefaultSavePending: boolean;
}

interface EditorInspectorCompactLayerEffectsParams {
  layers: EditorLayerItem[];
  layerEffectsState: EditorInspectorLayerEffectsState;
}

interface EditorInspectorCompactStyleOptionParams
  extends
    EditorInspectorToolChoiceOptions,
    EditorInspectorRecentColorState,
    Pick<
      EditorInspectorPaletteState,
      'shapeFillPalette' | 'shapeStrokePalette' | 'textColorPalette'
    > {
  borderPresets: BorderPreset[];
}

interface EditorInspectorCompactFrameOptionParams {
  browserCanvasModeOptions: CompactSelectOption<'resize' | 'keep-size'>[];
  browserContentModeOptions: CompactSelectOption<'push-down' | 'fit-content'>[];
  frameLayoutModeOptions: CompactSelectOption<EditorFrameSettings['layoutMode']>[];
  frameBackgroundModeOptions: CompactSelectOption<EditorFrameSettings['backgroundMode']>[];
  frameBackgroundImageFitOptions: CompactSelectOption<EditorFrameSettings['backgroundImageFit']>[];
  frameGradientPresets: BackgroundGradientPreset[];
  frameBackgroundPalette: readonly string[];
  workspaceBackgroundPalette: readonly string[];
  gridColorPalette: readonly string[];
  gridSizeMin: number;
  gridSizeMax: number;
  savePresets: SavePreset[];
  DimensionInput: React.ComponentType<{
    label: string;
    value: number;
    min?: number;
    onChange: (value: number) => void;
  }>;
}

interface EditorInspectorCompactUtilityActions
  extends
    Pick<EditorInspectorConfigurableToolPanelProps, 'previewColor' | 'updateColor'>,
    EditorInspectorNumberParser {
  renderSavePresetOptions: () => React.ReactNode;
  clampGridSize: (value: number) => number;
  updateLockedDraft: (
    current: EditorInspectorSizeDraft,
    field: 'width' | 'height',
    nextValue: number,
    keepAspect: boolean,
    aspectRatio: number | null
  ) => EditorInspectorSizeDraft;
}

type EditorInspectorCompactToolActions = EditorInspectorToolPatchActions;

interface EditorInspectorCompactLocalActions
  extends
    Pick<EditorInspectorSelectionAndLayerPanelProps, 'setLayerSizeDraft' | 'setLayerSizeLocked'>,
    EditorInspectorFrameMutationActions {
  setImageSizeDraft: React.Dispatch<React.SetStateAction<EditorInspectorSizeDraft>>;
  setCanvasSizeDraft: React.Dispatch<React.SetStateAction<EditorInspectorSizeDraft>>;
  setImageSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setCanvasSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setLayerEffectsState: React.Dispatch<React.SetStateAction<EditorInspectorLayerEffectsState>>;
}

interface EditorInspectorCompactDocumentActions
  extends EditorInspectorDocumentActions, EditorInspectorLayerEffectActions {
  onResizeImage: (width: number, height: number) => Promise<void> | void;
  onResizeCanvas: (width: number, height: number) => Promise<void> | void;
  onResizeLayer: (layerId: string, width: number, height: number) => Promise<void> | void;
}

export interface BuildEditorInspectorCompactCommandGroupsParams {
  common: EditorInspectorCompactCommonParams;
  selection: EditorInspectorCompactSelectionParams;
  sizes: EditorInspectorCompactSizeStateParams;
  frame: EditorInspectorCompactFrameStateParams;
  layerEffects: EditorInspectorCompactLayerEffectsParams;
  styleOptions: EditorInspectorCompactStyleOptionParams;
  frameOptions: EditorInspectorCompactFrameOptionParams;
  utilityActions: EditorInspectorCompactUtilityActions;
  editorActions: EditorInspectorCompactToolActions & EditorInspectorCompactLocalActions;
  document: EditorInspectorCompactDocumentActions;
}

export type EditorInspectorCompactCommandContext = EditorInspectorCompactCommonParams &
  EditorInspectorCompactSelectionParams &
  EditorInspectorCompactSizeStateParams &
  EditorInspectorCompactFrameStateParams &
  EditorInspectorCompactLayerEffectsParams &
  EditorInspectorCompactStyleOptionParams &
  EditorInspectorCompactFrameOptionParams &
  EditorInspectorCompactUtilityActions &
  EditorInspectorCompactToolActions &
  EditorInspectorCompactLocalActions &
  EditorInspectorCompactDocumentActions;
