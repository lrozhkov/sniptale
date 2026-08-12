import { useEffect, useState } from 'react';

import { useSettingsStore } from '../../../../runtime/store/useSettingsStore';
import type { CaptureActionType, SavePreset } from '../../../../../contracts/settings';

export function useSavePresetsSync() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [presets, setPresets] = useState<SavePreset[]>([]);
  const [defaultImagePresetId, setDefaultImagePresetId] = useState<string | null>(null);
  const [defaultVideoPresetId, setDefaultVideoPresetId] = useState<string | null>(null);
  const [defaultExportPresetId, setDefaultExportPresetId] = useState<string | null>(null);
  const [captureAction, setCaptureAction] = useState<CaptureActionType>('download_default');

  useEffect(() => {
    setPresets(settings.presets ?? []);
    setDefaultImagePresetId(settings.defaultImagePresetId ?? null);
    setDefaultVideoPresetId(settings.defaultVideoPresetId ?? null);
    setDefaultExportPresetId(settings.defaultExportPresetId ?? null);
    setCaptureAction(settings.captureAction ?? 'download_default');
  }, [settings]);

  return {
    captureAction,
    defaultExportPresetId,
    defaultImagePresetId,
    defaultVideoPresetId,
    isLoading,
    presets,
    setCaptureAction,
    setDefaultExportPresetId,
    setDefaultImagePresetId,
    setDefaultVideoPresetId,
    setPresets,
    settings,
    updateSettings,
  };
}
