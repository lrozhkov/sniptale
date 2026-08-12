import type { SavePreset } from '../../../../../contracts/settings';
import type { buildSavePresetsViewModel } from './view-model';
import type { SavePresetsActions, SavePresetsDialogsState, SavePresetsSyncState } from './types';

export function shouldConfirmDelete(preset: SavePreset, sync: SavePresetsSyncState): boolean {
  return (
    sync.defaultImagePresetId !== preset.id &&
    sync.defaultVideoPresetId !== preset.id &&
    sync.defaultExportPresetId !== preset.id
  );
}

function createDefaultPresetChangeHandler(
  field: 'defaultExportPresetId' | 'defaultImagePresetId' | 'defaultVideoPresetId',
  getValue: () => string | null,
  setValue: (value: string | null) => void,
  actions: SavePresetsActions
) {
  return (value: string) => actions.handleDefaultPresetChange(field, value, setValue, getValue());
}

export function createDefaultPresetHandlers(
  sync: SavePresetsSyncState,
  actions: SavePresetsActions
) {
  return {
    handleDefaultExportChange: createDefaultPresetChangeHandler(
      'defaultExportPresetId',
      () => sync.defaultExportPresetId,
      sync.setDefaultExportPresetId,
      actions
    ),
    handleDefaultImageChange: createDefaultPresetChangeHandler(
      'defaultImagePresetId',
      () => sync.defaultImagePresetId,
      sync.setDefaultImagePresetId,
      actions
    ),
    handleDefaultVideoChange: createDefaultPresetChangeHandler(
      'defaultVideoPresetId',
      () => sync.defaultVideoPresetId,
      sync.setDefaultVideoPresetId,
      actions
    ),
  };
}

export function createSavePresetsState(
  sync: SavePresetsSyncState,
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
    editingPreset: dialogState.editingPreset,
    isEditorOpen: dialogState.isEditorOpen,
    isLoading: sync.isLoading,
    presetOptions: viewModel.presetOptions,
    presets: sync.presets,
  };
}

export function createSavePresetsMutators(dialogState: SavePresetsDialogsState) {
  return {
    closeDeleteDialog: dialogState.closeDeleteDialog,
    closeEditor: dialogState.closeEditor,
    openEditor: dialogState.openEditor,
    setEditingPreset: dialogState.setEditingPreset,
  };
}
