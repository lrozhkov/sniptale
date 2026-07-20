import {
  createCaptureActionChangeAction,
  createDefaultPresetChangeAction,
  createToggleSaveToGalleryAction,
} from './defaults';
import {
  createConfirmDeletePresetAction,
  createDeletePresetGuard,
  createDropPresetAction,
  createSavePresetAction,
  createTogglePresetEnabledAction,
} from './preset';
import type {
  SavePresetsDialogState,
  SavePresetsDragState,
  SavePresetsSyncState,
} from '../state/types';
import { buildSavePresetsViewModel, createSettingsPersister } from '../state/view-model';

export { buildSavePresetsViewModel, createSettingsPersister };

export function createSavePresetsActions(
  sync: SavePresetsSyncState,
  dialogState: SavePresetsDialogState,
  dragState: SavePresetsDragState
) {
  const persistSettings = createSettingsPersister(sync);

  return {
    confirmDeletePreset: createConfirmDeletePresetAction(sync, dialogState, persistSettings),
    handleCaptureActionChange: createCaptureActionChangeAction(sync, persistSettings),
    handleDefaultPresetChange: createDefaultPresetChangeAction(persistSettings),
    handleDeletePreset: createDeletePresetGuard(sync),
    handleDrop: createDropPresetAction(sync, dragState, persistSettings),
    handleSavePreset: createSavePresetAction(sync, dialogState, persistSettings),
    handleTogglePresetEnabled: createTogglePresetEnabledAction(sync, persistSettings),
    handleToggleSaveToGallery: createToggleSaveToGalleryAction(sync, persistSettings),
  };
}
