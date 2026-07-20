import type React from 'react';
import type { EditorSelectionState, EditorTool } from '../../features/editor/document/types';
import type { EditorToolSettings } from '../../features/editor/document/tool-settings-types';
import type {
  EditorInspectorColorActions,
  EditorInspectorRichShapeState,
  EditorInspectorSizeDraft,
  EditorInspectorToolChoiceOptions,
  EditorInspectorToolPatchActions,
} from './types';

export interface EditorInspectorSelectionPanelState {
  selection: EditorSelectionState;
  highlightedTool: EditorTool;
  inspectorToolSettings: EditorToolSettings;
  canDeleteSelection: boolean;
  cropReady: boolean;
  isResizableLayerSelection: boolean;
}

export interface EditorInspectorLayerSizePanelState {
  layerSizeText: string;
  layerSizeDraft: EditorInspectorSizeDraft;
  layerSizeLocked: boolean;
  layerAspectRatio: number | null;
}

export interface EditorInspectorLayerSizePanelActions {
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<EditorInspectorSizeDraft>>;
  setLayerSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
}

export type EditorInspectorSelectionAndLayerPanelProps = EditorInspectorSelectionPanelState &
  EditorInspectorRichShapeState &
  EditorInspectorLayerSizePanelState &
  EditorInspectorLayerSizePanelActions;

export type EditorInspectorInteractiveToolPanelProps = EditorInspectorToolPatchActions &
  EditorInspectorColorActions &
  EditorInspectorSelectionAndLayerPanelProps;

export type EditorInspectorConfigurableToolPanelProps = EditorInspectorToolChoiceOptions &
  EditorInspectorInteractiveToolPanelProps;
