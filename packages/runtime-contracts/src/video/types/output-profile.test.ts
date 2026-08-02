import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  getDefaultVideoOutputCodec,
  getVideoResolutionTier,
  getVideoRecordingMimeTypeCandidates,
  isVideoOutputProfile,
  isVideoPixelRateSupported,
  isVideoResolutionFrameRateSupported,
  resolveVideoOutputDimensions,
  resolveVideoTargetBitrate,
  resolveVideoPixelRate,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from './output-profile';

describe('canonical video output geometry', () => {
  it('uses the p value as exact output height while preserving every source aspect ratio', () => {
    expect(resolveVideoOutputDimensions(1482, 916, VideoResolutionPreset.P1080)).toEqual({
      width: 1748,
      height: 1080,
    });
    expect(resolveVideoOutputDimensions(1080, 1920, VideoResolutionPreset.P720)).toEqual({
      width: 406,
      height: 720,
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
    expect(getVideoResolutionTier(1080, 1920)).toBe(VideoResolutionPreset.P2160);
  });
});

describe('canonical video output profile', () => {
  it('keeps the 2160p preset inside its canonical 24 fps live-recording tier', () => {
    expect(
      isVideoResolutionFrameRateSupported(VideoResolutionPreset.P2160, VideoFrameRate.FPS24)
    ).toBe(true);
    expect(
      isVideoResolutionFrameRateSupported(VideoResolutionPreset.P2160, VideoFrameRate.FPS30)
    ).toBe(false);
    expect(
      isVideoResolutionFrameRateSupported(VideoResolutionPreset.P2160, VideoFrameRate.FPS60)
    ).toBe(false);
    expect(
      isVideoResolutionFrameRateSupported(VideoResolutionPreset.P1440, VideoFrameRate.FPS60)
    ).toBe(true);
    expect(
      isVideoResolutionFrameRateSupported(VideoResolutionPreset.SOURCE, VideoFrameRate.FPS60)
    ).toBe(true);
  });

  it('maps each container to its canonical default codec and MIME candidates', () => {
    expect(getDefaultVideoOutputCodec(VideoOutputContainer.WEBM)).toBe(VideoOutputCodec.VP9);
    expect(getDefaultVideoOutputCodec(VideoOutputContainer.MP4)).toBe(VideoOutputCodec.AVC);

    expect(
      getVideoRecordingMimeTypeCandidates(
        {
          codec: VideoOutputCodec.VP9,
          container: VideoOutputContainer.WEBM,
        },
        true
      )
    ).toEqual(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9']);
    expect(
      getVideoRecordingMimeTypeCandidates(
        {
          codec: VideoOutputCodec.AVC,
          container: VideoOutputContainer.MP4,
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
    expect(isVideoOutputProfile(DEFAULT_VIDEO_OUTPUT_PROFILE)).toBe(true);
    expect(
      isVideoOutputProfile({
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.WEBM,
        frameRate: VideoFrameRate.FPS30,
        quality: 'HIGH',
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
    expect(
      isVideoOutputProfile({
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.MP4,
        frameRate: VideoFrameRate.FPS30,
        quality: 'HIGH',
        resolution: VideoResolutionPreset.P1080,
      })
    ).toBe(false);
    expect(
      isVideoOutputProfile({
        codec: 'HEVC',
        container: VideoOutputContainer.MP4,
        frameRate: VideoFrameRate.FPS30,
        quality: 'HIGH',
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

  it('uses one deterministic live pixel-rate envelope', () => {
    expect(resolveVideoPixelRate({ width: 3840, height: 2160 }, VideoFrameRate.FPS30)).toBe(
      248_832_000
    );
    expect(isVideoPixelRateSupported(3840 * 2160 * 30)).toBe(true);
    expect(isVideoPixelRateSupported(1920 * 1080 * 60)).toBe(true);
    expect(isVideoPixelRateSupported(3840 * 2160 * 60)).toBe(false);
    expect(isVideoPixelRateSupported(Number.NaN)).toBe(false);
  });
});
