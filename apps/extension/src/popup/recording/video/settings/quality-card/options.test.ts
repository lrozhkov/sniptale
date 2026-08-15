import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoFrameRate,
  VideoRecordingBuiltInProfileId,
  VideoResolutionPreset,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import { getQualityIndex, getQualityOption, getRecordingProfileOptions } from './options';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

describe('quality card options', () => {
  it('maps known qualities to their indices', () => {
    expect(getQualityIndex(VideoQuality.LOW)).toBe(0);
    expect(getQualityIndex(VideoQuality.MEDIUM)).toBe(1);
    expect(getQualityIndex(VideoQuality.HIGH)).toBe(2);
    expect(getQualityIndex(VideoQuality.ULTRA)).toBe(3);
  });

  it('falls back to the default quality slice for unknown input', () => {
    expect(getQualityIndex('BROKEN' as VideoQuality)).toBe(2);
    expect(getQualityOption('BROKEN' as VideoQuality).value).toBe(VideoQuality.HIGH);
  });

  it('returns translated labels and descriptions for known qualities', () => {
    expect(getQualityOption(VideoQuality.LOW)).toEqual(
      expect.objectContaining({
        description: expect.any(String),
        label: expect.any(String),
        value: VideoQuality.LOW,
      })
    );
  });

  it('shows concise built-in and custom profiles while preserving an advanced custom state', () => {
    const customProfile = {
      id: 'custom:review',
      name: 'Review',
      configuration: {
        ...DEFAULT_VIDEO_OUTPUT_PROFILE,
        quality: VideoQuality.MEDIUM,
      },
    };
    const common = {
      autoFadeDelay: 2,
      countdownSeconds: 3,
      interactionDiagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
      systemAudioEnabled: true,
    };

    expect(
      getRecordingProfileOptions({
        ...DEFAULT_VIDEO_SETTINGS,
        ...common,
        outputProfile: {
          ...DEFAULT_VIDEO_OUTPUT_PROFILE,
          quality: VideoQuality.HIGH,
        },
        qualityProfileId: VideoRecordingBuiltInProfileId.OPTIMAL,
        qualityProfiles: [customProfile],
      })
    ).toEqual(
      expect.objectContaining({
        selectedProfileId: VideoRecordingBuiltInProfileId.OPTIMAL,
        options: expect.arrayContaining([
          expect.objectContaining({ value: VideoRecordingBuiltInProfileId.OPTIMAL }),
          expect.objectContaining({ label: 'Review', value: 'custom:review' }),
        ]),
      })
    );
    expect(
      getRecordingProfileOptions({
        ...DEFAULT_VIDEO_SETTINGS,
        ...common,
        outputProfile: {
          ...DEFAULT_VIDEO_OUTPUT_PROFILE,
          quality: VideoQuality.LOW,
        },
        qualityProfileId: null,
        qualityProfiles: [],
      }).selectedProfileId
    ).toBe('current:custom');
  });

  it('disables a profile that exceeds the shared budget for a known source basis', () => {
    const settings = {
      ...DEFAULT_VIDEO_SETTINGS,
      qualityProfiles: [
        {
          configuration: {
            ...DEFAULT_VIDEO_OUTPUT_PROFILE,
            frameRate: VideoFrameRate.FPS60,
            resolution: VideoResolutionPreset.P2160,
          },
          id: 'custom:oversized',
          name: 'Oversized',
        },
      ],
    };

    const oversized = getRecordingProfileOptions(settings, {
      height: 900,
      width: 1440,
    }).options.find((option) => option.value === 'custom:oversized');

    expect(oversized).toEqual(
      expect.objectContaining({
        detail: expect.any(String),
        disabled: true,
      })
    );
  });
});
