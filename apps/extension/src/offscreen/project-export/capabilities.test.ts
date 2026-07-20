import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getSupportedMp4VideoCodecProfilesMock } = vi.hoisted(() => ({
  getSupportedMp4VideoCodecProfilesMock: vi.fn(),
}));

vi.mock('./codecs', () => ({
  getSupportedMp4VideoCodecProfiles: getSupportedMp4VideoCodecProfilesMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
import { getProjectExportCapabilities } from './capabilities';

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1920,
  };
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', class MediaRecorderMock {});
  vi.stubGlobal('VideoEncoder', { isConfigSupported: vi.fn() });
  getSupportedMp4VideoCodecProfilesMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('reports MP4 codec availability with AVC-first default priority', async () => {
  getSupportedMp4VideoCodecProfilesMock.mockResolvedValue([
    { codec: VideoMp4Codec.VP9, muxerCodec: 'vp9', label: 'VP9', config: { codec: 'vp09' } },
    { codec: VideoMp4Codec.HEVC, muxerCodec: 'hevc', label: 'HEVC', config: { codec: 'hvc1' } },
    { codec: VideoMp4Codec.AVC, muxerCodec: 'avc', label: 'AVC', config: { codec: 'avc1' } },
  ]);

  const capabilities = await getProjectExportCapabilities(createSettings());

  expect(capabilities.formats).toEqual([
    { format: VideoExportFormat.MP4, available: true },
    { format: VideoExportFormat.WEBM, available: true },
  ]);
  expect(capabilities.defaultMp4VideoCodec).toBe(VideoMp4Codec.AVC);
  expect(capabilities.mp4Codecs).toEqual([
    { codec: VideoMp4Codec.AVC, available: true },
    { codec: VideoMp4Codec.HEVC, available: true },
    { codec: VideoMp4Codec.VP9, available: true },
  ]);
});

it('hides MP4 when no offscreen video encoder is available', async () => {
  vi.stubGlobal('VideoEncoder', undefined);

  const capabilities = await getProjectExportCapabilities(createSettings());

  expect(capabilities.formats).toEqual([
    { format: VideoExportFormat.MP4, available: false },
    { format: VideoExportFormat.WEBM, available: true },
  ]);
  expect(capabilities.defaultMp4VideoCodec).toBeNull();
  expect(capabilities.mp4Codecs).toEqual([
    {
      codec: VideoMp4Codec.AVC,
      available: false,
      reason: 'VIDEO_ENCODER_UNAVAILABLE',
    },
    {
      codec: VideoMp4Codec.HEVC,
      available: false,
      reason: 'VIDEO_ENCODER_UNAVAILABLE',
    },
    {
      codec: VideoMp4Codec.VP9,
      available: false,
      reason: 'VIDEO_ENCODER_UNAVAILABLE',
    },
  ]);
});

it('chooses the first available codec when AVC is missing', async () => {
  getSupportedMp4VideoCodecProfilesMock.mockResolvedValue([
    { codec: VideoMp4Codec.HEVC, muxerCodec: 'hevc', label: 'HEVC', config: { codec: 'hvc1' } },
  ]);

  const capabilities = await getProjectExportCapabilities(createSettings());

  expect(capabilities.defaultMp4VideoCodec).toBe(VideoMp4Codec.HEVC);
  expect(capabilities.formats[0]).toEqual({ format: VideoExportFormat.MP4, available: true });
});
