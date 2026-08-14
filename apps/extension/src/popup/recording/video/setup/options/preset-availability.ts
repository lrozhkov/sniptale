import { useEffect, useRef, useState } from 'react';

import type { ViewportPreset } from '../../../../../contracts/settings';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n/popup';
import { getPopupRuntimeServices } from '../../../../runtime-services';
import { getViewportPresetErrorMessage } from '../../../../../features/viewport-presets/error-message';
import { createViewportPresetAvailabilityMap } from '../../../../../features/viewport-presets/availability';

export function getVideoPresetAvailabilityDescription(
  availability: ViewportPresetAvailabilityPayload | undefined
): string {
  if (!availability) return translate('viewportPresets.availability.checking');
  if (availability?.status === 'unavailable') {
    return (
      getViewportPresetErrorMessage(availability.reason) ??
      translate('viewportPresets.availability.unavailable')
    );
  }
  return translate('viewportPresets.hints.window');
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
        if (!disposed) {
          setAvailabilityById(createViewportPresetAvailabilityMap(presets, availabilities));
        }
      })
      .catch(() => {
        if (!disposed) {
          setAvailabilityById(createViewportPresetAvailabilityMap(presets, undefined));
        }
      });
    return () => {
      disposed = true;
    };
  }, [active, captureMode, presetSignature]);

  return { availabilityById };
}
