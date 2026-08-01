import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
  DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID,
  getVideoRecordingQualityProfile,
  getVideoRecordingQualityProfiles,
  isVideoRecordingProfileConfigurationMatch,
  parseVideoRecordingQualityProfiles,
  VideoRecordingBuiltInProfileId,
} from './quality-profiles';
import { VideoOutputCodec, VideoOutputContainer, VideoResolutionPreset } from './output-profile';

function createCustomProfile(id = 'custom:review') {
  return {
    id,
    name: 'Review',
    output: {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      resolution: VideoResolutionPreset.P720,
    },
    quality: 'MEDIUM' as const,
  };
}

describe('video recording quality profiles', () => {
  it('provides a concise optimal default and combines built-in with custom profiles', () => {
    const custom = createCustomProfile();
    const profiles = getVideoRecordingQualityProfiles({ qualityProfiles: [custom] });

    expect(DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID).toBe(VideoRecordingBuiltInProfileId.OPTIMAL);
    expect(profiles).toEqual([...BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES, custom]);
    expect(getVideoRecordingQualityProfile({ qualityProfiles: [custom] }, custom.id)).toEqual(
      custom
    );
    expect(
      getVideoRecordingQualityProfile(
        { qualityProfiles: [] },
        VideoRecordingBuiltInProfileId.MAXIMUM
      )?.output.resolution
    ).toBe(VideoResolutionPreset.SOURCE);
  });

  it('accepts unique compatible custom profiles and clones nested output settings', () => {
    const custom = createCustomProfile();
    const parsed = parseVideoRecordingQualityProfiles([custom]);

    expect(parsed).toEqual([custom]);
    expect(parsed?.[0]).not.toBe(custom);
    expect(parsed?.[0]?.output).not.toBe(custom.output);
  });

  it('rejects duplicate ids, built-in id collisions, and incompatible codec combinations', () => {
    const custom = createCustomProfile();

    expect(parseVideoRecordingQualityProfiles([custom, custom])).toBeNull();
    expect(
      parseVideoRecordingQualityProfiles([
        createCustomProfile(VideoRecordingBuiltInProfileId.OPTIMAL),
      ])
    ).toBeNull();
    expect(
      parseVideoRecordingQualityProfiles([
        {
          ...custom,
          output: { ...custom.output, container: VideoOutputContainer.WEBM },
        },
      ])
    ).toBeNull();
  });

  it('matches a profile only when quality and every output choice still agree', () => {
    const custom = createCustomProfile();

    expect(
      isVideoRecordingProfileConfigurationMatch(custom, {
        output: custom.output,
        quality: custom.quality,
      })
    ).toBe(true);
    expect(
      isVideoRecordingProfileConfigurationMatch(custom, {
        output: { ...custom.output, resolution: VideoResolutionPreset.P1080 },
        quality: custom.quality,
      })
    ).toBe(false);
  });
});
