import { translate } from '../../../../../platform/i18n';
import {
  getVideoRecordingProfiles,
  isVideoRecordingProfileConfigurationMatch,
  VideoRecordingBuiltInProfileId,
  VideoQuality,
  type VideoOutputDimensions,
  type VideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { isKnownVideoOutputProfileSupported } from '../../output-resource-policy';
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

export function getQualityIndex(quality: VideoOutputProfile['quality']): number {
  const index = QUALITY_OPTIONS.findIndex((option) => option.value === quality);
  return index >= 0 ? index : DEFAULT_QUALITY_INDEX;
}

export function getQualityOption(quality: VideoOutputProfile['quality']) {
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

function getProfileDescription(profile: VideoOutputProfile): string {
  const quality = getQualityOption(profile.quality).label;
  return [
    getOutputResolutionLabel(profile.resolution),
    getOutputCodecLabel(profile.codec),
    `${profile.frameRate} fps`,
    quality,
  ].join(' · ');
}

export function getRecordingProfileOptions(
  settings: VideoRecordingSettings,
  knownOutputBasisDimensions: VideoOutputDimensions | null = null
) {
  const profiles = getVideoRecordingProfiles(settings);
  const options = profiles.map((profile) => {
    const supported = isKnownVideoOutputProfileSupported(
      knownOutputBasisDimensions,
      profile.configuration
    );
    return {
      value: profile.id,
      label: profile.id.startsWith('builtin:') ? getBuiltInProfileLabel(profile.id) : profile.name,
      description: getProfileDescription(profile.configuration),
      ...(supported
        ? {}
        : {
            detail: translate('popup.video.outputResourceUnsupported'),
            disabled: true,
          }),
    };
  });
  const selected = profiles.find(
    (profile) =>
      profile.id === settings.qualityProfileId &&
      isVideoRecordingProfileConfigurationMatch(profile, settings.outputProfile)
  );
  if (selected) {
    return { options, selectedProfileId: selected.id };
  }
  const matching = profiles.find((profile) =>
    isVideoRecordingProfileConfigurationMatch(profile, settings.outputProfile)
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
        description: getProfileDescription(settings.outputProfile),
        ...(isKnownVideoOutputProfileSupported(knownOutputBasisDimensions, settings.outputProfile)
          ? {}
          : {
              detail: translate('popup.video.outputResourceUnsupported'),
              disabled: true,
            }),
      },
    ],
    selectedProfileId: CURRENT_CUSTOM_PROFILE_ID,
  };
}
