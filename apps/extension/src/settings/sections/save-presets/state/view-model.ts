import { translate } from '../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { Settings } from '../../../../contracts/settings';
import { getCaptureActionOptions, getPresetCountLabel } from './helpers';
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
    presetCountLabel: getPresetCountLabel(sync.presets.length),
    presetOptions: buildPresetOptions(sync),
  };
}

export function createSettingsPersister(sync: SavePresetsSyncState) {
  return async (partialSettings: Partial<Settings>) => {
    try {
      await sync.updateSettings(partialSettings);
    } catch (error) {
      toast.error(translate('common.states.error'));
      throw error;
    }
  };
}
