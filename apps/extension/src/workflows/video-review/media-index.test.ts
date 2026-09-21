import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import {
  inspectReviewMedia,
  chooseReviewVideoCodec,
  supportedReviewVideoCodecs,
} from './media-index';

it.each(['avc-aac.mp4', 'hevc-aac.mp4', 'vp8-opus.webm', 'vp9-opus.webm', 'av1-opus.webm'])(
  'indexes independent packets in real %s',
  async (name) => {
    const bytes = await readFile(`tooling/test/e2e/fixtures/review-${name}`);
    const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
    expect(index.boundaries.slice(0, -1)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(index.duration).toBeCloseTo(12, 1);
    expect(index.frameRate).toBeGreaterThan(0);
    expect(index.frameRate).toBeLessThanOrEqual(120);
  }
);
it('probes a container-fitting video encoder for a real indexed file', async () => {
  const bytes = await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm');
  const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
  // Node has no VideoEncoder, so the probe must degrade to null, never throw.
  expect(index.processedVideoCodec).toBeNull();
  expect(await chooseReviewVideoCodec(index.container, { width: 160, height: 90 })).toBeNull();
});
it('excludes every non-IDR recovery point in a real open-GOP stream', async () => {
  const bytes = await readFile('tooling/test/e2e/fixtures/review-avc-open-gop.mp4');
  const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
  expect(index.boundaries).toEqual([0, 12]);
});
it('honors cancellation before opening an input', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(inspectReviewMedia(new Blob(), controller.signal)).rejects.toThrow();
});

it('admits the same AVC level and 60fps configuration as the primary editor', async () => {
  const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => ({
    config,
    supported: config.codec === 'avc1.64002a' && config.framerate === 60,
  }));
  vi.stubGlobal('VideoEncoder', { isConfigSupported });
  try {
    expect(
      await supportedReviewVideoCodecs('mp4', {
        width: 1920,
        height: 1080,
        bitrate: 12_000_000,
        fps: 60,
      })
    ).toContain('avc');
    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'avc1.64002a', framerate: 60, bitrateMode: 'variable' })
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects normalized-away timing and isolates unsupported codec families', async () => {
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: async (config: VideoEncoderConfig) => {
      if (config.codec.startsWith('hvc1')) throw new Error('Unsupported HEVC');
      return {
        supported: true,
        config: config.codec.startsWith('avc1') ? { ...config, framerate: 24 } : config,
      };
    },
  });
  try {
    expect(await supportedReviewVideoCodecs('mp4', { width: 1920, height: 1080, fps: 60 })).toEqual(
      ['vp9']
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
