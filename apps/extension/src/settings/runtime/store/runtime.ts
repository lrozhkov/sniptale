import type { NormalizedSettings, SettingsPatch } from '../../../contracts/settings';
import {
  loadSettings,
  patchSettings,
  resetSettingsToDefaults,
} from '../../../composition/persistence/settings';

export { DEFAULT_SETTINGS } from '../../../composition/persistence/settings';

export async function loadSettingsRuntimeState(): Promise<NormalizedSettings> {
  return loadSettings();
}

export async function updateSettingsRuntimeState(
  nextPatch: SettingsPatch
): Promise<NormalizedSettings> {
  return patchSettings(nextPatch);
}

export async function resetSettingsRuntimeState(): Promise<NormalizedSettings> {
  return resetSettingsToDefaults();
}
