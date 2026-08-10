import type { SettingsPatch } from '../../../../../contracts/settings';
import type { CaptureActionType } from '../../../../../contracts/settings';
import type { SavePresetsSyncState } from '../state/types';

export function createCaptureActionChangeAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: SettingsPatch) => Promise<void>
) {
  return async (value: CaptureActionType) => {
    const previousValue = sync.captureAction;
    sync.setCaptureAction(value);
    try {
      await persistSettings({ captureAction: value });
    } catch (error) {
      sync.setCaptureAction(previousValue);
      throw error;
    }
  };
}

function restoreDefaultPresetSelection(
  onChange: (id: string | null) => void,
  previousValue: string | null
) {
  onChange(previousValue);
}

export function createDefaultPresetChangeAction(
  persistSettings: (partialSettings: SettingsPatch) => Promise<void>
) {
  return async (
    field: 'defaultImagePresetId' | 'defaultVideoPresetId' | 'defaultExportPresetId',
    value: string,
    onChange: (id: string | null) => void,
    previousValue: string | null
  ) => {
    const id = value || null;
    onChange(id);

    try {
      await persistSettings({ [field]: id });
    } catch (error) {
      restoreDefaultPresetSelection(onChange, previousValue);
      throw error;
    }
  };
}
