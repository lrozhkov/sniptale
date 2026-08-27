import { useCallback, useState } from 'react';
import { useAppLocale } from '../../../../platform/i18n';
import type { SettingsPatch } from '../../../../contracts/settings';
import { useSettingsStore } from '../../../runtime/store/useSettingsStore';

type WebSnapshotSetting =
  | 'webSnapshotEnabled'
  | 'authenticatedSnapshotAssetsEnabled'
  | 'anonymousCrossOriginSnapshotAssetsEnabled';

export function useWebSnapshotsController() {
  const locale = useAppLocale();
  const { settings, updateSettings } = useSettingsStore();
  const [pendingSetting, setPendingSetting] = useState<WebSnapshotSetting | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const update = useCallback(
    async (setting: WebSnapshotSetting, enabled: boolean) => {
      if (pendingSetting) return;
      setPendingSetting(setting);
      setSaveFailed(false);
      try {
        await updateSettings({ [setting]: enabled } satisfies SettingsPatch);
      } catch {
        setSaveFailed(true);
      } finally {
        setPendingSetting(null);
      }
    },
    [pendingSetting, updateSettings]
  );

  return {
    anonymousCrossOriginSnapshotAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
    authenticatedSnapshotAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
    locale,
    pendingSetting,
    saveFailed,
    updateAnonymousCrossOriginSnapshotAssetsEnabled: (enabled: boolean) =>
      update('anonymousCrossOriginSnapshotAssetsEnabled', enabled),
    updateAuthenticatedSnapshotAssetsEnabled: (enabled: boolean) =>
      update('authenticatedSnapshotAssetsEnabled', enabled),
    updateWebSnapshotEnabled: (enabled: boolean) => update('webSnapshotEnabled', enabled),
    webSnapshotEnabled: settings.webSnapshotEnabled,
  };
}
