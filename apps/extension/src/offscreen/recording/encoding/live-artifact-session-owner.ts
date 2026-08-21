import {
  AppendOnlyStreamTarget,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
  WebMOutputFormat,
  canEncodeAudio,
  type AudioCodec,
  type OutputFormat,
  type VideoCodec,
} from 'mediabunny';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingArtifactWriter,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';

type LiveArtifactSessionPhase =
  | 'ready'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'finalizing'
  | 'finalized'
  | 'failed'
  | 'aborted';

export interface LiveRecordingEncodingConfig {
  audioBitrate: number;
  audioCodec: AudioCodec;
  container: 'mp4' | 'webm';
  frameRate: number;
  videoBitrate: number;
  videoCodec: VideoCodec;
  videoCodecString?: string;
}

interface LiveRecordingArtifactLifecycleCallbacks {
  onFailure?(error: Error): void;
  onStart?(): void;
  onStop?(artifact: FinalizedRecordingStagingArtifact): Promise<void> | void;
}

export interface LiveRecordingArtifactSession {
  readonly state: RecordingState;
  abort(): Promise<void>;
  pause(): void;
  resume(): void;
  setLifecycleCallbacks(callbacks: LiveRecordingArtifactLifecycleCallbacks): void;
  start(): void;
  stop(): Promise<FinalizedRecordingStagingArtifact>;
}

interface CreateLiveRecordingArtifactSessionOwnerInput {
  artifactId: string;
  coordinator: RecordingStagingCoordinator;
  encoding: LiveRecordingEncodingConfig;
  frameCrop?: { x: number; y: number; width: number; height: number };
  stream: MediaStream;
  writer: RecordingStagingArtifactWriter;
}

type LiveEncoderContentHint = 'detail' | 'motion' | 'text';

const logger = createLogger({ namespace: 'LiveRecordingArtifactSession' });

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function describeVideoFrame(frame: VideoFrame) {
  return {
    codedHeight: frame.codedHeight,
    codedWidth: frame.codedWidth,
    displayHeight: frame.displayHeight,
    displayWidth: frame.displayWidth,
    format: frame.format,
    visibleRect: frame.visibleRect
      ? {
          height: frame.visibleRect.height,
          width: frame.visibleRect.width,
          x: frame.visibleRect.x,
          y: frame.visibleRect.y,
        }
      : null,
  };
}

function createOutputFormat(container: 'mp4' | 'webm'): OutputFormat {
  return container === 'mp4'
    ? new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 })
    : new WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 1 });
}

function resolveLiveEncoderContentHint(track: MediaStreamVideoTrack): LiveEncoderContentHint {
  const hint = track.contentHint;
  return hint === 'motion' || hint === 'text' || hint === 'detail' ? hint : 'detail';
}

function buildExactVideoEncoderConfig(
  input: CreateLiveRecordingArtifactSessionOwnerInput,
  dimensions: { height: number; width: number },
  contentHint: LiveEncoderContentHint
): VideoEncoderConfig | null {
  if (!input.encoding.videoCodecString) return null;
  return {
    alpha: 'discard',
    bitrate: input.encoding.videoBitrate,
    bitrateMode: 'constant',
    codec: input.encoding.videoCodecString,
    contentHint,
    displayHeight: dimensions.height,
    displayWidth: dimensions.width,
    framerate: input.encoding.frameRate,
    hardwareAcceleration: 'no-preference',
    height: dimensions.height,
    latencyMode: 'quality',
    width: dimensions.width,
    ...(input.encoding.videoCodec === 'avc' ? { avc: { format: 'avc' as const } } : {}),
  };
}

function resolveEncodingDimensions(input: CreateLiveRecordingArtifactSessionOwnerInput): {
  height: number;
  width: number;
} {
  if (input.frameCrop) {
    return { height: input.frameCrop.height, width: input.frameCrop.width };
  }
  const [videoTrack] = input.stream.getVideoTracks();
  if (!videoTrack) throw new Error('Live recording stream has no video track.');
  const videoSettings = videoTrack.getSettings();
  if (!videoSettings.width || !videoSettings.height) {
    throw new Error('Live recording video dimensions are unavailable.');
  }
  return { height: videoSettings.height, width: videoSettings.width };
}

function cropVideoFrameForEncoder(
  frame: VideoFrame,
  crop: { x: number; y: number; width: number; height: number } | undefined
): VideoFrame {
  if (!crop) return frame;
  return new VideoFrame(frame, {
    displayHeight: crop.height,
    displayWidth: crop.width,
    timestamp: frame.timestamp,
    visibleRect: {
      height: crop.height,
      width: crop.width,
      x: crop.x,
      y: crop.y,
    },
    ...(frame.duration === null ? {} : { duration: frame.duration }),
  });
}

export class LiveRecordingArtifactSessionOwner implements LiveRecordingArtifactSession {
  private abortPromise: Promise<void> | null = null;
  private callbacks: LiveRecordingArtifactLifecycleCallbacks = {};
  private failure: Error | null = null;
  private encodedVideoFrames = 0;
  private firstVideoTimestamp: number | null = null;
  private lastVideoEndTimestamp: number | null = null;
  private phase: LiveArtifactSessionPhase = 'ready';
  private readonly output: Output;
  private readonly expectedContentHint: LiveEncoderContentHint;
  private readonly expectedVideoEncoderConfig: VideoEncoderConfig | null;
  private readonly videoSource: VideoSampleSource;
  private readonly videoReader: ReadableStreamDefaultReader<VideoFrame>;
  private readonly audioSources: MediaStreamAudioTrackSource[];
  private videoPump: Promise<void> | null = null;
  private readonly firstEncodedVideoPacket: Promise<void>;
  private readonly resolveFirstEncodedVideoPacket: () => void;
  private readonly rejectFirstEncodedVideoPacket: (error: Error) => void;
  private terminalSettled = false;
  private readonly terminal: Promise<FinalizedRecordingStagingArtifact>;
  private readonly resolveTerminal: (artifact: FinalizedRecordingStagingArtifact) => void;
  private readonly rejectTerminal: (error: Error) => void;

  constructor(private readonly input: CreateLiveRecordingArtifactSessionOwnerInput) {
    const [videoTrack] = input.stream.getVideoTracks();
    if (!videoTrack) throw new Error('Live recording stream has no video track.');
    if (typeof MediaStreamTrackProcessor === 'undefined') {
      throw new Error('Source-driven recording requires MediaStreamTrackProcessor.');
    }
    const encodingDimensions = resolveEncodingDimensions(input);
    this.expectedContentHint = resolveLiveEncoderContentHint(videoTrack);
    this.expectedVideoEncoderConfig = buildExactVideoEncoderConfig(
      input,
      encodingDimensions,
      this.expectedContentHint
    );

    const target = new AppendOnlyStreamTarget(
      new WritableStream<Uint8Array>({
        write: (chunk) =>
          input.writer.append(
            new Blob([new Uint8Array(chunk).buffer], { type: 'application/octet-stream' })
          ),
      })
    );
    this.output = new Output({ format: createOutputFormat(input.encoding.container), target });
    this.videoReader = new MediaStreamTrackProcessor({ track: videoTrack }).readable.getReader();
    this.videoSource = new VideoSampleSource({
      bitrate: input.encoding.videoBitrate,
      bitrateMode: 'constant',
      codec: input.encoding.videoCodec,
      contentHint: this.expectedContentHint,
      hardwareAcceleration: 'no-preference',
      keyFrameInterval: 1,
      latencyMode: 'quality',
      ...(input.encoding.videoCodecString
        ? { fullCodecString: input.encoding.videoCodecString }
        : {}),
      onEncodedPacket: (packet) => {
        this.encodedVideoFrames += 1;
        if (this.encodedVideoFrames === 1) this.resolveFirstEncodedVideoPacket();
        this.firstVideoTimestamp ??= packet.timestamp;
        this.lastVideoEndTimestamp = packet.timestamp + packet.duration;
      },
      sizeChangeBehavior: 'deny',
      onEncoderConfig: (config) => this.assertEncoderConfig(config),
    });
    this.output.addVideoTrack(this.videoSource, { frameRate: input.encoding.frameRate });

    this.audioSources = input.stream.getAudioTracks().map((track) => {
      const source = new MediaStreamAudioTrackSource(
        track,
        { bitrate: input.encoding.audioBitrate, codec: input.encoding.audioCodec },
        { timestampBase: 'synced-zero' }
      );
      this.output.addAudioTrack(source);
      return source;
    });

    let resolveTerminal!: (artifact: FinalizedRecordingStagingArtifact) => void;
    let rejectTerminal!: (error: Error) => void;
    this.terminal = new Promise((resolve, reject) => {
      resolveTerminal = resolve;
      rejectTerminal = reject;
    });
    this.resolveTerminal = resolveTerminal;
    this.rejectTerminal = rejectTerminal;
    void this.terminal.catch(() => undefined);
    let resolveFirstEncodedVideoPacket!: () => void;
    let rejectFirstEncodedVideoPacket!: (error: Error) => void;
    this.firstEncodedVideoPacket = new Promise<void>((resolve, reject) => {
      resolveFirstEncodedVideoPacket = resolve;
      rejectFirstEncodedVideoPacket = reject;
    });
    this.resolveFirstEncodedVideoPacket = resolveFirstEncodedVideoPacket;
    this.rejectFirstEncodedVideoPacket = rejectFirstEncodedVideoPacket;
    void this.firstEncodedVideoPacket.catch(() => undefined);
    this.audioSources.forEach((source) => {
      void source.errorPromise.catch((error: unknown) => this.fail(error));
    });
  }

  get state(): RecordingState {
    if (this.phase === 'recording') return 'recording';
    if (this.phase === 'paused') return 'paused';
    return 'inactive';
  }

  static async assertSupported(input: CreateLiveRecordingArtifactSessionOwnerInput): Promise<void> {
    const [videoTrack] = input.stream.getVideoTracks();
    if (!videoTrack) throw new Error('Live recording stream has no video track.');
    const { height, width } = resolveEncodingDimensions(input);
    if (!width || !height) throw new Error('Live recording video dimensions are unavailable.');
    const exactConfig = buildExactVideoEncoderConfig(
      input,
      { height, width },
      resolveLiveEncoderContentHint(videoTrack)
    );
    if (exactConfig && typeof VideoEncoder !== 'undefined') {
      const exactSupport = await VideoEncoder.isConfigSupported(exactConfig);
      if (!exactSupport.supported) {
        throw new Error(
          `The selected live video encoder configuration is not supported: ` +
            `${exactConfig.codec}, ${exactConfig.width}x${exactConfig.height}, ` +
            `${exactConfig.framerate} FPS, ${exactConfig.bitrate} bps, ` +
            `hardware acceleration: ${exactConfig.hardwareAcceleration}.`
        );
      }
    }
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('Source-driven recording requires VideoEncoder.');
    }
    if (
      input.stream.getAudioTracks().length > 0 &&
      !(await canEncodeAudio(input.encoding.audioCodec, { bitrate: input.encoding.audioBitrate }))
    ) {
      throw new Error('The selected live audio encoder configuration is not supported.');
    }
  }

  setLifecycleCallbacks(callbacks: LiveRecordingArtifactLifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.phase !== 'ready') {
      throw new Error(`Live recording artifact session cannot start while ${this.phase}.`);
    }
    this.phase = 'starting';
    void this.startOutput();
  }

  pause(): void {
    if (this.phase !== 'recording') return;
    this.phase = 'paused';
    this.audioSources.forEach((source) => source.pause());
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.audioSources.forEach((source) => source.resume());
    this.phase = 'recording';
  }

  stop(): Promise<FinalizedRecordingStagingArtifact> {
    if (['finalized', 'finalizing', 'stopping'].includes(this.phase)) return this.terminal;
    if (this.failure || this.phase === 'failed' || this.phase === 'aborted') return this.terminal;
    if (this.phase === 'ready' || this.phase === 'starting') {
      this.fail(new Error(`Live recording artifact session cannot stop while ${this.phase}.`));
      return this.terminal;
    }
    this.phase = 'stopping';
    void this.finalizeOutput();
    return this.terminal;
  }

  abort(): Promise<void> {
    if (this.phase === 'finalized') return Promise.resolve();
    if (this.phase === 'aborted') return this.abortPromise ?? Promise.resolve();
    if (this.phase === 'failed') {
      this.abortPromise ??= Promise.allSettled([
        this.videoReader.cancel(),
        this.output.cancel(),
        this.input.coordinator.abort(),
      ]).then(() => undefined);
      return this.abortPromise;
    }
    this.phase = 'aborted';
    const abortError = new Error(`Recording artifact ${this.input.artifactId} was aborted.`);
    this.rejectFirstEncodedVideoPacket(abortError);
    this.rejectTerminalOnce(abortError);
    this.abortPromise ??= Promise.allSettled([
      this.videoReader.cancel(),
      this.output.cancel(),
      this.input.coordinator.abort(),
    ]).then(() => undefined);
    void this.abortPromise.catch(() => undefined);
    return this.abortPromise;
  }

  private async startOutput(): Promise<void> {
    try {
      await this.output.start();
      this.videoPump = this.pumpVideoFrames();
      void this.videoPump.catch(() => undefined);
      await this.firstEncodedVideoPacket;
      if (this.phase !== 'starting') return;
      this.phase = 'recording';
      const startedDiagnostic = {
        audioTracks: this.audioSources.length,
        container: this.input.encoding.container,
        frameRate: this.input.encoding.frameRate,
        frameCrop: this.input.frameCrop ?? null,
        contentHint: this.expectedContentHint,
        videoBitrate: this.input.encoding.videoBitrate,
        videoCodec: this.input.encoding.videoCodec,
      };
      logger.info(`TAB_RECORDING_DIAGNOSTIC encoder-start ${JSON.stringify(startedDiagnostic)}`);
      logger.info('Started source-driven live encoder', startedDiagnostic);
      this.callbacks.onStart?.();
    } catch (error) {
      this.fail(error);
    }
  }

  private async finalizeOutput(): Promise<void> {
    try {
      this.phase = 'finalizing';
      await this.videoReader.cancel();
      await this.videoPump;
      await this.output.finalize();
      this.logEncodedCadence();
      const artifact = await this.input.writer.finalize();
      if (this.cannotCompleteFinalization()) return;
      if (artifact.size === 0) {
        throw new Error(`Recording ${this.input.artifactId} produced no media bytes.`);
      }
      await this.callbacks.onStop?.(artifact);
      if (this.cannotCompleteFinalization()) return;
      this.phase = 'finalized';
      this.resolveTerminalOnce(artifact);
    } catch (error) {
      this.fail(error);
    }
  }

  private assertEncoderConfig(config: VideoEncoderConfig): void {
    if (config.framerate !== this.input.encoding.frameRate) {
      throw new Error(
        `Live encoder did not preserve requested ${this.input.encoding.frameRate} FPS configuration.`
      );
    }
    if (config.bitrateMode !== 'constant') {
      throw new Error('Live encoder did not preserve constant bitrate mode.');
    }
    if (config.contentHint !== this.expectedContentHint) {
      throw new Error('Live encoder did not preserve source content hint.');
    }
    const expected = this.expectedVideoEncoderConfig;
    if (
      expected &&
      (config.codec !== expected.codec ||
        config.width !== expected.width ||
        config.height !== expected.height ||
        config.displayWidth !== expected.displayWidth ||
        config.displayHeight !== expected.displayHeight ||
        config.bitrate !== expected.bitrate ||
        config.alpha !== expected.alpha ||
        config.hardwareAcceleration !== expected.hardwareAcceleration ||
        config.latencyMode !== expected.latencyMode ||
        config.avc?.format !== expected.avc?.format)
    ) {
      throw new Error('Live encoder did not preserve the exact selected AVC configuration.');
    }
    logger.debug('Configured live WebCodecs encoder', {
      codec: config.codec,
      framerate: config.framerate,
      height: config.height,
      width: config.width,
    });
  }

  private async pumpVideoFrames(): Promise<void> {
    let firstTimestamp: number | null = null;
    let loggedFirstEncoderInput = false;
    let pauseStartedAt: number | null = null;
    let pausedDuration = 0;
    let submittedFrames = 0;
    try {
      while (true) {
        const result = await this.videoReader.read();
        if (result.done) break;
        const frame = result.value;
        if (this.phase === 'paused') {
          pauseStartedAt ??= frame.timestamp;
          frame.close();
          continue;
        }
        if (this.phase !== 'starting' && this.phase !== 'recording') {
          frame.close();
          continue;
        }
        firstTimestamp ??= frame.timestamp;
        if (pauseStartedAt !== null) {
          pausedDuration += Math.max(0, frame.timestamp - pauseStartedAt);
          pauseStartedAt = null;
        }
        const encoderFrame = cropVideoFrameForEncoder(frame, this.input.frameCrop);
        if (!loggedFirstEncoderInput) {
          loggedFirstEncoderInput = true;
          logger.info(
            `TAB_RECORDING_DIAGNOSTIC first-encoder-frame ${JSON.stringify({
              frameCrop: this.input.frameCrop ?? null,
              input: describeVideoFrame(encoderFrame),
              source: describeVideoFrame(frame),
            })}`
          );
          logger.info('Observed first encoder input frame', describeVideoFrame(encoderFrame));
        }
        const sample = new VideoSample(encoderFrame, {
          timestamp: (frame.timestamp - firstTimestamp - pausedDuration) / 1_000_000,
        });
        try {
          await this.videoSource.add(sample);
        } finally {
          sample.close();
          if (encoderFrame !== frame) frame.close();
        }
        submittedFrames += 1;
      }
      if (this.phase === 'starting') {
        throw new Error(
          submittedFrames === 0
            ? 'The recording source ended before the first video frame.'
            : 'The recording source ended before the first encoded video packet.'
        );
      }
    } catch (error) {
      const failure = toError(error);
      this.rejectFirstEncodedVideoPacket(failure);
      const intentionalCancellation =
        error instanceof DOMException &&
        error.name === 'AbortError' &&
        ['stopping', 'finalizing', 'aborted'].includes(this.phase);
      if (intentionalCancellation || this.phase === 'failed' || this.phase === 'aborted') return;
      if (this.phase === 'stopping' || this.phase === 'finalizing') throw failure;
      this.fail(failure);
    }
  }

  private logEncodedCadence(): void {
    const duration =
      this.firstVideoTimestamp === null || this.lastVideoEndTimestamp === null
        ? 0
        : this.lastVideoEndTimestamp - this.firstVideoTimestamp;
    const cadenceDiagnostic = {
      actualFrameRate: duration > 0 ? this.encodedVideoFrames / duration : 0,
      duration,
      encodedVideoFrames: this.encodedVideoFrames,
      requestedFrameRate: this.input.encoding.frameRate,
    };
    logger.info(`TAB_RECORDING_DIAGNOSTIC encoder-final ${JSON.stringify(cadenceDiagnostic)}`);
    logger.info('Finalized source-driven live encoder', cadenceDiagnostic);
  }

  private fail(reason: unknown): void {
    if (this.failure || this.phase === 'finalized' || this.phase === 'aborted') return;
    this.failure = toError(reason);
    this.rejectFirstEncodedVideoPacket(this.failure);
    let terminalError: Error = this.failure;
    this.phase = 'failed';
    try {
      this.callbacks.onFailure?.(this.failure);
    } catch (callbackError) {
      terminalError = new AggregateError(
        [this.failure, toError(callbackError)],
        'Recording failure handling also failed.'
      );
    }
    this.abortPromise ??= Promise.allSettled([
      this.videoReader.cancel(),
      this.output.cancel(),
      this.input.coordinator.abort(),
    ]).then(() => undefined);
    void this.abortPromise.catch(() => undefined);
    this.rejectTerminalOnce(terminalError);
  }

  private cannotCompleteFinalization(): boolean {
    return this.phase === 'aborted' || this.terminalSettled;
  }

  private resolveTerminalOnce(artifact: FinalizedRecordingStagingArtifact): void {
    if (this.terminalSettled) return;
    this.terminalSettled = true;
    this.resolveTerminal(artifact);
  }

  private rejectTerminalOnce(error: Error): void {
    if (this.terminalSettled) return;
    this.terminalSettled = true;
    this.rejectTerminal(error);
  }
}
