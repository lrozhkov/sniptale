import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  getDefaultVideoOutputCodec,
  getVideoResolutionTier,
  getVideoRecordingMimeTypeCandidates,
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
  it('maps each container to its canonical default codec and MIME candidates', () => {
    expect(getDefaultVideoOutputCodec(VideoOutputContainer.WEBM)).toBe(VideoOutputCodec.VP9);
    expect(getDefaultVideoOutputCodec(VideoOutputContainer.MP4)).toBe(VideoOutputCodec.AVC);

    expect(
      getVideoRecordingMimeTypeCandidates(
        {
          codec: VideoOutputCodec.VP9,
          container: VideoOutputContainer.WEBM,
          resolution: VideoResolutionPreset.P1080,
        },
        true
      )
    ).toEqual(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9']);
    expect(
      getVideoRecordingMimeTypeCandidates(
        {
          codec: VideoOutputCodec.AVC,
          container: VideoOutputContainer.MP4,
          resolution: VideoResolutionPreset.P1080,
        },
        false
      )
    ).toEqual([
      'video/mp4;codecs=avc1.640028',
      'video/mp4;codecs=avc1.4d0028',
      'video/mp4;codecs=avc1.42E01E',
    ]);
  });

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
      fps: 30,
      height: 1080,
      quality: 'HIGH',
      resolution: VideoResolutionPreset.P1080,
      width: 1920,
    });
    const highFrameRate = resolveVideoTargetBitrate({
      fps: 60,
      height: 1080,
      quality: 'HIGH',
      resolution: VideoResolutionPreset.P1080,
      width: 1920,
    });

    expect(base).toBe(8_000_000);
    expect(highFrameRate).toBe(12_000_000);
  });

  it('keeps codec efficiency outside the explicit quality ladder', () => {
    expect(
      resolveVideoTargetBitrate({
        fps: 30,
        height: 1080,
        quality: 'HIGH',
        resolution: VideoResolutionPreset.P1080,
        width: 1920,
      })
    ).toBe(8_000_000);
  });

  it('derives the Source bitrate tier from the materialized encoder size', () => {
    expect(
      resolveVideoTargetBitrate({
        fps: 30,
        height: 720,
        quality: 'HIGH',
        resolution: VideoResolutionPreset.SOURCE,
        width: 1280,
      })
    ).toBe(5_000_000);
    expect(
      resolveVideoTargetBitrate({
        fps: 30,
        height: 720,
        quality: 'HIGH',
        width: 1280,
      })
    ).toBe(5_000_000);
  });
});
