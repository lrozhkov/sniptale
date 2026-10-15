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
  'prefers constant-quality control for the validated %s encoder config',
  async (codec) => {
    const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => ({
      config,
      supported: true,
    }));
    vi.stubGlobal('VideoEncoder', { isConfigSupported });

    const encoder = await getSupportedMp4VideoEncoder(createSettings(codec), codec);

    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({ bitrateMode: 'quantizer', latencyMode: 'quality' })
    );
    expect(encoder.config.bitrate).toBeUndefined();
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
  expect(isConfigSupported).toHaveBeenCalledTimes(20);
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

it.each([VideoMp4Codec.AVC, VideoMp4Codec.HEVC])(
  'probes a sufficient level for 4K60 %s instead of hiding a supported codec',
  async (codec) => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => ({
        config,
        supported:
          codec === VideoMp4Codec.AVC
            ? config.codec.endsWith('34')
            : config.codec.includes('.L153.'),
      })),
    });
    const settings = { ...createSettings(codec), width: 3840, height: 2160, fps: 60 };
    const profiles = await getSupportedMp4VideoCodecProfiles(settings, [codec]);
    expect(profiles.map((profile) => profile.codec)).toEqual([codec]);
  }
);

it('falls back to the exact VBR budget when quantizer support is rejected', async () => {
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => ({
      config,
      supported: config.bitrateMode === 'variable',
    })),
  });
  const encoder = await getSupportedMp4VideoEncoder(
    createSettings(VideoMp4Codec.HEVC),
    VideoMp4Codec.HEVC
  );
  expect(encoder.config).toMatchObject({
    bitrate: 8_000_000,
    bitrateMode: 'variable',
    width: 1920,
    height: 1080,
    framerate: 30,
  });
});

it('keeps supported HEVC with identical 1904x1064/30 settings in capability and export probes', async () => {
  const { resolveVideoExportDimensions } =
    await import('../../../../features/video/project/export/output-dimensions');
  const settings = {
    ...createSettings(VideoMp4Codec.HEVC),
    ...resolveVideoExportDimensions(1904, 1064, '1080P'),
    fps: 30,
  };
  const probe = vi.fn(async (config: VideoEncoderConfig) => ({
    config,
    supported:
      config.codec.startsWith('hvc1') &&
      config.width === 1904 &&
      config.height === 1064 &&
      config.framerate === 30,
  }));
  vi.stubGlobal('VideoEncoder', { isConfigSupported: probe });
  const profiles = await getSupportedMp4VideoCodecProfiles(settings);
  expect(profiles.map((p) => p.codec)).toContain(VideoMp4Codec.HEVC);
  const encoder = await getSupportedMp4VideoEncoder(settings, VideoMp4Codec.HEVC);
  expect(encoder.config).toEqual(profiles.find((p) => p.codec === VideoMp4Codec.HEVC)!.config);
  expect(encoder.config).toMatchObject({ width: 1904, height: 1064, framerate: 30 });
  expect(
    await getSupportedMp4VideoCodecProfiles({ ...settings, fps: 40 }, [VideoMp4Codec.HEVC])
  ).toEqual([]);
});
