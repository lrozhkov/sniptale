import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveReviewOutputProfile } from './render-settings';
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
      expect.objectContaining({ codec: 'avc1.64002a', framerate: 60, bitrateMode: 'quantizer' })
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

it('retains HEVC with the exact VBR fallback when quantizer mode is unavailable', async () => {
  const probe = vi.fn(async (config: VideoEncoderConfig) => ({
    config,
    supported: config.codec.startsWith('hvc1') && config.bitrateMode === 'variable',
  }));
  vi.stubGlobal('VideoEncoder', { isConfigSupported: probe });
  try {
    expect(
      await supportedReviewVideoCodecs('mp4', {
        width: 1920,
        height: 1080,
        fps: 30,
        bitrate: 8_000_000,
      })
    ).toEqual(['hevc']);
    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'hvc1.1.6.L123.B0',
        bitrate: 8_000_000,
        bitrateMode: 'variable',
      })
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it('uses measured source FPS for the initial encoder capability probe', async () => {
  const probe = vi.fn(async (config: VideoEncoderConfig) => ({ config, supported: true }));
  vi.stubGlobal('VideoEncoder', { isConfigSupported: probe });
  try {
    const bytes = await readFile('tooling/test/e2e/fixtures/review-avc-aac.mp4');
    const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
    expect(probe).toHaveBeenCalled();
    for (const [config] of probe.mock.calls) expect(config.framerate).toBe(index.frameRate);
  } finally {
    vi.unstubAllGlobals();
  }
});

/** Retimes real compressed AVC packets without depending on browser encoders. */
async function videoAtPacketRate(rate: number) {
  const bytes = await readFile('tooling/test/e2e/fixtures/review-avc-aac.mp4');
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const decoderConfig = (await track.getDecoderConfig())!;
    const target = new BufferTarget();
    const output = new Output({ target, format: new Mp4OutputFormat() });
    const source = new EncodedVideoPacketSource(track.codec!);
    output.addVideoTrack(source);
    await output.start();
    let frame = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      await source.add(packet.clone({ timestamp: frame++ / rate, duration: 1 / rate }), {
        decoderConfig,
      });
    }
    source.close();
    await output.finalize();
    return new Blob([target.buffer!]);
  } finally {
    input.dispose();
  }
}

it.each([30000 / 1001, 60000 / 1001, 29.83])(
  'preserves measured fractional packet rate %s through ingestion and Current output',
  async (rate) => {
    const probe = vi.fn(async (config: VideoEncoderConfig) => ({ config, supported: true }));
    vi.stubGlobal('VideoEncoder', { isConfigSupported: probe });
    try {
      const file = await videoAtPacketRate(rate);
      const index = await inspectReviewMedia(file, new AbortController().signal);
      expect(index.frameRate).toBeCloseTo(rate, 3);
      expect(Number.isInteger(index.frameRate)).toBe(false);
      for (const [config] of probe.mock.calls) expect(config.framerate).toBe(index.frameRate);
      const profile = resolveReviewOutputProfile(index, createQuickEditAdvancedState());
      expect(Math.abs(profile.fps - index.frameRate!)).toBeLessThanOrEqual(1e-9);
      expect(profile.fps).toBe(profile.rate.numerator / profile.rate.denominator);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it.each([
  [0.5, 1],
  [150, 120],
])('bounds measured packet rate %s to %s', async (rate, expected) => {
  const file = await videoAtPacketRate(rate);
  expect((await inspectReviewMedia(file, new AbortController().signal)).frameRate).toBe(expected);
});
