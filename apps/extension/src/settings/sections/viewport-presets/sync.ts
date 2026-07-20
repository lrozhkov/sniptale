import { useEffect, useState } from 'react';

import { useSettingsStore } from '../../runtime/store/useSettingsStore';
import type { ViewportPreset } from '../../../contracts/settings';

export function useViewportPresetsSync() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [viewportPresets, setViewportPresets] = useState<ViewportPreset[]>([]);
  const [defaultViewportId, setDefaultViewportId] = useState('native');

  useEffect(() => {
    setViewportPresets(settings.viewportPresets ?? []);
    setDefaultViewportId(settings.defaultViewportId ?? 'native');
  }, [settings.defaultViewportId, settings.viewportPresets]);

  return {
    defaultViewportId,
    isLoading,
    setDefaultViewportId,
    setViewportPresets,
    settings,
    updateSettings,
    viewportPresets,
  };
}
