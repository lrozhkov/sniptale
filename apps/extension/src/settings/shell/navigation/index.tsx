import {
  SETTINGS_SECTION_IDS,
  type SettingsSectionId,
} from '../../../platform/navigation/extension-pages/settings-route/codec';
export { SETTINGS_NAV_GROUPS, SETTINGS_NAV_ITEMS } from './registry';

export type SettingsTab = SettingsSectionId;

export function isSettingsTabVisible(tab: unknown): tab is SettingsTab {
  return typeof tab === 'string' && SETTINGS_SECTION_IDS.some((item) => item === tab);
}

export function normalizeSettingsTab(tab: unknown): SettingsTab {
  return isSettingsTabVisible(tab) ? tab : 'interface-browser';
}
