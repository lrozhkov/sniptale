import {
  EncodedPacket,
  EncodedVideoPacketSource,
  type VideoCodec,
  type VideoSample,
} from 'mediabunny';

interface LiveNativeVideoEncoderSourceInput {
  encoderConfig: VideoEncoderConfig;
  keyFrameInterval: number;
  onEncodedPacket(packet: EncodedPacket, metadata?: EncodedVideoChunkMetadata): void;
  sourceRect: Readonly<{ height: number; width: number; x: number; y: number }>;
  videoCodec: VideoCodec;
}

interface ExactSampleTiming {
  duration: number;
  timestamp: number;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Owns WebCodecs-native crop and scale for screen frames. The source stays in its Chromium YUV
 * representation until VideoEncoder consumes it, avoiding the lossy YUV -> canvas RGB -> YUV
 * roundtrip used by raster transforms.
 */
export class LiveNativeVideoEncoderSource {
  readonly packetSource: EncodedVideoPacketSource;
  private readonly encoder: VideoEncoder;
  private readonly exactTimings = new Map<number, ExactSampleTiming>();
  private encoderError: Error | null = null;
  private lastKeyFrameInterval = -1;
  private packetWrite: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly input: LiveNativeVideoEncoderSourceInput) {
    this.packetSource = new EncodedVideoPacketSource(input.videoCodec);
    const stack = new Error('Native live video encoding error').stack;
    this.encoder = new VideoEncoder({
      error: (error) => {
        if (stack) error.stack = stack;
        this.encoderError ??= error;
      },
      output: (chunk, metadata) => this.handleEncodedChunk(chunk, metadata),
    });
    this.encoder.configure(input.encoderConfig);
  }

  async add(sample: VideoSample, encodeOptions?: VideoEncoderEncodeOptions): Promise<void> {
    this.throwIfUnavailable();
    const sourceFrame = sample.toVideoFrame();
    const timestamp = Math.trunc(sample.timestamp * 1_000_000);
    const duration = Math.trunc(sample.duration * 1_000_000);
    this.exactTimings.set(timestamp, {
      duration: sample.duration,
      timestamp: sample.timestamp,
    });
    const frame = new VideoFrame(sourceFrame, {
      ...(duration > 0 ? { duration } : {}),
      timestamp,
      visibleRect: this.input.sourceRect,
    });
    sourceFrame.close();
    try {
      const interval = Math.floor(sample.timestamp / this.input.keyFrameInterval);
      const keyFrame = encodeOptions?.keyFrame ?? interval !== this.lastKeyFrameInterval;
      this.lastKeyFrameInterval = interval;
      this.encoder.encode(frame, { ...encodeOptions, keyFrame });
    } finally {
      frame.close();
    }
    if (this.encoder.encodeQueueSize >= 4) {
      await new Promise<void>((resolve) => {
        this.encoder.addEventListener('dequeue', () => resolve(), { once: true });
      });
    }
    await this.packetWrite;
    this.throwIfUnavailable();
  }

  async finalize(): Promise<void> {
    if (this.closed) return;
    try {
      this.throwIfEncoderFailed();
      await this.encoder.flush();
      await this.packetWrite;
      this.throwIfEncoderFailed();
    } finally {
      this.close();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.encoder.state !== 'closed') this.encoder.close();
    this.exactTimings.clear();
  }

  private handleEncodedChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
    let packet = EncodedPacket.fromEncodedChunk(chunk);
    const exactTiming = this.exactTimings.get(chunk.timestamp);
    if (exactTiming) {
      this.exactTimings.delete(chunk.timestamp);
      packet = packet.clone(exactTiming);
    }
    this.input.onEncodedPacket(packet, metadata);
    this.packetWrite = this.packetWrite
      .then(() => this.packetSource.add(packet, metadata))
      .catch((error: unknown) => {
        this.encoderError ??= toError(error);
      });
  }

  private throwIfUnavailable(): void {
    if (this.closed) throw new Error('Native live video encoder is closed.');
    this.throwIfEncoderFailed();
  }

  private throwIfEncoderFailed(): void {
    if (this.encoderError) throw this.encoderError;
  }
}
