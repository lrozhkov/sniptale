import { expect, it } from 'vitest';
import {
  getVideoExportQuantizer,
  getVideoExportConfigCandidates,
  supportsVideoExportConfig,
  getProjectExportFrameOptions,
} from './encoding-quality';

const base: VideoEncoderConfig = {
  codec: 'avc1.640028',
  width: 1920,
  height: 1080,
  framerate: 30,
  bitrate: 8_000_000,
  bitrateMode: 'variable',
};
it('offers quality control without changing the pixel rate, then the original VBR budget', () => {
  const [quality, fallback] = getVideoExportConfigCandidates(base);
  expect(quality).toEqual({
    ...base,
    bitrate: undefined,
    bitrateMode: 'quantizer',
    latencyMode: 'quality',
  });
  expect(fallback).toEqual({ ...base, latencyMode: 'quality' });
  expect(getVideoExportConfigCandidates({ ...base, codec: 'vp8' })).toEqual([
    { ...base, codec: 'vp8', latencyMode: 'quality' },
  ]);
});
it('rejects unsupported or normalized-away rate control and timing', () => {
  const requested = getVideoExportConfigCandidates(base)[0]!;
  expect(supportsVideoExportConfig(requested, { supported: true, config: requested })).toBe(true);
  for (const patch of [
    { bitrateMode: 'variable' as const },
    { framerate: 24 },
    { width: 1280 },
    { bitrate: 8_000_000 },
  ]) {
    expect(
      supportsVideoExportConfig(requested, { supported: true, config: { ...requested, ...patch } })
    ).toBe(false);
  }
  expect(supportsVideoExportConfig(requested, { supported: false, config: requested })).toBe(false);
});
it.each(['avc', 'hevc', 'vp9'])(
  'keeps %s quality levels ordered and gives HIGH its calibrated quantizer',
  (codec) => {
    const levels = (['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const).map((q) =>
      getVideoExportQuantizer(codec, q)
    );
    expect(levels).toEqual([...levels].sort((a, b) => b! - a!));
    expect(levels[2]).toBe(codec === 'vp9' ? 24 : 20);
  }
);
it('supplies codec-specific per-frame controls and leaves VP8 on bitrate control', () => {
  const common = {
    fps: 30,
    width: 1920,
    height: 1080,
    quality: 'HIGH' as const,
    resolution: 'SOURCE' as const,
    downloadAfterExport: false,
  };
  expect(getProjectExportFrameOptions({ ...common, format: 'MP4', mp4VideoCodec: 'AVC' })).toEqual({
    avc: { quantizer: 20 },
  });
  expect(getProjectExportFrameOptions({ ...common, format: 'MP4', mp4VideoCodec: 'HEVC' })).toEqual(
    { hevc: { quantizer: 20 } }
  );
  expect(
    getProjectExportFrameOptions({ ...common, format: 'WEBM', webmVideoCodec: 'VP9' })
  ).toEqual({ vp9: { quantizer: 24 } });
  expect(
    getProjectExportFrameOptions({ ...common, format: 'WEBM', webmVideoCodec: 'VP8' })
  ).toEqual({});
});
