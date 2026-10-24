import type { AudioEncodingConfig, MediaStreamAudioTrackSourceOptions } from 'mediabunny';
import { vi } from 'vitest';
import { createRecordingStagingCoordinatorTestDouble } from './artifact-session.test-support';
import { createConfigurableVideoStream } from '../multi-source/media-stream.test-support';

const processorInits = vi.hoisted(() => [] as MediaStreamTrackProcessorInit[]);

const MediaStreamAudioTrackSource = vi.hoisted(
  () =>
    class MediaStreamAudioTrackSource {
      static instances: MediaStreamAudioTrackSource[] = [];
      readonly errorPromise = new Promise<never>(() => undefined);
      readonly pause = vi.fn();
      readonly resume = vi.fn();
      constructor(
        readonly track: MediaStreamTrack,
        readonly config: AudioEncodingConfig,
        readonly options: MediaStreamAudioTrackSourceOptions
      ) {
        MediaStreamAudioTrackSource.instances.push(this);
      }
    }
);

const mediabunny = vi.hoisted(() => {
  class StreamTarget {
    readonly writer: WritableStreamDefaultWriter<{ data: Uint8Array; position: number }>;
    constructor(stream: WritableStream<{ data: Uint8Array; position: number }>) {
      this.writer = stream.getWriter();
    }
  }

  class VideoSample {
    static instances: VideoSample[] = [];
    readonly close: ReturnType<typeof vi.fn>;
    constructor(
      readonly frame: VideoFrame,
      readonly init: { duration?: number; timestamp?: number } = {}
    ) {
      this.close = vi.fn(() => {
        if (typeof frame.close === 'function') frame.close();
      });
      VideoSample.instances.push(this);
    }

    readonly transform = vi.fn(async (options: { height: number; width: number }) => {
      const transformedFrame = {
        ...this.frame,
        codedHeight: options.height,
        codedWidth: options.width,
        displayHeight: options.height,
        displayWidth: options.width,
      } as VideoFrame;
      return new VideoSample(transformedFrame, this.init);
    });
  }

  class VideoSampleSource {
    frameRate: number | null = null;
    configured = false;
    readonly add = vi.fn(async (sample: VideoSample, encodeOptions?: VideoEncoderEncodeOptions) => {
      if (!this.configured) {
        this.configured = true;
        const frameRate = Output.encoderFrameRateOverride ?? this.frameRate;
        this.config.onEncoderConfig?.({
          alpha: 'discard',
          bitrate: this.config.bitrate,
          bitrateMode: Output.encoderBitrateMode ?? this.config.bitrateMode,
          codec:
            this.config.fullCodecString ??
            (this.config.codec === 'vp9' ? 'vp09.00.10.08' : 'avc1.640033'),
          contentHint: Output.encoderContentHint ?? this.config.contentHint,
          displayHeight: 1304,
          displayWidth: 2560,
          ...(frameRate === null ? {} : { framerate: frameRate }),
          hardwareAcceleration: this.config.hardwareAcceleration,
          height: 1304,
          latencyMode: this.config.latencyMode,
          width: 2560,
          avc: { format: 'avc' },
        });
      }
      this.config.onEncodedPacket?.({
        byteLength: encodeOptions?.keyFrame ? 100_000 : 2_000,
        duration: sample.init.duration ?? (sample.frame.duration ?? 0) / 1_000_000,
        timestamp: sample.init.timestamp ?? sample.frame.timestamp / 1_000_000,
        type: encodeOptions?.keyFrame ? 'key' : 'delta',
      });
    });
    constructor(
      readonly config: {
        bitrate: number;
        bitrateMode: VideoEncoderBitrateMode;
        codec: string;
        contentHint: string;
        fullCodecString?: string;
        hardwareAcceleration: HardwareAcceleration;
        latencyMode: LatencyMode;
        keyFrameInterval: number;
        onEncodedPacket?(packet: {
          byteLength: number;
          duration: number;
          timestamp: number;
          type: 'delta' | 'key';
        }): void;
        onEncoderConfig?(config: VideoEncoderConfig): void;
      }
    ) {}
  }

  class Output {
    static instances: Output[] = [];
    static encoderFrameRateOverride: number | null = null;
    static encoderBitrateMode: VideoEncoderBitrateMode | null = null;
    static encoderContentHint: string | null = null;
    readonly cancel = vi.fn().mockResolvedValue(undefined);
    readonly finalize = vi.fn(async () => {
      await this.target.writer.close();
    });
    readonly start = vi.fn(async () => {
      await this.target.writer.write({ data: new Uint8Array([1, 2, 3]), position: 0 });
    });
    videoMetadata: { frameRate?: number } | null = null;
    videoSource: VideoSampleSource | null = null;

    constructor(readonly input: { target: StreamTarget }) {
      this.target = input.target;
      Output.instances.push(this);
    }

    readonly target: StreamTarget;

    addVideoTrack(source: VideoSampleSource, metadata: { frameRate?: number } = {}) {
      this.videoSource = source;
      this.videoMetadata = metadata;
      source.frameRate = metadata.frameRate ?? null;
    }

    addAudioTrack() {}
  }

  return {
    StreamTarget,
    MediaStreamAudioTrackSource,
    Mp4OutputFormat: class {},
    Output,
    VideoSample,
    VideoSampleSource,
    WebMOutputFormat: class {},
    canEncodeAudio: vi.fn().mockResolvedValue(true),
    canEncodeVideo: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('mediabunny', () => mediabunny);

import { createLiveRecordingArtifactSession } from './live-artifact-session';
import { RecordingFrameClockObserver } from './recording-frame-clock';

function createStream(audio = false, contentHint = ''): MediaStream {
  const stream = createConfigurableVideoStream({
    hasAudio: audio,
    settings: { frameRate: 60, height: 1304, width: 2560 },
  });
  stream.getVideoTracks()[0]!.contentHint = contentHint;
  return stream;
}

async function createSession(
  options: {
    audio?: boolean;
    frameClockObserver?: RecordingFrameClockObserver;
    container?: 'mp4' | 'webm';
    contentHint?: string;
    exactAvc?: boolean;
    frameTransform?: {
      fit: 'fill';
      outputSize: { height: number; width: number };
      sourceRect: { x: number; y: number; width: number; height: number };
    };
    videoCodec?: 'avc' | 'vp9';
  } = {}
) {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  const stream = createStream(options.audio, options.contentHint);
  const session = await createLiveRecordingArtifactSession({
    artifactId: 'recording-1',
    ...(options.frameClockObserver ? { frameClockObserver: options.frameClockObserver } : {}),
    coordinator,
    encoding: {
      audioBitrate: 128_000,
      audioCodec: options.container === 'webm' ? 'opus' : 'aac',
      container: options.container ?? 'mp4',
      frameRate: 60,
      videoBitrate: 24_000_000,
      videoCodec: options.videoCodec ?? 'avc',
      ...(options.exactAvc ? { videoCodecString: 'avc1.640033' } : {}),
    },
    filename: options.container === 'webm' ? 'recording.webm' : 'recording.mp4',
    ...(options.frameTransform ? { frameTransform: options.frameTransform } : {}),
    mimeType: options.container === 'webm' ? 'video/webm' : 'video/mp4',
    stream,
  });
  return { coordinator, session, stream };
}

function createTestVideoFrame(timestamp: number): VideoFrame {
  return new VideoFrame(new Uint8Array(4), {
    codedHeight: 1,
    codedWidth: 1,
    format: 'RGBA',
    timestamp,
  });
}

export function resetLiveSessionFixture() {
  vi.clearAllMocks();
  mediabunny.Output.instances.length = 0;
  mediabunny.MediaStreamAudioTrackSource.instances.length = 0;
  mediabunny.VideoSample.instances.length = 0;
  mediabunny.Output.encoderFrameRateOverride = null;
  mediabunny.Output.encoderBitrateMode = null;
  mediabunny.Output.encoderContentHint = null;
  processorInits.length = 0;
  vi.stubGlobal(
    'VideoFrame',
    class {
      readonly close = vi.fn();
      readonly displayHeight: number;
      readonly displayWidth: number;
      readonly duration: number | undefined;
      readonly timestamp: number;
      readonly visibleRect: DOMRectReadOnly | undefined;
      constructor(data: Uint8Array | VideoFrame, init: VideoFrameBufferInit | VideoFrameInit) {
        this.timestamp = init.timestamp ?? 0;
        this.duration = init.duration ?? undefined;
        const source = data as VideoFrame;
        this.displayWidth = init.displayWidth ?? source.displayWidth ?? 1;
        this.displayHeight = init.displayHeight ?? source.displayHeight ?? 1;
        this.visibleRect = init.visibleRect
          ? ({
              height: init.visibleRect.height,
              width: init.visibleRect.width,
              x: init.visibleRect.x,
              y: init.visibleRect.y,
            } as DOMRectReadOnly)
          : (source.visibleRect ?? undefined);
      }
    }
  );
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn().mockResolvedValue({ config: {}, supported: true }),
  });
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readonly readable = new ReadableStream<VideoFrame>({
        start(controller) {
          controller.enqueue(createTestVideoFrame(0));
          controller.enqueue(createTestVideoFrame(16_667));
        },
      });
      constructor(init: MediaStreamTrackProcessorInit) {
        processorInits.push(init);
      }
    }
  );
}

export { mediabunny, processorInits, createSession, createStream, createTestVideoFrame };
