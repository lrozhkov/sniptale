import { useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import type { ViewportPreset } from '../../../contracts/settings';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

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
              const byId = new Map(
                availabilities?.map(
                  (availability) => [availability.presetId, availability] as const
                )
              );
              const entries = nextPresets.map(
                (preset) =>
                  [
                    preset.id,
                    byId.get(preset.id) ?? {
                      status: 'unavailable',
                      presetId: preset.id,
                      target: preset.target,
                      reason: 'platform-rejected',
                      required: { width: preset.width, height: preset.height },
                    },
                  ] as const
              );
              if (!disposed) setAvailabilityById(new Map(entries));
            })
            .catch((error) => {
              logger.warn('Failed to load preset availability', error);
              if (!disposed) {
                setAvailabilityById(
                  new Map(
                    nextPresets.map((preset) => [
                      preset.id,
                      {
                        status: 'unavailable',
                        presetId: preset.id,
                        target: preset.target,
                        reason: 'platform-rejected',
                        required: { width: preset.width, height: preset.height },
                      } as const,
                    ])
                  )
                );
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
