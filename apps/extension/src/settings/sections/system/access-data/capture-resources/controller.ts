import { useAppLocale } from '../../../../../platform/i18n';
import { useSettingsStore } from '../../../../runtime/store/useSettingsStore';

export function useCaptureResourcesController() {
  const locale = useAppLocale();
  const { settings, updateSettings } = useSettingsStore();
  return {
    anonymousCrossOriginSnapshotAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
    authenticatedSnapshotAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
    locale,
    updateAnonymousCrossOriginSnapshotAssetsEnabled: async (enabled: boolean) => {
      await updateSettings({ anonymousCrossOriginSnapshotAssetsEnabled: enabled });
    },
    updateAuthenticatedSnapshotAssetsEnabled: async (enabled: boolean) => {
      await updateSettings({ authenticatedSnapshotAssetsEnabled: enabled });
    },
  };
}
