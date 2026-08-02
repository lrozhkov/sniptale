import { afterEach, expect, it, vi } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { getSupportedMp4VideoCodecProfiles, getSupportedMp4VideoEncoder } from './video';

function createSettings(codec: VideoMp4Codec): VideoProjectExportSettings {
  return {
    downloadAfterExport: false,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 1080,
    mp4VideoCodec: codec,
    quality: VideoExportQualityPreset.HIGH,
    resolution: VideoResolutionPreset.P1080,
    width: 1920,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([VideoMp4Codec.AVC, VideoMp4Codec.HEVC, VideoMp4Codec.VP9])(
  'passes the same explicit quality target into the validated %s encoder config',
  async (codec) => {
    const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => ({
      config,
      supported: true,
    }));
    vi.stubGlobal('VideoEncoder', { isConfigSupported });

    const encoder = await getSupportedMp4VideoEncoder(createSettings(codec), codec);

    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({ bitrate: 8_000_000, bitrateMode: 'variable' })
    );
    expect(encoder.config.bitrate).toBe(8_000_000);
  }
);

it('rejects a codec family when the browser does not preserve the requested VBR config', async () => {
  const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => {
    const { bitrateMode: _bitrateMode, ...normalizedConfig } = config;
    return { config: normalizedConfig, supported: true };
  });
  vi.stubGlobal('VideoEncoder', { isConfigSupported });

  await expect(
    getSupportedMp4VideoEncoder(createSettings(VideoMp4Codec.AVC), VideoMp4Codec.AVC)
  ).rejects.toThrow(/video encoder/i);
  expect(isConfigSupported).toHaveBeenCalledTimes(10);
});

it('collects capability profiles per codec and isolates a rejected family', async () => {
  const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => {
    if (config.codec.startsWith('avc1')) {
      throw new Error('AVC probe failed');
    }
    return { config, supported: config.codec.startsWith('hvc1') };
  });
  vi.stubGlobal('VideoEncoder', { isConfigSupported });

  const profiles = await getSupportedMp4VideoCodecProfiles(createSettings(VideoMp4Codec.HEVC), [
    VideoMp4Codec.AVC,
    VideoMp4Codec.HEVC,
    VideoMp4Codec.VP9,
  ]);

  expect(profiles.map((profile) => profile.codec)).toEqual([VideoMp4Codec.HEVC]);
});
