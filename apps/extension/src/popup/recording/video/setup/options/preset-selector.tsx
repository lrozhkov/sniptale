import { useEffect, useState } from 'react';
import {
  translate,
  useAppLocale,
  type AppLocale,
  type TranslationKey,
} from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../../features/viewport-presets/format';
import { isViewportPresetAllowedForVideoCaptureMode } from '../../../../../features/viewport-presets/video-recording-policy';
import { orderViewportPresetsForSelector } from '../../../../../features/viewport-presets/operations';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { InlineCurtainSelect } from '../../inline-controls/curtain-select';
import type { InlineCurtainOption } from '../../inline-controls/curtain-options';
import {
  getVideoPresetAvailabilityDescription,
  useVideoPresetAvailability,
} from './preset-availability';

const AVAILABILITY_STATUS_DELAY_MS = 400;

function resolvePresetDetail(args: {
  availability: ViewportPresetAvailabilityPayload | undefined;
  modeUnavailable: boolean;
  preset: ViewportPreset;
  screenDisabled: boolean;
}): string | undefined {
  if (args.screenDisabled) return undefined;
  if (args.modeUnavailable) {
    return translate('viewportPresets.availability.cropViewportUnsupported');
  }
  if (!args.preset.enabled) return translate('viewportPresets.messages.presetDisabled');
  return args.availability?.status === 'unavailable'
    ? getVideoPresetAvailabilityDescription(args.availability, args.preset.target)
    : undefined;
}

function resolvePresetGroupDescriptionKey(
  modeUnavailable: boolean,
  target: ViewportPreset['target']
): TranslationKey {
  if (modeUnavailable) return 'viewportPresets.availability.cropViewportUnsupported';
  return target === 'viewport'
    ? 'viewportPresets.availability.pendingVideo'
    : 'viewportPresets.hints.window';
}

function createPresetOption(args: {
  availability: ViewportPresetAvailabilityPayload | undefined;
  captureMode: CaptureMode;
  locale: AppLocale;
  preset: ViewportPreset;
  screenDisabled: boolean;
}): InlineCurtainOption {
  const { availability, captureMode, locale, preset, screenDisabled } = args;
  const modeUnavailable = !isViewportPresetAllowedForVideoCaptureMode(captureMode, preset);
  const detail = resolvePresetDetail({ availability, modeUnavailable, preset, screenDisabled });
  const groupDescription = screenDisabled
    ? undefined
    : translate(resolvePresetGroupDescriptionKey(modeUnavailable, preset.target));
  return {
    value: preset.id,
    label: getViewportPresetDisplayName(preset, locale),
    meta: formatViewportPresetDimensions(preset.width, preset.height, locale),
    ...(detail === undefined ? {} : { detail }),
    disabled:
      !preset.enabled ||
      screenDisabled ||
      modeUnavailable ||
      availability === undefined ||
      availability.status === 'unavailable',
    group: translate(
      preset.target === 'viewport'
        ? 'viewportPresets.groups.viewport'
        : 'viewportPresets.groups.window'
    ),
    ...(groupDescription === undefined ? {} : { groupDescription }),
  };
}

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
  const cropNotice =
    captureMode === CaptureMode.TAB_CROP &&
    viewportPresets.some(
      (preset) => !isViewportPresetAllowedForVideoCaptureMode(captureMode, preset)
    )
      ? translate('viewportPresets.availability.cropViewportUnsupported')
      : undefined;
  const checking =
    !presetsUnavailable &&
    viewportPresets.some(
      (preset) =>
        isViewportPresetAllowedForVideoCaptureMode(captureMode, preset) &&
        !availabilityById.has(preset.id)
    );
  const showChecking = useDelayedAvailabilityStatus(checking);
  if (captureMode === CaptureMode.CAMERA) {
    return null;
  }

  const checkingNotice = showChecking
    ? translate('viewportPresets.availability.checking')
    : undefined;
  const notice = screenNotice ?? cropNotice ?? checkingNotice;
  const options = [
    {
      value: '',
      label: translate('viewportPresets.section.nativeOption'),
    },
    ...orderViewportPresetsForSelector(viewportPresets).map((preset) =>
      createPresetOption({
        availability: availabilityById.get(preset.id),
        captureMode,
        locale,
        preset,
        screenDisabled,
      })
    ),
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
