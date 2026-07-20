import { translate } from '../../../../../platform/i18n';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export const QUALITY_OPTIONS = [
  {
    value: VideoQuality.LOW,
    labelKey: 'popup.labels.qualityLow',
    descriptionKey: 'popup.labels.qualityLowDescription',
  },
  {
    value: VideoQuality.MEDIUM,
    labelKey: 'popup.labels.qualityMedium',
    descriptionKey: 'popup.labels.qualityMediumDescription',
  },
  {
    value: VideoQuality.HIGH,
    labelKey: 'popup.labels.qualityHigh',
    descriptionKey: 'popup.labels.qualityHighDescription',
  },
  {
    value: VideoQuality.ULTRA,
    labelKey: 'popup.labels.qualityUltra',
    descriptionKey: 'popup.labels.qualityUltraDescription',
  },
] as const;

const DEFAULT_QUALITY_INDEX = 2;
const DEFAULT_QUALITY_OPTION = QUALITY_OPTIONS[DEFAULT_QUALITY_INDEX];

export function getQualityIndex(quality: VideoRecordingSettings['quality']): number {
  const index = QUALITY_OPTIONS.findIndex((option) => option.value === quality);
  return index >= 0 ? index : DEFAULT_QUALITY_INDEX;
}

export function getQualityOption(quality: VideoRecordingSettings['quality']) {
  const option = QUALITY_OPTIONS[getQualityIndex(quality)] ?? DEFAULT_QUALITY_OPTION;
  return {
    ...option,
    label: translate(option.labelKey),
    description: translate(option.descriptionKey),
  };
}
