import { useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import type { SavePreset } from '../../../contracts/settings';

const logger = createLogger({ namespace: 'ContentSaveDialogPresets' });

export function useSaveDialogPresets(): {
  loading: boolean;
  loadError: boolean;
  presets: SavePreset[];
} {
  const [presets, setPresets] = useState<SavePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        setLoadError(false);
        setPresets((settings.presets ?? []).filter((preset) => preset.enabled));
      })
      .catch((error) => {
        logger.error('Failed to load save dialog presets', error);
        setLoadError(true);
        setPresets([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { loading, loadError, presets };
}
