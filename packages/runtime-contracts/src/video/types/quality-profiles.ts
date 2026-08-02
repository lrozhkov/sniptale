// policyStateIds: [] - built-in profile ids are an immutable validation catalog, not authority.
import type { VideoQuality } from './quality';
import {
  isVideoOutputProfile,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
  type VideoOutputProfile,
} from './output-profile';

export const VideoRecordingBuiltInProfileId = {
  COMPACT: 'builtin:compact',
  OPTIMAL: 'builtin:optimal',
  HIGH: 'builtin:high',
  MAXIMUM: 'builtin:maximum',
} as const;

export type VideoRecordingBuiltInProfileId =
  (typeof VideoRecordingBuiltInProfileId)[keyof typeof VideoRecordingBuiltInProfileId];

export interface VideoRecordingProfile {
  configuration: VideoOutputProfile;
  id: string;
  name: string;
}

function createBuiltInProfile(
  id: VideoRecordingBuiltInProfileId,
  quality: VideoQuality,
  resolution: VideoResolutionPreset
): VideoRecordingProfile {
  return {
    configuration: {
      codec: VideoOutputCodec.VP9,
      container: VideoOutputContainer.WEBM,
      frameRate: VideoFrameRate.FPS30,
      quality,
      resolution,
    },
    id,
    name: id,
  };
}

export const BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES: readonly VideoRecordingProfile[] = [
  createBuiltInProfile(
    VideoRecordingBuiltInProfileId.COMPACT,
    'MEDIUM',
    VideoResolutionPreset.P720
  ),
  createBuiltInProfile(VideoRecordingBuiltInProfileId.OPTIMAL, 'HIGH', VideoResolutionPreset.P1080),
  createBuiltInProfile(VideoRecordingBuiltInProfileId.HIGH, 'HIGH', VideoResolutionPreset.P1440),
  createBuiltInProfile(
    VideoRecordingBuiltInProfileId.MAXIMUM,
    'ULTRA',
    VideoResolutionPreset.SOURCE
  ),
];

export const DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID = VideoRecordingBuiltInProfileId.OPTIMAL;
export const VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT = 32;
const BUILT_IN_PROFILE_IDS = new Set<string>(Object.values(VideoRecordingBuiltInProfileId));

export function isVideoRecordingProfile(value: unknown): value is VideoRecordingProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    !Object.hasOwn(candidate, 'quality') &&
    !Object.hasOwn(candidate, 'output') &&
    typeof candidate['id'] === 'string' &&
    candidate['id'].length > 0 &&
    candidate['id'].length <= 128 &&
    typeof candidate['name'] === 'string' &&
    candidate['name'].trim().length > 0 &&
    candidate['name'].length <= 80 &&
    isVideoOutputProfile(candidate['configuration'])
  );
}

export function parseVideoRecordingProfiles(value: unknown): VideoRecordingProfile[] | null {
  if (!Array.isArray(value) || value.length > VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT) {
    return null;
  }
  if (!value.every(isVideoRecordingProfile)) {
    return null;
  }
  if (value.some((profile) => BUILT_IN_PROFILE_IDS.has(profile.id))) {
    return null;
  }
  const ids = new Set(value.map((profile) => profile.id));
  if (ids.size !== value.length) {
    return null;
  }
  return value.map((profile) => ({
    ...profile,
    configuration: { ...profile.configuration },
  }));
}

export function getVideoRecordingProfiles(settings: {
  qualityProfiles?: VideoRecordingProfile[];
}): VideoRecordingProfile[] {
  return [...BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES, ...(settings.qualityProfiles ?? [])];
}

export function getVideoRecordingProfile(
  settings: {
    qualityProfileId?: string | null;
    qualityProfiles?: VideoRecordingProfile[];
  },
  profileId: string
): VideoRecordingProfile | null {
  return getVideoRecordingProfiles(settings).find((profile) => profile.id === profileId) ?? null;
}

export function isVideoRecordingProfileConfigurationMatch(
  profile: VideoRecordingProfile,
  configuration: VideoOutputProfile
): boolean {
  return (
    configuration.codec === profile.configuration.codec &&
    configuration.container === profile.configuration.container &&
    configuration.frameRate === profile.configuration.frameRate &&
    configuration.quality === profile.configuration.quality &&
    configuration.resolution === profile.configuration.resolution
  );
}
