import { useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import type { ViewportPreset } from '../../../contracts/settings';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createViewportPresetAvailabilityMap } from '../../../features/viewport-presets/availability';

const logger = createLogger({ namespace: 'ContentViewportSelector' });

export function useViewportSelectorPresets(active: boolean): {
  availabilityById: ReadonlyMap<string, ViewportPresetAvailabilityPayload>;
  presets: ViewportPreset[];
} {
  const [presets, setPresets] = useState<ViewportPreset[]>([]);
  const [availabilityById, setAvailabilityById] = useState<
    ReadonlyMap<string, ViewportPresetAvailabilityPayload>
  >(new Map());

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    setAvailabilityById(new Map());
    loadSettings()
      .then((settings) => {
        if (!disposed && settings.viewportPresets) {
          const nextPresets = settings.viewportPresets;
          setPresets(nextPresets);
          void getContentRuntimeServices()
            .messaging.sendRuntimeMessage({
              type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
              presetIds: nextPresets.map((preset) => preset.id),
            })
            .then((response) => {
              const availabilities = response?.success ? response.availabilities : undefined;
              if (!disposed) {
                setAvailabilityById(
                  createViewportPresetAvailabilityMap(nextPresets, availabilities)
                );
              }
            })
            .catch((error) => {
              logger.warn('Failed to load preset availability', error);
              if (!disposed) {
                setAvailabilityById(createViewportPresetAvailabilityMap(nextPresets, undefined));
              }
            });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setPresets([]);
          setAvailabilityById(new Map());
          logger.error('Failed to load presets', error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [active]);

  return { availabilityById, presets };
}
