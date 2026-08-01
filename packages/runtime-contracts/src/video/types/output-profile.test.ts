import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  getVideoResolutionTier,
  isVideoRecordingOutputSettings,
  resolveVideoOutputDimensions,
  resolveVideoTargetBitrate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from './output-profile';

describe('canonical video output geometry', () => {
  it('uses the p value on the short edge while preserving every source aspect ratio', () => {
    expect(resolveVideoOutputDimensions(1482, 916, VideoResolutionPreset.P1080)).toEqual({
      width: 1748,
      height: 1080,
    });
    expect(resolveVideoOutputDimensions(1080, 1920, VideoResolutionPreset.P720)).toEqual({
      width: 720,
      height: 1280,
    });
    expect(resolveVideoOutputDimensions(3440, 1440, VideoResolutionPreset.P1080)).toEqual({
      width: 2580,
      height: 1080,
    });
    expect(resolveVideoOutputDimensions(1086, 500, VideoResolutionPreset.P1080)).toEqual({
      width: 2346,
      height: 1080,
    });
  });

  it('normalizes odd source dimensions while presets may scale either direction', () => {
    expect(resolveVideoOutputDimensions(853, 479, VideoResolutionPreset.P1080)).toEqual({
      width: 1924,
      height: 1080,
    });
    expect(resolveVideoOutputDimensions(853, 479, VideoResolutionPreset.SOURCE)).toEqual({
      width: 852,
      height: 478,
    });
  });

  it('assigns arbitrary source dimensions to their enclosing standard tier', () => {
    expect(getVideoResolutionTier(1482, 916)).toBe(VideoResolutionPreset.P1080);
    expect(getVideoResolutionTier(2560, 1080)).toBe(VideoResolutionPreset.P1080);
  });
});

describe('canonical video output profile', () => {
  it('accepts only compatible container and codec combinations', () => {
    expect(isVideoRecordingOutputSettings(DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS)).toBe(true);
    expect(
      isVideoRecordingOutputSettings({
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.WEBM,
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
    expect(
      isVideoRecordingOutputSettings({
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.MP4,
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
    expect(
      isVideoRecordingOutputSettings({
        codec: 'HEVC',
        container: VideoOutputContainer.MP4,
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
  });

  it('uses a fixed resolution ladder and an explicit high-frame-rate step', () => {
    const base = resolveVideoTargetBitrate({
      codec: VideoOutputCodec.AVC,
      fps: 30,
      height: 1080,
      quality: 'HIGH',
      resolution: VideoResolutionPreset.P1080,
      width: 1920,
    });
    const highFrameRate = resolveVideoTargetBitrate({
      codec: VideoOutputCodec.AVC,
      fps: 60,
      height: 1080,
      quality: 'HIGH',
      resolution: VideoResolutionPreset.P1080,
      width: 1920,
    });

    expect(base).toBe(8_000_000);
    expect(highFrameRate).toBe(12_000_000);
  });
});
