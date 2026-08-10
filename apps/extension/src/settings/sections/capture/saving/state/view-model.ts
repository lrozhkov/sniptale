import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { SettingsPatch } from '../../../../../contracts/settings';
import { getCaptureActionOptions } from './helpers';
import type { SavePresetsSyncState } from './types';

function buildPresetOptions(sync: SavePresetsSyncState) {
  return [
    { value: '', label: translate('savePresets.section.unsetOption') },
    ...sync.presets.map((preset) => ({ value: preset.id, label: preset.name })),
  ];
}

export function buildSavePresetsViewModel(sync: SavePresetsSyncState) {
  return {
    captureActionOptions: getCaptureActionOptions(),
    presetOptions: buildPresetOptions(sync),
  };
}

export function createSettingsPersister(sync: SavePresetsSyncState) {
  return async (partialSettings: SettingsPatch) => {
    try {
      await sync.updateSettings(partialSettings);
    } catch (error) {
      toast.error(translate('common.states.error'));
      throw error;
    }
  };
}
