import { useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import type { ViewportPreset } from '../../../contracts/settings';

const logger = createLogger({ namespace: 'ContentViewportSelector' });

export function useViewportSelectorPresets(): ViewportPreset[] {
  const [presets, setPresets] = useState<ViewportPreset[]>([]);

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        if (settings.viewportPresets) {
          setPresets(settings.viewportPresets);
        }
      })
      .catch((error) => {
        logger.error('Failed to load presets', error);
      });
  }, []);

  return presets;
}
