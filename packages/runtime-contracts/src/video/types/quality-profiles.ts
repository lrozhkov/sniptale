// policyStateIds: [] - built-in profile ids are an immutable validation catalog, not authority.
import type { VideoQuality } from './quality';
import {
  isVideoRecordingOutputSettings,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
  type VideoRecordingOutputSettings,
} from './output-profile';

export const VideoRecordingBuiltInProfileId = {
  COMPACT: 'builtin:compact',
  OPTIMAL: 'builtin:optimal',
  HIGH: 'builtin:high',
  MAXIMUM: 'builtin:maximum',
} as const;

export type VideoRecordingBuiltInProfileId =
  (typeof VideoRecordingBuiltInProfileId)[keyof typeof VideoRecordingBuiltInProfileId];

export interface VideoRecordingQualityProfile {
  id: string;
  name: string;
  output: VideoRecordingOutputSettings;
  quality: VideoQuality;
}

function createBuiltInProfile(
  id: VideoRecordingBuiltInProfileId,
  quality: VideoQuality,
  resolution: VideoResolutionPreset
): VideoRecordingQualityProfile {
  return {
    id,
    name: id,
    quality,
    output: {
      codec: VideoOutputCodec.VP9,
      container: VideoOutputContainer.WEBM,
      resolution,
    },
  };
}

export const BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES: readonly VideoRecordingQualityProfile[] = [
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

export function isVideoRecordingQualityProfile(
  value: unknown
): value is VideoRecordingQualityProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    candidate['id'].length > 0 &&
    candidate['id'].length <= 128 &&
    typeof candidate['name'] === 'string' &&
    candidate['name'].trim().length > 0 &&
    candidate['name'].length <= 80 &&
    (candidate['quality'] === 'LOW' ||
      candidate['quality'] === 'MEDIUM' ||
      candidate['quality'] === 'HIGH' ||
      candidate['quality'] === 'ULTRA') &&
    isVideoRecordingOutputSettings(candidate['output'])
  );
}

export function parseVideoRecordingQualityProfiles(
  value: unknown
): VideoRecordingQualityProfile[] | null {
  if (!Array.isArray(value) || value.length > VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT) {
    return null;
  }
  if (!value.every(isVideoRecordingQualityProfile)) {
    return null;
  }
  if (value.some((profile) => BUILT_IN_PROFILE_IDS.has(profile.id))) {
    return null;
  }
  const ids = new Set(value.map((profile) => profile.id));
  if (ids.size !== value.length) {
    return null;
  }
  return value.map((profile) => ({ ...profile, output: { ...profile.output } }));
}

export function getVideoRecordingQualityProfiles(settings: {
  qualityProfiles?: VideoRecordingQualityProfile[];
}): VideoRecordingQualityProfile[] {
  return [...BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES, ...(settings.qualityProfiles ?? [])];
}

export function getVideoRecordingQualityProfile(
  settings: {
    qualityProfileId?: string | null;
    qualityProfiles?: VideoRecordingQualityProfile[];
  },
  profileId: string
): VideoRecordingQualityProfile | null {
  return (
    getVideoRecordingQualityProfiles(settings).find((profile) => profile.id === profileId) ?? null
  );
}

export function isVideoRecordingProfileConfigurationMatch(
  profile: VideoRecordingQualityProfile,
  settings: { output?: VideoRecordingOutputSettings; quality: VideoQuality }
): boolean {
  const output = settings.output;
  return (
    profile.quality === settings.quality &&
    output?.codec === profile.output.codec &&
    output.container === profile.output.container &&
    output.resolution === profile.output.resolution
  );
}
