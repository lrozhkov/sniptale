import { translate } from '../../../../../platform/i18n';
import type { Settings, SavePreset } from '../../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { sanitizePresetPathInput } from '@sniptale/foundation/utils/preset-path';
import type { SavePresetsDialogState, SavePresetsSyncState } from '../../state/types';

export function createSavePresetAction(
  sync: SavePresetsSyncState,
  dialogState: SavePresetsDialogState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async (name: string, path: string, enabled: boolean) => {
    const sanitizedPath = sanitizePresetPathInput(path);

    if (!name.trim()) {
      toast.error(translate('savePresets.messages.nameRequired'));
      return;
    }

    const previousPresets = sync.presets;
    const nextPresets = dialogState.editingPreset
      ? sync.presets.map((preset) =>
          preset.id === dialogState.editingPreset?.id
            ? { ...preset, name: name.trim(), path: sanitizedPath || preset.path, enabled }
            : preset
        )
      : [
          ...sync.presets,
          {
            id: crypto.randomUUID(),
            enabled,
            name: name.trim(),
            order: sync.presets.length,
            path: sanitizedPath || 'Screenshots',
          } satisfies SavePreset,
        ];

    sync.setPresets(nextPresets);
    try {
      await persistSettings({ presets: nextPresets });
    } catch (error) {
      sync.setPresets(previousPresets);
      throw error;
    }
    dialogState.closeEditor();
    toast.success(
      translate(
        dialogState.editingPreset
          ? 'savePresets.messages.presetUpdated'
          : 'savePresets.messages.presetCreated'
      )
    );
  };
}
