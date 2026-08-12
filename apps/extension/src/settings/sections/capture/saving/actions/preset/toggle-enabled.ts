import type { SavePreset, SettingsPatch } from '../../../../../../contracts/settings';
import type { SavePresetsSyncState } from '../../state/types';

export function createTogglePresetEnabledAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: SettingsPatch) => Promise<void>
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
  };
}
