import { useMemo } from 'react';
import { translate, type TranslationKey } from '../../../../../platform/i18n';
import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  type WebcamActualSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  isWebcamFrameRatePresetSupported,
  isWebcamResolutionPresetSupported,
  WEBCAM_FRAME_RATE_PRESETS,
  WEBCAM_RESOLUTION_PRESETS,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';
import { formatKnownWebcamActualSettings } from '../../webcam-actual-settings';

type WebcamQualityOption<TValue extends string> = { label: string; value: TValue };

const QUALITY_OPTION_BASE_CLASS_NAME =
  'min-h-7 rounded-[7px] px-2 text-left text-xs font-medium transition-colors';
const QUALITY_OPTION_ACTIVE_CLASS_NAME = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');
const QUALITY_OPTION_INACTIVE_CLASS_NAME = [
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

function getResolutionLabel(preset: WebcamResolutionPreset): string {
  switch (preset) {
    case WebcamResolutionPreset.AUTO:
      return translate('popup.video.webcamQualityAuto');
    case WebcamResolutionPreset.P720:
      return translate('popup.video.webcamQualityResolution720p');
    case WebcamResolutionPreset.P1080:
      return translate('popup.video.webcamQualityResolution1080p');
    case WebcamResolutionPreset.P1440:
      return translate('popup.video.webcamQualityResolution1440p');
    case WebcamResolutionPreset.P4K:
      return translate('popup.video.webcamQualityResolution4k');
  }
}

function getFrameRateLabel(preset: WebcamFrameRatePreset): string {
  switch (preset) {
    case WebcamFrameRatePreset.AUTO:
      return translate('popup.video.webcamQualityAuto');
    case WebcamFrameRatePreset.FPS30:
      return translate('popup.video.webcamQualityFrameRate30');
    case WebcamFrameRatePreset.FPS60:
      return translate('popup.video.webcamQualityFrameRate60');
  }
}

export function formatActualSettings(settings: WebcamActualSettings | null): string {
  return (
    formatKnownWebcamActualSettings(settings) ?? translate('popup.video.webcamQualityActualUnknown')
  );
}

export function useWebcamResolutionOptions(
  capabilities: MediaTrackCapabilities | null
): Array<WebcamQualityOption<WebcamResolutionPreset>> {
  return useMemo(
    () => [
      {
        label: getResolutionLabel(WebcamResolutionPreset.AUTO),
        value: WebcamResolutionPreset.AUTO,
      },
      ...WEBCAM_RESOLUTION_PRESETS.filter((entry) =>
        isWebcamResolutionPresetSupported(capabilities, entry.value)
      ).map((entry) => ({ label: getResolutionLabel(entry.value), value: entry.value })),
    ],
    [capabilities]
  );
}

export function useWebcamFrameRateOptions(
  capabilities: MediaTrackCapabilities | null
): Array<WebcamQualityOption<WebcamFrameRatePreset>> {
  return useMemo(
    () => [
      {
        label: getFrameRateLabel(WebcamFrameRatePreset.AUTO),
        value: WebcamFrameRatePreset.AUTO,
      },
      ...WEBCAM_FRAME_RATE_PRESETS.filter((entry) =>
        isWebcamFrameRatePresetSupported(capabilities, entry.value)
      ).map((entry) => ({ label: getFrameRateLabel(entry.value), value: entry.value })),
    ],
    [capabilities]
  );
}

export function WebcamQualityOptionGroup<TValue extends string>({
  activeValue,
  labelKey,
  onChange,
  options,
}: {
  activeValue: TValue;
  labelKey: TranslationKey;
  onChange: (value: TValue) => void;
  options: Array<WebcamQualityOption<TValue>>;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="px-0.5 text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {translate(labelKey)}
      </div>
      <div className="grid gap-1">
        {options.map((option) => (
          <WebcamQualityOptionButton
            key={option.value}
            active={option.value === activeValue}
            label={option.label}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function WebcamQualityOptionButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        QUALITY_OPTION_BASE_CLASS_NAME,
        active ? QUALITY_OPTION_ACTIVE_CLASS_NAME : QUALITY_OPTION_INACTIVE_CLASS_NAME,
      ].join(' ')}
      title={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
