import { expect, it } from 'vitest';
import { VideoExportQualityPreset, VideoMp4Codec } from '../../../features/video/project/types';
import { scaleBitrate } from './bitrate';

it('scales bitrate by the export size and falls back to the balanced preset', () => {
  const balanced = scaleBitrate(VideoExportQualityPreset.BALANCED, 1920, 1080);
  const fallback = scaleBitrate('unknown' as never, 1920, 1080);

  expect(balanced).toBeGreaterThan(0);
  expect(fallback).toBe(balanced);
});

it('uses codec-specific bitrate ladders for the same quality preset', () => {
  const avc = scaleBitrate(VideoExportQualityPreset.BALANCED, 1920, 1080, VideoMp4Codec.AVC);
  const hevc = scaleBitrate(VideoExportQualityPreset.BALANCED, 1920, 1080, VideoMp4Codec.HEVC);
  const vp9 = scaleBitrate(VideoExportQualityPreset.BALANCED, 1920, 1080, VideoMp4Codec.VP9);

  expect(avc).toBeGreaterThan(vp9);
  expect(vp9).toBeGreaterThan(hevc);
});
