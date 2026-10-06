import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { measureVideoExportSize } from './export-size';
const configured: VideoEncoderConfig[] = [];
const encoded: VideoEncoderEncodeOptions[] = [];
const close = vi.fn();
const support = vi.fn(async (config: VideoEncoderConfig) => ({ supported: true, config }));
beforeEach(() => {
  configured.length = 0;
  encoded.length = 0;
  close.mockClear();
  support.mockReset().mockImplementation(async (config) => ({ supported: true, config }));
  vi.stubGlobal(
    'EncodedVideoChunk',
    class {
      byteLength = 100;
      type = 'key';
      timestamp: number;
      constructor(init: EncodedVideoChunkInit) {
        this.timestamp = init.timestamp;
      }
    }
  );
  vi.stubGlobal(
    'VideoFrame',
    class {
      displayWidth = 2;
      displayHeight = 2;
      timestamp: number;
      duration = 500000;
      constructor(_data: unknown, init: VideoFrameBufferInit) {
        this.timestamp = init.timestamp;
      }
      close() {}
    }
  );
  vi.stubGlobal(
    'VideoEncoder',
    class {
      static isConfigSupported = support;
      state = 'unconfigured';
      encodeQueueSize = 0;
      constructor(private init: VideoEncoderInit) {}
      configure(config: VideoEncoderConfig) {
        configured.push(config);
        this.state = 'configured';
      }
      encode(frame: VideoFrame, options: VideoEncoderEncodeOptions) {
        encoded.push(options);
        this.init.output(
          new EncodedVideoChunk({
            type: 'key',
            timestamp: frame.timestamp,
            data: new Uint8Array(100),
          }),
          {}
        );
      }
      async flush() {}
      close() {
        this.state = 'closed';
        close();
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());
function fixture(signal = new AbortController().signal) {
  return {
    profile: { codec: 'hevc' as const, width: 2, height: 2, fps: 2, quality: 'HIGH' as const },
    windows: [{ start: 0, end: 1 }],
    duration: 10,
    audioBitrate: 0,
    signal,
    async render(encode: (frame: VideoFrame) => Promise<void>) {
      for (const timestamp of [0, 500000]) {
        const frame = new VideoFrame(new Uint8Array(16), {
          format: 'RGBA',
          codedWidth: 2,
          codedHeight: 2,
          timestamp,
        });
        try {
          await encode(frame);
        } finally {
          frame.close();
        }
      }
    },
  };
}
it('measures actual encoded bytes using the requested dimensions, fps and quality', async () => {
  const result = await measureVideoExportSize(fixture());
  expect(configured[0]).toMatchObject({
    width: 2,
    height: 2,
    framerate: 2,
    bitrateMode: 'quantizer',
  });
  expect(encoded[0]).toMatchObject({ hevc: { quantizer: 20 }, keyFrame: true });
  expect(result.bytes).toBe(6136);
  expect(close).toHaveBeenCalledTimes(1);
});
it('uses VBR only when quantizer is rejected and closes the encoder on render failure', async () => {
  support.mockImplementation(async (config) => ({
    supported: config.bitrateMode === 'variable',
    config,
  }));
  await measureVideoExportSize(fixture());
  expect(configured[0]?.bitrateMode).toBe('variable');
  await expect(
    measureVideoExportSize({
      ...fixture(),
      render: async () => {
        throw new Error('decode failed');
      },
    })
  ).rejects.toThrow('decode failed');
  expect(close).toHaveBeenCalledTimes(2);
});
it('closes immediately on cancellation and rejects stale work', async () => {
  const controller = new AbortController();
  await expect(
    measureVideoExportSize({
      ...fixture(controller.signal),
      render: async () => {
        controller.abort();
      },
    })
  ).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(1);
});

it.each(['avc', 'vp8', 'vp9'] as const)(
  'uses the selected %s quality configuration',
  async (codec) => {
    await measureVideoExportSize({ ...fixture(), profile: { ...fixture().profile, codec } });
    expect(configured[0]?.codec).toMatch(
      codec === 'avc' ? /^avc1/ : codec === 'vp9' ? /^vp09/ : /^vp8/
    );
    if (codec === 'avc') expect(encoded[0]).toMatchObject({ avc: { quantizer: 20 } });
    if (codec === 'vp9') expect(encoded[0]).toMatchObject({ vp9: { quantizer: 24 } });
    if (codec === 'vp8') expect(configured[0]?.bitrateMode).toBe('variable');
  }
);
it('does not create an encoder after support rejection or an aborted capability probe', async () => {
  support.mockResolvedValue({ supported: false, config: { codec: 'hvc1', width: 2, height: 2 } });
  await expect(measureVideoExportSize(fixture())).rejects.toThrow('unavailable');
  expect(close).not.toHaveBeenCalled();
  const controller = new AbortController();
  support.mockImplementation(async () => {
    controller.abort();
    throw new Error('cancelled probe');
  });
  await expect(measureVideoExportSize(fixture(controller.signal))).rejects.toThrow();
  expect(close).not.toHaveBeenCalled();
});
it('rejects frames at the wrong size and closes its encoder', async () => {
  const args = fixture();
  await expect(
    measureVideoExportSize({ ...args, profile: { ...args.profile, width: 4 } })
  ).rejects.toThrow('dimensions changed');
  expect(close).toHaveBeenCalledOnce();
});
