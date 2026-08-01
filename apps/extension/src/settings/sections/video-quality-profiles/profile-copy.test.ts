import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  getCodecLabel,
  getContainerLabel,
  getProfileName,
  getProfileSummary,
  getQualityLabel,
  getResolutionLabel,
} from './profile-copy';

describe('video quality profile copy', () => {
  it('labels built-in and custom profiles', () => {
    expect(BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES.map(getProfileName)).toEqual([
      'settings.videoQuality.compactName',
      'settings.videoQuality.optimalName',
      'settings.videoQuality.highName',
      'settings.videoQuality.maximumName',
    ]);
    expect(
      getProfileName({
        id: 'custom:review',
        name: 'Review',
        output: {
          codec: VideoOutputCodec.VP9,
          container: VideoOutputContainer.WEBM,
          resolution: VideoResolutionPreset.P720,
        },
        quality: VideoQuality.MEDIUM,
      })
    ).toBe('Review');
  });

  it('labels every quality, container, codec, and resolution family', () => {
    expect(Object.values(VideoQuality).map(getQualityLabel)).toEqual([
      'settings.videoQuality.qualityUltra',
      'settings.videoQuality.qualityHigh',
      'settings.videoQuality.qualityMedium',
      'settings.videoQuality.qualityLow',
    ]);
    expect(Object.values(VideoOutputContainer).map(getContainerLabel)).toEqual(['WebM', 'MP4']);
    expect(Object.values(VideoOutputCodec).map(getCodecLabel)).toEqual([
      'VP8',
      'VP9',
      'H.264 (AVC)',
    ]);
    expect(getResolutionLabel(VideoResolutionPreset.SOURCE)).toBe(
      'settings.videoQuality.resolutionSource'
    );
    expect(getResolutionLabel(VideoResolutionPreset.P1440)).toBe('1440p (2K)');
    expect(getResolutionLabel(VideoResolutionPreset.P2160)).toBe('2160p (4K)');
    expect(getResolutionLabel(VideoResolutionPreset.P720)).toBe('720p');
  });

  it('builds a concise profile summary', () => {
    const profile = BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES[1];
    if (!profile) throw new Error('Optimal profile is unavailable');
    expect(getProfileSummary(profile)).toContain('1080p · WebM · VP9');
  });
});
