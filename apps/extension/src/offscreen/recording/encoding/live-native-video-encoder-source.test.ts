import { beforeEach, describe, expect, it, vi } from 'vitest';

const packetAdds = vi.hoisted(() => [] as Array<{ metadata: unknown; packet: unknown }>);

vi.mock('mediabunny', () => ({
  EncodedPacket: class {
    static fromEncodedChunk(chunk: EncodedVideoChunk) {
      return {
        byteLength: chunk.byteLength,
        clone: vi.fn(function (this: unknown) {
          return this;
        }),
        duration: (chunk.duration ?? 0) / 1_000_000,
        timestamp: chunk.timestamp / 1_000_000,
        type: chunk.type,
      };
    }
  },
  EncodedVideoPacketSource: class {
    readonly add = vi.fn(async (packet: unknown, metadata: unknown) => {
      packetAdds.push({ metadata, packet });
    });
  },
  VideoSample: class {
    readonly duration: number;
    readonly timestamp: number;
    constructor(
      private readonly frame: VideoFrame,
      init: { duration: number; timestamp: number }
    ) {
      this.duration = init.duration;
      this.timestamp = init.timestamp;
    }
    toVideoFrame() {
      return this.frame;
    }
  },
}));

import { VideoSample } from 'mediabunny';
import { LiveNativeVideoEncoderSource } from './live-native-video-encoder-source';

const encoderInstances: Array<{
  config: VideoEncoderConfig | null;
  frames: Array<{ frame: VideoFrame; options: VideoEncoderEncodeOptions | undefined }>;
  init: VideoEncoderInit;
}> = [];
const encoderObjects: Array<{ encodeQueueSize: number; init: VideoEncoderInit }> = [];
const videoFrameClones: Array<{
  init: VideoFrameBufferInit | VideoFrameInit;
  source: AllowSharedBufferSource | VideoFrame;
}> = [];

beforeEach(() => {
  encoderInstances.length = 0;
  encoderObjects.length = 0;
  packetAdds.length = 0;
  videoFrameClones.length = 0;
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
      readonly duration: number | null;
      readonly timestamp: number;
      constructor(
        source: AllowSharedBufferSource | VideoFrame,
        init: VideoFrameBufferInit | VideoFrameInit
      ) {
        this.duration = init.duration ?? null;
        this.timestamp = init.timestamp ?? 0;
        videoFrameClones.push({ init, source });
      }
    }
  );
  vi.stubGlobal(
    'EncodedVideoChunk',
    class {
      readonly byteLength: number;
      readonly duration: number | null;
      readonly timestamp: number;
      readonly type: EncodedVideoChunkType;
      constructor(init: EncodedVideoChunkInit) {
        this.byteLength = ArrayBuffer.isView(init.data)
          ? init.data.byteLength
          : init.data.byteLength;
        this.duration = init.duration ?? null;
        this.timestamp = init.timestamp;
        this.type = init.type;
      }
    }
  );
  vi.stubGlobal(
    'VideoEncoder',
    class {
      readonly state = 'configured';
      encodeQueueSize = 0;
      private readonly stateRecord: {
        config: VideoEncoderConfig | null;
        frames: Array<{ frame: VideoFrame; options: VideoEncoderEncodeOptions | undefined }>;
        init: VideoEncoderInit;
      };
      constructor(readonly init: VideoEncoderInit) {
        this.stateRecord = {
          config: null,
          frames: [],
          init,
        };
        encoderInstances.push(this.stateRecord);
        encoderObjects.push(this);
      }
      configure(config: VideoEncoderConfig) {
        this.stateRecord.config = config;
      }
      encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
        this.stateRecord.frames.push({ frame, options });
        const bytes = new Uint8Array([1, 2, 3]);
        this.init.output(
          new EncodedVideoChunk({
            data: bytes,
            ...(frame.duration === null ? {} : { duration: frame.duration }),
            timestamp: frame.timestamp,
            type: options?.keyFrame ? 'key' : 'delta',
          }),
          {
            decoderConfig: {
              codec: 'vp09.00.50.08',
              codedHeight: 1080,
              codedWidth: 2120,
              colorSpace: {
                fullRange: false,
                matrix: 'bt709',
                primaries: 'bt709',
                transfer: 'bt709',
              },
            },
          }
        );
      }
      async flush() {}
      close() {}
      addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === 'function') listener(new Event('dequeue'));
        else listener.handleEvent(new Event('dequeue'));
      }
    }
  );
});

describe('native live video encoder source', () => {
  it('downscales the original YUV frame in WebCodecs without a canvas RGB roundtrip', async () => {
    const sourceFrame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });
    const encodedPackets = vi.fn();
    const source = new LiveNativeVideoEncoderSource({
      encoderConfig: {
        alpha: 'discard',
        bitrate: 8_000_000,
        bitrateMode: 'constant',
        codec: 'vp09.00.50.08',
        contentHint: 'text',
        displayHeight: 1080,
        displayWidth: 2120,
        framerate: 30,
        hardwareAcceleration: 'no-preference',
        height: 1080,
        latencyMode: 'quality',
        width: 2120,
      },
      keyFrameInterval: 4,
      onEncodedPacket: encodedPackets,
      sourceRect: { height: 1304, width: 2560, x: 0, y: 0 },
      videoCodec: 'vp9',
    });
    const sample = new VideoSample(sourceFrame, { duration: 1 / 30, timestamp: 0 });

    await source.add(sample);
    await source.finalize();

    expect(encoderInstances[0]?.config).toEqual(
      expect.objectContaining({ height: 1080, width: 2120 })
    );
    expect(videoFrameClones.at(-1)).toEqual({
      init: {
        duration: 33_333,
        timestamp: 0,
        visibleRect: { height: 1304, width: 2560, x: 0, y: 0 },
      },
      source: sourceFrame,
    });
    expect(encoderInstances[0]?.frames[0]?.options).toEqual({ keyFrame: true });
    expect(packetAdds).toHaveLength(1);
    expect(encodedPackets).toHaveBeenCalledOnce();
  });

  it('keeps a long GOP and requests periodic keyframes without duplicating source frames', async () => {
    const source = new LiveNativeVideoEncoderSource({
      encoderConfig: {
        codec: 'vp09.00.40.08',
        height: 1080,
        width: 1920,
      },
      keyFrameInterval: 4,
      onEncodedPacket: vi.fn(),
      sourceRect: { height: 1080, width: 1920, x: 0, y: 0 },
      videoCodec: 'vp9',
    });
    const frame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });

    await source.add(new VideoSample(frame, { duration: 1 / 30, timestamp: 0 }));
    await source.add(new VideoSample(frame, { duration: 0, timestamp: 1 }));
    encoderObjects[0]!.encodeQueueSize = 4;
    await source.add(new VideoSample(frame, { duration: 1 / 30, timestamp: 4 }));
    await source.finalize();
    await source.finalize();

    expect(encoderInstances[0]?.frames.map(({ options }) => options)).toEqual([
      { keyFrame: true },
      { keyFrame: false },
      { keyFrame: true },
    ]);
    expect(packetAdds).toHaveLength(3);
  });

  it('surfaces muxer write failure and rejects further use after close', async () => {
    const source = new LiveNativeVideoEncoderSource({
      encoderConfig: { codec: 'vp09.00.40.08', height: 1080, width: 1920 },
      keyFrameInterval: 4,
      onEncodedPacket: vi.fn(),
      sourceRect: { height: 1080, width: 1920, x: 0, y: 0 },
      videoCodec: 'vp9',
    });
    vi.mocked(source.packetSource.add).mockRejectedValueOnce(new Error('mux failed'));
    const frame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });

    await expect(
      source.add(new VideoSample(frame, { duration: 1 / 30, timestamp: 0 }))
    ).rejects.toThrow('mux failed');
    source.close();
    source.close();
    await expect(
      source.add(new VideoSample(frame, { duration: 1 / 30, timestamp: 1 }))
    ).rejects.toThrow('closed');
  });

  it('surfaces asynchronous encoder failure before accepting another frame', async () => {
    const source = new LiveNativeVideoEncoderSource({
      encoderConfig: { codec: 'vp09.00.40.08', height: 1080, width: 1920 },
      keyFrameInterval: 4,
      onEncodedPacket: vi.fn(),
      sourceRect: { height: 1080, width: 1920, x: 0, y: 0 },
      videoCodec: 'vp9',
    });
    encoderObjects[0]!.init.error(new DOMException('encoder failed', 'EncodingError'));
    const frame = new VideoFrame(new Uint8Array(4), {
      codedHeight: 1,
      codedWidth: 1,
      format: 'RGBA',
      timestamp: 0,
    });

    await expect(
      source.add(new VideoSample(frame, { duration: 1 / 30, timestamp: 0 }))
    ).rejects.toThrow('encoder failed');
    source.close();
  });
});
