import { translate } from '../../../../../platform/i18n';
import type { Settings, SavePreset } from '../../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { SavePresetsSyncState } from '../../state/types';

export function createTogglePresetEnabledAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async (preset: SavePreset) => {
    const previousPresets = sync.presets;
    const nextPresets = sync.presets.map((item) =>
      item.id === preset.id ? { ...item, enabled: !item.enabled } : item
    );

    sync.setPresets(nextPresets);
    try {
      await persistSettings({ presets: nextPresets });
    } catch (error) {
      sync.setPresets(previousPresets);
      throw error;
    }
    toast.success(
      preset.enabled
        ? translate('savePresets.messages.presetHidden')
        : translate('savePresets.messages.presetShown')
    );
  };
}
