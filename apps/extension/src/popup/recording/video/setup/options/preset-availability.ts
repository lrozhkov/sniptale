import { useEffect, useRef, useState } from 'react';

import type { ViewportPreset } from '../../../../../contracts/settings';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';
import { getPopupRuntimeServices } from '../../../../runtime-services';
import { getViewportPresetErrorMessage } from '../../../../../features/viewport-presets/error-message';

export function getVideoPresetAvailabilityDescription(
  availability: ViewportPresetAvailabilityPayload | undefined,
  target: ViewportPreset['target']
): string {
  if (!availability) return translate('viewportPresets.availability.checking');
  if (availability?.status === 'requires-start-validation') {
    return translate('viewportPresets.availability.pendingVideo');
  }
  if (availability?.status === 'unavailable') {
    return (
      getViewportPresetErrorMessage(availability.reason) ??
      translate('viewportPresets.availability.unavailable')
    );
  }
  return translate(
    target === 'viewport'
      ? 'viewportPresets.availability.pendingVideo'
      : 'viewportPresets.hints.window'
  );
}

export function useVideoPresetAvailability(
  captureMode: CaptureMode,
  viewportPresets: ViewportPreset[],
  active: boolean
): {
  availabilityById: ReadonlyMap<string, ViewportPresetAvailabilityPayload>;
} {
  const [availabilityById, setAvailabilityById] = useState<
    ReadonlyMap<string, ViewportPresetAvailabilityPayload>
  >(new Map());
  const presetsRef = useRef(viewportPresets);
  presetsRef.current = viewportPresets;
  const presetSignature = JSON.stringify(
    viewportPresets.map(({ id, target, width, height, enabled }) => ({
      id,
      target,
      width,
      height,
      enabled,
    }))
  );

  useEffect(() => {
    if (captureMode === CaptureMode.SCREEN || captureMode === CaptureMode.CAMERA) {
      setAvailabilityById(new Map());
      return;
    }
    if (!active) return;
    let disposed = false;
    setAvailabilityById(new Map());
    const presets = presetsRef.current;
    void getPopupRuntimeServices()
      .messaging.sendRuntimeMessage({
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        context: 'video',
        presetIds: presets.map((preset) => preset.id),
      })
      .then((response) => {
        const availabilities = response?.success ? response.availabilities : undefined;
        const byId = new Map(
          availabilities?.map((availability) => [availability.presetId, availability] as const)
        );
        const entries = presets.map(
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
      .catch(() => {
        if (!disposed) {
          setAvailabilityById(
            new Map(
              presets.map((preset) => [
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
    return () => {
      disposed = true;
    };
  }, [active, captureMode, presetSignature]);

  return { availabilityById };
}
