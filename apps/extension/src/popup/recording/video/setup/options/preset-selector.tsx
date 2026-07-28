import { useEffect, useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import { useAppLocale } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../../features/viewport-presets/format';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { InlineCurtainSelect } from '../../inline-controls/curtain-select';
import {
  getVideoPresetAvailabilityDescription,
  useVideoPresetAvailability,
} from './preset-availability';

const AVAILABILITY_STATUS_DELAY_MS = 400;

function useDelayedAvailabilityStatus(checking: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!checking) {
      setVisible(false);
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setVisible(true), AVAILABILITY_STATUS_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [checking]);
  return visible;
}

export function VideoPresetSelector({
  viewportPresets,
  selectedPresetId,
  onPresetChange,
  captureMode,
}: {
  viewportPresets: ViewportPreset[];
  selectedPresetId: string | null;
  onPresetChange: (presetId: string | null) => Promise<void> | void;
  captureMode: CaptureMode;
}) {
  const locale = useAppLocale();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { availabilityById } = useVideoPresetAvailability(
    captureMode,
    viewportPresets,
    optionsOpen
  );
  const screenDisabled = captureMode === CaptureMode.SCREEN;
  const presetsUnavailable = screenDisabled || captureMode === CaptureMode.CAMERA;
  const screenNotice = screenDisabled
    ? translate('viewportPresets.availability.screenUnsupported')
    : undefined;
  const checking =
    !presetsUnavailable && viewportPresets.some((preset) => !availabilityById.has(preset.id));
  const showChecking = useDelayedAvailabilityStatus(checking);
  if (captureMode === CaptureMode.CAMERA) {
    return null;
  }

  const checkingNotice = showChecking
    ? translate('viewportPresets.availability.checking')
    : undefined;
  const notice = screenNotice ?? checkingNotice;
  const options = [
    {
      value: '',
      label: translate('viewportPresets.section.nativeOption'),
    },
    ...viewportPresets.map((preset) => {
      const availability = availabilityById.get(preset.id);
      return {
        value: preset.id,
        label: getViewportPresetDisplayName(preset, locale),
        meta: formatViewportPresetDimensions(preset.width, preset.height, locale),
        ...(!screenDisabled && !preset.enabled
          ? { detail: translate('viewportPresets.messages.presetDisabled') }
          : !screenDisabled && availability?.status === 'unavailable'
            ? { detail: getVideoPresetAvailabilityDescription(availability, preset.target) }
            : {}),
        disabled:
          !preset.enabled ||
          screenDisabled ||
          availability === undefined ||
          availability.status === 'unavailable',
        group: translate(
          preset.target === 'viewport'
            ? 'viewportPresets.groups.viewport'
            : 'viewportPresets.groups.window'
        ),
        ...(screenDisabled
          ? {}
          : {
              groupDescription: translate(
                preset.target === 'viewport'
                  ? 'viewportPresets.availability.pendingVideo'
                  : 'viewportPresets.hints.window'
              ),
            }),
      };
    }),
  ];

  return (
    <InlineCurtainSelect
      value={selectedPresetId ?? ''}
      label={translate('popup.video.presetRowLabel')}
      ariaLabel={translate('popup.video.presetRowAria')}
      options={options}
      {...(notice === undefined ? {} : { notice })}
      onOpenChange={setOptionsOpen}
      onChange={(value) => {
        void onPresetChange(value || null);
      }}
    />
  );
}
