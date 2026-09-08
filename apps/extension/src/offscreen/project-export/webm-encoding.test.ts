import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoProjectExportSettings } from '../../features/video/project/types';
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  audio: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  start: vi.fn(),
  configure: vi.fn(),
  flush: vi.fn(),
  close: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  AudioBufferSource: class {
    add = mocks.audio;
  },
  BufferTarget: class {
    buffer = new ArrayBuffer(4);
  },
  EncodedPacket: {
    fromEncodedChunk: (chunk: EncodedVideoChunk) => ({ timestamp: chunk.timestamp / 1e6 }),
  },
  EncodedVideoPacketSource: class {
    add = mocks.add;
  },
  Output: class {
    state = 'started';
    target = { buffer: new ArrayBuffer(4) };
    addVideoTrack() {}
    addAudioTrack() {}
    start = mocks.start;
    async finalize() {
      await mocks.finalize();
      this.state = 'finalized';
    }
    cancel = mocks.cancel;
  },
  WebMOutputFormat: class {},
}));
vi.mock('./codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codecs')>()),
  resolveExportTargetBitrate: () => 2_000_000,
  closeEncoderQuietly: (encoder: VideoEncoder) => encoder.close(),
}));
import { createWebmEncoding } from './webm-encoding';
let callbacks: VideoEncoderInit;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'VideoEncoder',
    class {
      constructor(init: VideoEncoderInit) {
        callbacks = init;
      }
      configure = mocks.configure;
      flush = mocks.flush;
      close = mocks.close;
    }
  );
});
afterEach(() => vi.unstubAllGlobals());
const settings = {
  width: 1280,
  height: 720,
  fps: 30,
  webmVideoCodec: 'VP9',
} as VideoProjectExportSettings;
it('preserves encoded project timestamps and muxes the offline audio buffer', async () => {
  const pipeline = await createWebmEncoding(settings, true);
  callbacks.output({ timestamp: 2_000_000 } as EncodedVideoChunk, {});
  const buffer = { duration: 8 } as AudioBuffer;
  expect((await pipeline.finish(buffer)).type).toBe('video/webm');
  expect(mocks.add).toHaveBeenCalledWith({ timestamp: 2 }, {});
  expect(mocks.audio).toHaveBeenCalledWith(buffer);
  await pipeline.dispose();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('surfaces asynchronous muxing errors and cancels unfinished output', async () => {
  const pipeline = await createWebmEncoding(settings, false);
  mocks.add.mockRejectedValueOnce(new Error('mux failed'));
  callbacks.output({ timestamp: 0 } as EncodedVideoChunk, {});
  await expect(pipeline.finish()).rejects.toThrow('mux failed');
  await pipeline.dispose();
  expect(mocks.cancel).toHaveBeenCalledOnce();
});
it('releases resources when encoder configuration fails', async () => {
  mocks.configure.mockImplementationOnce(() => {
    throw new Error('unsupported');
  });
  await expect(createWebmEncoding(settings, false)).rejects.toThrow('unsupported');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.cancel).toHaveBeenCalledOnce();
});
it('surfaces native encoder failures', async () => {
  const pipeline = await createWebmEncoding(settings, false);
  callbacks.error(new DOMException('encode failed'));
  expect(() => pipeline.check()).toThrow('encode failed');
  await pipeline.dispose();
});
