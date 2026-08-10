import type { SettingsPatch } from '../../../../../../contracts/settings';
import { reorderPresetsBefore } from '../../state/helpers';
import type { SavePresetsSyncState } from '../../state/types';

export function createMovePresetBeforeAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: SettingsPatch) => Promise<void>
) {
  return async (presetId: string, beforePresetId: string | null) => {
    const nextPresets = reorderPresetsBefore(sync.presets, presetId, beforePresetId);
    if (!nextPresets) return;
    const previousPresets = sync.presets;
    sync.setPresets(nextPresets);
    try {
      await persistSettings({ presets: nextPresets });
    } catch (error) {
      sync.setPresets(previousPresets);
      throw error;
    }
  };
}
