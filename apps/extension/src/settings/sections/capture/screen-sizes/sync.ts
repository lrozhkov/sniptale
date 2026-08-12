import { useEffect, useRef, useState } from 'react';

import { useSettingsStore } from '../../../runtime/store/useSettingsStore';
import type { ViewportPreset } from '../../../../contracts/settings';

export function useViewportPresetsSync() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [viewportPresets, setViewportPresets] = useState<ViewportPreset[]>([]);
  const mutationActiveRef = useRef(false);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    setViewportPresets(settings.viewportPresets);
  }, [settings.viewportPresets]);

  return {
    beginMutation: () => {
      if (mutationActiveRef.current) return false;
      mutationActiveRef.current = true;
      setIsMutating(true);
      return true;
    },
    endMutation: () => {
      mutationActiveRef.current = false;
      setIsMutating(false);
    },
    isLoading,
    isMutating,
    setViewportPresets,
    settings,
    updateSettings,
    viewportPresets,
  };
}
