import type React from 'react';

import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorLayerItem,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';
import type { SavePreset } from '../../../contracts/settings';
import type { EditorRenderedImageOptions } from '../../document/model/render-options';
import type { EditorInspector } from '../../state/types';
import type {
  EditorInspectorDocumentActions,
  EditorInspectorFrameMutationActions,
  EditorInspectorPaletteState,
  EditorInspectorPresetHeaderBag,
  EditorInspectorRecentColorState,
  EditorInspectorShapePresetActions,
  EditorInspectorSizeDraft,
} from '../types';
import type { EditorInspectorLayerEffectsState } from '../layer-effects/shared';
import type {
  EditorInspectorLayerEffectActions,
  EditorInspectorLayerEffectSizeControls,
} from '../layer-effects/types';
import type { EditorInspectorInteractiveToolPanelProps } from '../panel-types';
import type { CompactSelectOption } from '../../chrome/ui';

export interface EditorInspectorConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

export interface EditorInspectorContentProps
  extends
    EditorInspectorInteractiveToolPanelProps,
    EditorInspectorShapePresetActions,
    EditorInspectorFrameMutationActions,
    EditorInspectorPaletteState,
    EditorInspectorPresetHeaderBag,
    EditorInspectorRecentColorState,
    EditorInspectorDocumentActions,
    EditorInspectorLayerEffectActions,
    Omit<EditorInspectorLayerEffectSizeControls, 'updateLockedDraft'> {
  hasImage: boolean;
  inspector: EditorInspector;
  showDocumentActions: boolean;
  showViewportMetrics: boolean;
  imageSizeText: string;
  canvasSizeText: string;
  canvasSize: EditorInspectorSizeDraft;
  cropSelection: { width: number; height: number } | null;
  imageSizeDraft: EditorInspectorSizeDraft;
  canvasSizeDraft: EditorInspectorSizeDraft;
  imageSizeLocked: boolean;
  canvasSizeLocked: boolean;
  imageAspectRatio: number | null;
  canvasAspectRatio: number | null;
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
  borderPresetOptions: CompactSelectOption<string>[];
  savePresets: SavePreset[];
  defaultImagePresetId: string | null;
  layers: EditorLayerItem[];
  confirmDialog: EditorInspectorConfirmDialogState | null;
  savePresetPickerOpen: boolean;
  setSavePresetPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setImageSizeDraft: React.Dispatch<React.SetStateAction<EditorInspectorSizeDraft>>;
  setCanvasSizeDraft: React.Dispatch<React.SetStateAction<EditorInspectorSizeDraft>>;
  setImageSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setCanvasSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  saveToPreset: (presetId: string, options?: EditorRenderedImageOptions) => Promise<void>;
  onConfirmDialogConfirm: () => void;
  onConfirmDialogCancel: () => void;
  setInspector: (inspector: EditorInspector) => void;
  layerEffectsState: EditorInspectorLayerEffectsState;
  setLayerEffectsState: React.Dispatch<React.SetStateAction<EditorInspectorLayerEffectsState>>;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
}

export type EditorInspectorContentController = EditorInspectorContentProps & {
  backgroundImageInputRef: React.RefObject<HTMLInputElement | null>;
  importSessionInputRef: React.RefObject<HTMLInputElement | null>;
  openImageInputRef: React.RefObject<HTMLInputElement | null>;
  handleCloseDocument: () => void;
  layersExpanded: boolean;
  draggedLayerId: string | null;
  dragOverLayerId: string | null;
  setLayersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  requestConfirm: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
};
