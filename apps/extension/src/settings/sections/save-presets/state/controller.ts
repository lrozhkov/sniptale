import { buildSavePresetsViewModel, createSavePresetsActions } from '../actions';
import type { SavePreset } from '../../../../contracts/settings';
import {
  createDefaultPresetHandlers,
  createSavePresetsMutators,
  createSavePresetsState,
  shouldConfirmDelete,
} from '.';
import { useSavePresetDialogs } from '../actions/dialogs';
import { useSavePresetDragState } from './drag';
import { useSavePresetsSync } from '../actions/sync';

function resolveSavePresetsDialogState(dialogState: ReturnType<typeof useSavePresetDialogs>) {
  return dialogState.editingPreset === undefined
    ? {
        closeDeleteDialog: dialogState.closeDeleteDialog,
        closeEditor: dialogState.closeEditor,
        confirmDelete: dialogState.confirmDelete,
        isEditorOpen: dialogState.isEditorOpen,
        openEditor: dialogState.openEditor,
        setConfirmDelete: dialogState.setConfirmDelete,
        setEditingPreset: dialogState.setEditingPreset,
        setIsEditorOpen: dialogState.setIsEditorOpen,
      }
    : {
        closeDeleteDialog: dialogState.closeDeleteDialog,
        closeEditor: dialogState.closeEditor,
        confirmDelete: dialogState.confirmDelete,
        editingPreset: dialogState.editingPreset,
        isEditorOpen: dialogState.isEditorOpen,
        openEditor: dialogState.openEditor,
        setConfirmDelete: dialogState.setConfirmDelete,
        setEditingPreset: dialogState.setEditingPreset,
        setIsEditorOpen: dialogState.setIsEditorOpen,
      };
}

export function useSavePresetsSection() {
  const sync = useSavePresetsSync();
  const dragState = useSavePresetDragState();
  const dialogState = useSavePresetDialogs();
  const resolvedDialogState = resolveSavePresetsDialogState(dialogState);
  const actions = createSavePresetsActions(sync, resolvedDialogState, dragState);
  const viewModel = buildSavePresetsViewModel(sync);
  const defaultPresetHandlers = createDefaultPresetHandlers(sync, actions);
  const savePresetsState = createSavePresetsState(sync, dragState, resolvedDialogState, viewModel);
  const savePresetsMutators = createSavePresetsMutators(dragState, resolvedDialogState);

  const handleDeletePreset = (preset: SavePreset) => {
    actions.handleDeletePreset(preset);

    if (shouldConfirmDelete(preset, sync)) {
      dialogState.setConfirmDelete(preset);
    }
  };

  return {
    ...savePresetsState,
    ...savePresetsMutators,
    confirmDeletePreset: actions.confirmDeletePreset,
    handleCaptureActionChange: actions.handleCaptureActionChange,
    ...defaultPresetHandlers,
    handleDeletePreset,
    handleDrop: actions.handleDrop,
    handleSavePreset: actions.handleSavePreset,
    handleTogglePresetEnabled: actions.handleTogglePresetEnabled,
    handleToggleSaveToGallery: actions.handleToggleSaveToGallery,
  };
}
