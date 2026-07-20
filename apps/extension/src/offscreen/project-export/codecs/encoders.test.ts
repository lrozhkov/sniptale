import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import {
  ensureMp4ExportSupport,
  getSupportedMp4AudioEncoder,
  getSupportedMp4VideoCodecProfiles,
  getSupportedMp4VideoEncoder,
} from './encoders/index';
import { VideoExportQualityPreset, VideoMp4Codec } from '../../../features/video/project/types';
import { MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC } from './constants';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('requires video and optional audio encoder support before MP4 export starts', () => {
  vi.stubGlobal('VideoEncoder', undefined);
  expect(() => ensureMp4ExportSupport(false)).toThrow('offscreenExport.videoEncoderUnavailable');

  vi.stubGlobal('VideoEncoder', class VideoEncoderMock {});
  vi.stubGlobal('AudioEncoder', undefined);
  expect(() => ensureMp4ExportSupport(true)).toThrow('offscreenExport.audioEncoderUnavailable');
});

it('selects supported MP4 video and audio encoder candidates', async () => {
  const videoSupportMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('probe failed'))
    .mockResolvedValueOnce({ supported: true, config: { codec: 'avc1.640028' } });
  const audioSupportMock = vi.fn().mockResolvedValueOnce({
    supported: true,
    config: { codec: 'mp4a.40.2' },
  });

  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: videoSupportMock,
  });
  vi.stubGlobal('AudioEncoder', {
    isConfigSupported: audioSupportMock,
  });

  const videoEncoder = await getSupportedMp4VideoEncoder(
    {
      width: 1920,
      height: 1080,
      fps: 30,
      quality: VideoExportQualityPreset.BALANCED,
    } as never,
    VideoMp4Codec.AVC
  );
  const audioEncoder = await getSupportedMp4AudioEncoder({
    sampleRate: 48_000,
    numberOfChannels: 2,
  });

  expect(videoEncoder.config).toEqual({ codec: 'avc1.640028' });
  expect(audioEncoder.config).toEqual({ codec: 'mp4a.40.2' });
  expect(videoEncoder.muxerCodec).toBe('avc');
  expect(audioEncoder.muxerCodec).toBe('aac');
});

it('reports missing MP4 encoders when all probe candidates fail', async () => {
  const unsupportedMock = vi.fn().mockResolvedValue({ supported: false });

  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: unsupportedMock,
  });
  vi.stubGlobal('AudioEncoder', {
    isConfigSupported: unsupportedMock,
  });

  await expect(
    getSupportedMp4VideoEncoder(
      {
        width: 1920,
        height: 1080,
        fps: 30,
        quality: VideoExportQualityPreset.BALANCED,
      } as never,
      VideoMp4Codec.AVC
    )
  ).rejects.toThrow('offscreenExport.supportedVideoEncoderMissingPrefix');

  await expect(
    getSupportedMp4AudioEncoder({
      sampleRate: 48_000,
      numberOfChannels: 2,
    })
  ).rejects.toThrow('offscreenExport.supportedAudioEncoderMissingPrefix');
});

it('collects only codec families that pass support probing', async () => {
  const videoSupportMock = vi.fn(async (config: VideoEncoderConfig) => ({
    supported: config.codec.startsWith('hvc1') || config.codec.startsWith('vp09'),
    config,
  }));

  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: videoSupportMock,
  });

  const profiles = await getSupportedMp4VideoCodecProfiles({
    width: 1920,
    height: 1080,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
  } as never);

  expect(profiles.map((profile) => profile.codec)).toEqual([VideoMp4Codec.HEVC, VideoMp4Codec.VP9]);
  expect(profiles.map((profile) => profile.muxerCodec)).toEqual(['hevc', 'vp9']);
});

it('skips codec families that throw during capability probing when collecting profiles', async () => {
  const videoSupportMock = vi.fn(async (config: VideoEncoderConfig) => {
    if (config.codec.startsWith('avc1')) {
      throw new Error('avc probe failed');
    }
    return {
      supported: config.codec.startsWith('hvc1'),
      config,
    };
  });

  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: videoSupportMock,
  });

  const profiles = await getSupportedMp4VideoCodecProfiles({
    width: 1920,
    height: 1080,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
  } as never);

  expect(profiles).toHaveLength(1);
  expect(profiles[0]?.codec).toBe(VideoMp4Codec.HEVC);
});

it('throws a deterministic missing-codec error when the selected codec has no candidates left', async () => {
  const originalCandidates = MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC[VideoMp4Codec.AVC];

  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn(),
  });
  (MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC as Record<string, unknown>)[VideoMp4Codec.AVC] = [];

  await expect(
    getSupportedMp4VideoEncoder(
      {
        width: 1920,
        height: 1080,
        fps: 30,
        quality: VideoExportQualityPreset.BALANCED,
      } as never,
      VideoMp4Codec.AVC
    )
  ).rejects.toThrow('offscreenExport.supportedVideoEncoderMissingPrefix');

  (MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC as Record<string, unknown>)[VideoMp4Codec.AVC] =
    originalCandidates;
});
