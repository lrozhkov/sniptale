import { createCaptureActionChangeAction, createDefaultPresetChangeAction } from './defaults';
import { createConfirmDeletePresetAction } from './preset/confirm-delete';
import { createDeletePresetGuard } from './preset/delete-guard';
import { createMovePresetBeforeAction } from './preset/drop';
import { createSavePresetAction } from './preset/save';
import { createTogglePresetEnabledAction } from './preset/toggle-enabled';
import type { SavePresetsDialogState, SavePresetsSyncState } from '../state/types';
import { buildSavePresetsViewModel, createSettingsPersister } from '../state/view-model';

export { buildSavePresetsViewModel, createSettingsPersister };

export function createSavePresetsActions(
  sync: SavePresetsSyncState,
  dialogState: SavePresetsDialogState
) {
  const persistSettings = createSettingsPersister(sync);

  return {
    confirmDeletePreset: createConfirmDeletePresetAction(sync, dialogState, persistSettings),
    handleCaptureActionChange: createCaptureActionChangeAction(sync, persistSettings),
    handleDefaultPresetChange: createDefaultPresetChangeAction(persistSettings),
    handleDeletePreset: createDeletePresetGuard(sync),
    handleMoveBefore: createMovePresetBeforeAction(sync, persistSettings),
    handleSavePreset: createSavePresetAction(sync, dialogState, persistSettings),
    handleTogglePresetEnabled: createTogglePresetEnabledAction(sync, persistSettings),
  };
}
