import type { Settings, SettingsPatch } from '../../../contracts/settings';
import {
  loadSettings,
  patchSettings,
  resetSettingsToDefaults,
} from '../../../composition/persistence/settings';

export { DEFAULT_SETTINGS } from '../../../composition/persistence/settings';

export async function loadSettingsRuntimeState(): Promise<Settings> {
  return loadSettings();
}

export async function updateSettingsRuntimeState(nextPatch: SettingsPatch): Promise<Settings> {
  return patchSettings(nextPatch);
}

export async function resetSettingsRuntimeState(): Promise<Settings> {
  return resetSettingsToDefaults();
}
