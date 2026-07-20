import type { SavePreset } from '../../../../contracts/settings';
import type { buildSavePresetsViewModel } from './view-model';
import type {
  SavePresetsActions,
  SavePresetsDialogsState,
  SavePresetsDragUiState,
  SavePresetsSyncState,
} from './types';

export function shouldConfirmDelete(preset: SavePreset, sync: SavePresetsSyncState): boolean {
  return (
    sync.defaultImagePresetId !== preset.id &&
    sync.defaultVideoPresetId !== preset.id &&
    sync.defaultExportPresetId !== preset.id
  );
}

function createDefaultPresetChangeHandler(
  field: 'defaultExportPresetId' | 'defaultImagePresetId' | 'defaultVideoPresetId',
  messageKey:
    | 'savePresets.messages.defaultExportUpdated'
    | 'savePresets.messages.defaultImageUpdated'
    | 'savePresets.messages.defaultVideoUpdated',
  getValue: () => string | null,
  setValue: (value: string | null) => void,
  actions: SavePresetsActions
) {
  return (value: string) =>
    actions.handleDefaultPresetChange(field, value, setValue, getValue(), messageKey);
}

export function createDefaultPresetHandlers(
  sync: SavePresetsSyncState,
  actions: SavePresetsActions
) {
  return {
    handleDefaultExportChange: createDefaultPresetChangeHandler(
      'defaultExportPresetId',
      'savePresets.messages.defaultExportUpdated',
      () => sync.defaultExportPresetId,
      sync.setDefaultExportPresetId,
      actions
    ),
    handleDefaultImageChange: createDefaultPresetChangeHandler(
      'defaultImagePresetId',
      'savePresets.messages.defaultImageUpdated',
      () => sync.defaultImagePresetId,
      sync.setDefaultImagePresetId,
      actions
    ),
    handleDefaultVideoChange: createDefaultPresetChangeHandler(
      'defaultVideoPresetId',
      'savePresets.messages.defaultVideoUpdated',
      () => sync.defaultVideoPresetId,
      sync.setDefaultVideoPresetId,
      actions
    ),
  };
}

export function createSavePresetsState(
  sync: SavePresetsSyncState,
  dragState: SavePresetsDragUiState,
  dialogState: SavePresetsDialogsState,
  viewModel: ReturnType<typeof buildSavePresetsViewModel>
) {
  return {
    captureAction: sync.captureAction,
    captureActionOptions: viewModel.captureActionOptions,
    confirmDelete: dialogState.confirmDelete,
    defaultExportPresetId: sync.defaultExportPresetId,
    defaultImagePresetId: sync.defaultImagePresetId,
    defaultVideoPresetId: sync.defaultVideoPresetId,
    draggedId: dragState.draggedId,
    dragOverId: dragState.dragOverId,
    editingPreset: dialogState.editingPreset,
    hoveredPresetId: dragState.hoveredPresetId,
    isEditorOpen: dialogState.isEditorOpen,
    isLoading: sync.isLoading,
    presetCountLabel: viewModel.presetCountLabel,
    presetOptions: viewModel.presetOptions,
    presets: sync.presets,
    saveCapturesToGallery: sync.saveCapturesToGallery,
  };
}

export function createSavePresetsMutators(
  dragState: SavePresetsDragUiState,
  dialogState: SavePresetsDialogsState
) {
  return {
    closeDeleteDialog: dialogState.closeDeleteDialog,
    closeEditor: dialogState.closeEditor,
    openEditor: dialogState.openEditor,
    setDraggedId: dragState.setDraggedId,
    setDragOverId: dragState.setDragOverId,
    setEditingPreset: dialogState.setEditingPreset,
    setHoveredPresetId: dragState.setHoveredPresetId,
  };
}
