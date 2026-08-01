import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
  DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID,
  getVideoRecordingProfile,
  getVideoRecordingProfiles,
  isVideoRecordingProfileConfigurationMatch,
  parseVideoRecordingProfiles,
  VideoRecordingBuiltInProfileId,
} from './quality-profiles';
import {
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from './output-profile';

function createCustomProfile(id = 'custom:review') {
  return {
    id,
    name: 'Review',
    configuration: {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: 'MEDIUM' as const,
      resolution: VideoResolutionPreset.P720,
    },
  };
}

describe('video recording quality profiles', () => {
  it('provides a concise optimal default and combines built-in with custom profiles', () => {
    const custom = createCustomProfile();
    const profiles = getVideoRecordingProfiles({ qualityProfiles: [custom] });

    expect(DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID).toBe(VideoRecordingBuiltInProfileId.OPTIMAL);
    expect(profiles).toEqual([...BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES, custom]);
    expect(getVideoRecordingProfile({ qualityProfiles: [custom] }, custom.id)).toEqual(custom);
    expect(
      getVideoRecordingProfile({ qualityProfiles: [] }, VideoRecordingBuiltInProfileId.MAXIMUM)
        ?.configuration.resolution
    ).toBe(VideoResolutionPreset.SOURCE);
  });

  it('keeps the maximum screen-recording profile on the bounded 30 fps encoder lane', () => {
    const maximum = getVideoRecordingProfile(
      { qualityProfiles: [] },
      VideoRecordingBuiltInProfileId.MAXIMUM
    );

    expect(maximum).toMatchObject({
      configuration: {
        frameRate: VideoFrameRate.FPS30,
        quality: 'ULTRA',
        resolution: VideoResolutionPreset.SOURCE,
      },
    });
  });

  it('accepts unique compatible custom profiles and clones nested output settings', () => {
    const custom = createCustomProfile();
    const parsed = parseVideoRecordingProfiles([custom]);

    expect(parsed).toEqual([custom]);
    expect(parsed?.[0]).not.toBe(custom);
    expect(parsed?.[0]?.configuration).not.toBe(custom.configuration);
  });

  it('rejects duplicate ids, built-in id collisions, and incompatible codec combinations', () => {
    const custom = createCustomProfile();

    expect(parseVideoRecordingProfiles([custom, custom])).toBeNull();
    expect(
      parseVideoRecordingProfiles([createCustomProfile(VideoRecordingBuiltInProfileId.OPTIMAL)])
    ).toBeNull();
    expect(
      parseVideoRecordingProfiles([
        {
          ...custom,
          configuration: {
            ...custom.configuration,
            container: VideoOutputContainer.WEBM,
          },
        },
      ])
    ).toBeNull();
  });

  it('rejects legacy quality and output members instead of preserving them', () => {
    const custom = createCustomProfile();

    expect(parseVideoRecordingProfiles([{ ...custom, quality: 'MEDIUM' }])).toBeNull();
    expect(parseVideoRecordingProfiles([{ ...custom, output: custom.configuration }])).toBeNull();
  });

  it('matches a profile only when quality and every output choice still agree', () => {
    const custom = createCustomProfile();

    expect(isVideoRecordingProfileConfigurationMatch(custom, custom.configuration)).toBe(true);
    expect(
      isVideoRecordingProfileConfigurationMatch(custom, {
        ...custom.configuration,
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
  });
});
