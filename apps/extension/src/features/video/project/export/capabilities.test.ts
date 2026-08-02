import { expect, it } from 'vitest';

import {
  createVideoExportCapabilities,
  getAvailableMp4VideoCodecs,
  getDefaultMp4VideoCodec,
  mergeVideoProjectExportSettings,
  normalizeVideoProjectExportSettings,
} from './capabilities';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  VideoWebmCodec,
  type VideoProjectExportSettings,
} from '../types/index';

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 1920,
  };
}

it('derives MP4 codec availability and default priority from export capabilities', () => {
  const capabilities = createVideoExportCapabilities({
    formats: [
      { format: VideoExportFormat.MP4, available: true },
      { format: VideoExportFormat.WEBM, available: true },
    ],
    mp4Codecs: [
      { codec: VideoMp4Codec.VP9, available: true },
      { codec: VideoMp4Codec.HEVC, available: true },
      { codec: VideoMp4Codec.AVC, available: false, reason: 'CODEC_UNSUPPORTED' },
    ],
  });

  expect(getAvailableMp4VideoCodecs(capabilities)).toEqual([VideoMp4Codec.VP9, VideoMp4Codec.HEVC]);
  expect(getDefaultMp4VideoCodec(capabilities.mp4Codecs)).toBe(VideoMp4Codec.HEVC);
  expect(capabilities.defaultMp4VideoCodec).toBe(VideoMp4Codec.HEVC);
});

it('normalizes selected codec against capability-aware MP4 defaults', () => {
  const settings = createSettings();
  const capabilities = createVideoExportCapabilities({
    formats: [
      { format: VideoExportFormat.MP4, available: true },
      { format: VideoExportFormat.WEBM, available: true },
    ],
    mp4Codecs: [
      { codec: VideoMp4Codec.AVC, available: false, reason: 'CODEC_UNSUPPORTED' },
      { codec: VideoMp4Codec.HEVC, available: true },
      { codec: VideoMp4Codec.VP9, available: true },
    ],
  });

  expect(normalizeVideoProjectExportSettings(settings, capabilities)).toMatchObject({
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.HEVC,
  });
});

it('drops MP4 codec state when MP4 is unavailable or not selected', () => {
  const settings = createSettings();

  expect(mergeVideoProjectExportSettings(settings, { format: VideoExportFormat.WEBM })).toEqual({
    format: VideoExportFormat.WEBM,
    resolution: 'SOURCE' as const,
    downloadAfterExport: true,
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.MEDIUM,
    webmVideoCodec: VideoWebmCodec.VP9,
    width: 1920,
  });

  expect(
    normalizeVideoProjectExportSettings(
      settings,
      createVideoExportCapabilities({
        formats: [
          { format: VideoExportFormat.MP4, available: false },
          { format: VideoExportFormat.WEBM, available: true },
        ],
        mp4Codecs: [{ codec: VideoMp4Codec.AVC, available: false, reason: 'CODEC_UNSUPPORTED' }],
      })
    )
  ).toEqual({
    format: VideoExportFormat.WEBM,
    resolution: 'SOURCE' as const,
    downloadAfterExport: true,
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.MEDIUM,
    webmVideoCodec: VideoWebmCodec.VP9,
    width: 1920,
  });
});
