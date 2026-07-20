import { translate } from '../../../../../platform/i18n';
import type { Settings } from '../../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { SavePresetsDialogState, SavePresetsSyncState } from '../../state/types';

export function createConfirmDeletePresetAction(
  sync: SavePresetsSyncState,
  dialogState: SavePresetsDialogState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async () => {
    if (!dialogState.confirmDelete) {
      return;
    }

    const deletedPresetId = dialogState.confirmDelete.id;
    const nextPresets = sync.presets
      .filter((preset) => preset.id !== deletedPresetId)
      .map((preset, index) => ({ ...preset, order: index }));
    const nextDefaultImagePresetId =
      sync.defaultImagePresetId === deletedPresetId ? null : sync.defaultImagePresetId;
    const nextDefaultVideoPresetId =
      sync.defaultVideoPresetId === deletedPresetId ? null : sync.defaultVideoPresetId;
    const nextDefaultExportPresetId =
      sync.defaultExportPresetId === deletedPresetId ? null : sync.defaultExportPresetId;

    const previousPresets = sync.presets;
    const previousDefaultImagePresetId = sync.defaultImagePresetId;
    const previousDefaultVideoPresetId = sync.defaultVideoPresetId;
    const previousDefaultExportPresetId = sync.defaultExportPresetId;

    sync.setPresets(nextPresets);
    sync.setDefaultImagePresetId(nextDefaultImagePresetId);
    sync.setDefaultVideoPresetId(nextDefaultVideoPresetId);
    sync.setDefaultExportPresetId(nextDefaultExportPresetId);

    try {
      await persistSettings({
        defaultExportPresetId: nextDefaultExportPresetId,
        defaultImagePresetId: nextDefaultImagePresetId,
        defaultVideoPresetId: nextDefaultVideoPresetId,
        presets: nextPresets,
      });
    } catch (error) {
      sync.setPresets(previousPresets);
      sync.setDefaultImagePresetId(previousDefaultImagePresetId);
      sync.setDefaultVideoPresetId(previousDefaultVideoPresetId);
      sync.setDefaultExportPresetId(previousDefaultExportPresetId);
      throw error;
    }

    toast.success(translate('savePresets.messages.presetDeleted'));
    dialogState.closeDeleteDialog();
  };
}
