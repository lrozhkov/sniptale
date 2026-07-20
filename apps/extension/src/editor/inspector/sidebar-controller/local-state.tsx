import type React from 'react';
import { useState } from 'react';
import type {
  EditorFrameSettings,
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';
import { useEditorInspectorLayerEffectsState } from './layer-effects-state';
import { useInspectorConfirmDialogState } from './confirm-dialog';
import { useInspectorSidebarDraftState } from './drafts';
import { useInspectorSidebarRefs } from './refs';
import { useInspectorSidebarSaveOptionsState } from './save-options';
import { useInspectorWorkspaceColorState } from './workspace-color-state';

function useWorkspaceColorState(args: {
  workspaceBackgroundColor: string;
  workspaceDefaultColor: string;
}) {
  return useInspectorWorkspaceColorState({
    currentColor: args.workspaceBackgroundColor,
    defaultColor: args.workspaceDefaultColor,
  });
}

function createSidebarLocalStateResult(args: {
  confirmDialog: ReturnType<typeof useInspectorConfirmDialogState>;
  dragOverLayerId: string | null;
  draggedLayerId: string | null;
  drafts: ReturnType<typeof useInspectorSidebarDraftState>;
  layerEffectsState: ReturnType<typeof useEditorInspectorLayerEffectsState>;
  layersExpanded: boolean;
  refs: ReturnType<typeof useInspectorSidebarRefs>;
  saveOptions: ReturnType<typeof useInspectorSidebarSaveOptionsState>;
  savePresetPickerOpen: boolean;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setLayersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setSavePresetPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceColor: ReturnType<typeof useInspectorWorkspaceColorState>;
}) {
  return {
    confirmDialog: args.confirmDialog.confirmDialog,
    dragOverLayerId: args.dragOverLayerId,
    draggedLayerId: args.draggedLayerId,
    layersExpanded: args.layersExpanded,
    onConfirmDialogCancel: args.confirmDialog.handleConfirmDialogCancel,
    onConfirmDialogConfirm: args.confirmDialog.handleConfirmDialogConfirm,
    savePresetPickerOpen: args.savePresetPickerOpen,
    requestConfirm: args.confirmDialog.requestConfirm,
    setDragOverLayerId: args.setDragOverLayerId,
    setDraggedLayerId: args.setDraggedLayerId,
    setLayerEffectsState: args.layerEffectsState.setLayerEffectsState,
    setLayersExpanded: args.setLayersExpanded,
    setSavePresetPickerOpen: args.setSavePresetPickerOpen,
    layerEffectsState: args.layerEffectsState.layerEffectsState,
    openLayerEffects: args.layerEffectsState.openLayerEffects,
    workspaceColor: args.workspaceColor,
    ...args.drafts,
    ...args.refs,
    ...args.saveOptions,
  };
}

function useSidebarLayerEffectsState(args: {
  inspector: string;
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
  setInspector: (inspector: 'tool') => void;
  syncActiveTool: (tool: 'select') => void;
}) {
  return useEditorInspectorLayerEffectsState(args);
}

export function useEditorInspectorSidebarLocalState(args: {
  frame: EditorFrameSettings;
  inspector: string;
  sceneBackgroundPresets: EditorPresetStorageState['sceneBackground'];
  sourceWidth: number;
  sourceHeight: number;
  sourceName: string | null;
  canvasWidth: number;
  canvasHeight: number;
  cropSelection?: { width: number; height: number } | null;
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
  isResizableLayerSelection: boolean;
  setInspector: (inspector: 'tool') => void;
  syncActiveTool: (tool: 'select') => void;
  workspaceBackgroundColor: string;
  workspaceDefaultColor: string;
}) {
  const refs = useInspectorSidebarRefs();
  const [savePresetPickerOpen, setSavePresetPickerOpen] = useState(false);
  const [layersExpanded, setLayersExpanded] = useState(true);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const workspaceColor = useWorkspaceColorState(args);
  const layerEffectsState = useSidebarLayerEffectsState(args);
  const drafts = useInspectorSidebarDraftState(args);
  const saveOptions = useInspectorSidebarSaveOptionsState();
  const confirmDialog = useInspectorConfirmDialogState();

  return createSidebarLocalStateResult({
    confirmDialog,
    dragOverLayerId,
    draggedLayerId,
    drafts,
    layerEffectsState,
    layersExpanded,
    refs,
    saveOptions,
    savePresetPickerOpen,
    setDragOverLayerId,
    setDraggedLayerId,
    setLayersExpanded,
    setSavePresetPickerOpen,
    workspaceColor,
  });
}
