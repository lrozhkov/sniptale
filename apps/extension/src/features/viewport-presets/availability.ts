import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportPreset } from './contracts';

export function createViewportPresetAvailabilityMap(
  presets: readonly ViewportPreset[],
  availabilities: readonly ViewportPresetAvailabilityPayload[] | undefined
): ReadonlyMap<string, ViewportPresetAvailabilityPayload> {
  const reported = new Map(
    availabilities?.map((availability) => [availability.presetId, availability] as const)
  );
  return new Map(
    presets.map((preset) => [
      preset.id,
      reported.get(preset.id) ?? {
        status: 'unavailable',
        presetId: preset.id,
        target: preset.target,
        reason: 'platform-rejected',
        required: { width: preset.width, height: preset.height },
      },
    ])
  );
}
