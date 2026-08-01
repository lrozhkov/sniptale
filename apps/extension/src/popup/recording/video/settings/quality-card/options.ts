import { translate } from '../../../../../platform/i18n';
import {
  getVideoRecordingQualityProfiles,
  isVideoRecordingProfileConfigurationMatch,
  VideoRecordingBuiltInProfileId,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { resolveVideoRecordingOutputSettings } from '@sniptale/runtime-contracts/video/types/types';
import { getOutputCodecLabel, getOutputResolutionLabel } from '../output-card/options';

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

const CURRENT_CUSTOM_PROFILE_ID = 'current:custom';

function getBuiltInProfileLabel(profileId: string): string {
  switch (profileId) {
    case VideoRecordingBuiltInProfileId.COMPACT:
      return translate('popup.video.profileCompact');
    case VideoRecordingBuiltInProfileId.OPTIMAL:
      return translate('popup.video.profileOptimal');
    case VideoRecordingBuiltInProfileId.HIGH:
      return translate('popup.video.profileHigh');
    case VideoRecordingBuiltInProfileId.MAXIMUM:
      return translate('popup.video.profileMaximum');
    default:
      return profileId;
  }
}

function getProfileDescription(profile: {
  output: NonNullable<VideoRecordingSettings['output']>;
  quality: VideoRecordingSettings['quality'];
}): string {
  const quality = getQualityOption(profile.quality).label;
  return [
    getOutputResolutionLabel(profile.output.resolution),
    getOutputCodecLabel(profile.output.codec),
    quality,
  ].join(' · ');
}

export function getRecordingProfileOptions(settings: VideoRecordingSettings) {
  const profiles = getVideoRecordingQualityProfiles(settings);
  const options = profiles.map((profile) => ({
    value: profile.id,
    label: profile.id.startsWith('builtin:') ? getBuiltInProfileLabel(profile.id) : profile.name,
    description: getProfileDescription(profile),
  }));
  const selected = profiles.find(
    (profile) =>
      profile.id === settings.qualityProfileId &&
      isVideoRecordingProfileConfigurationMatch(profile, {
        quality: settings.quality,
        output: resolveVideoRecordingOutputSettings(settings),
      })
  );
  if (selected) {
    return { options, selectedProfileId: selected.id };
  }
  const matching = profiles.find((profile) =>
    isVideoRecordingProfileConfigurationMatch(profile, {
      quality: settings.quality,
      output: resolveVideoRecordingOutputSettings(settings),
    })
  );
  if (matching) {
    return { options, selectedProfileId: matching.id };
  }
  return {
    options: [
      ...options,
      {
        value: CURRENT_CUSTOM_PROFILE_ID,
        label: translate('popup.video.profileCustom'),
        description: getProfileDescription({
          quality: settings.quality,
          output: resolveVideoRecordingOutputSettings(settings),
        }),
      },
    ],
    selectedProfileId: CURRENT_CUSTOM_PROFILE_ID,
  };
}
