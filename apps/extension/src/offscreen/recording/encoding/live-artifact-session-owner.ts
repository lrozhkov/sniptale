import {
  AppendOnlyStreamTarget,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  VideoSampleSource,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
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
import { runLiveVideoEncoderPump, type LiveVideoFrameTransform } from './live-video-encoder-pump';
import { LiveVideoFrameBuffer } from './live-video-frame-buffer';
import { LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS } from './live-video-budget';
import { LiveVideoSessionDiagnostics } from './live-video-session-diagnostics';

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
  frameTransform?: LiveVideoFrameTransform | undefined;
  stream: MediaStream;
  writer: RecordingStagingArtifactWriter;
}

type LiveEncoderContentHint = 'detail' | 'motion' | 'text';

const SCREEN_RECORDING_COLOR_SPACE: VideoColorSpaceInit = {
  fullRange: true,
  matrix: 'bt709',
  primaries: 'bt709',
  transfer: 'bt709',
};

interface ActiveVideoRead {
  generation: number;
  settled: boolean;
}

const logger = createLogger({ namespace: 'LiveRecordingArtifactSession' });
// Absorb short encoder or fragmented-writer stalls without permitting an unbounded raw-frame queue.
const LIVE_VIDEO_FRAME_BUFFER_SIZE = 8;
// Keep hidden browser buffering minimal; the owned queue above is the burst authority.
const LIVE_VIDEO_PROCESSOR_BUFFER_SIZE = 1;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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

function resolveLiveSampleColorSpace(
  contentHint: LiveEncoderContentHint
): VideoColorSpaceInit | undefined {
  return contentHint === 'text' ? SCREEN_RECORDING_COLOR_SPACE : undefined;
}

function matchesSelectedCodec(configuredCodec: string, selectedCodec: VideoCodec): boolean {
  if (selectedCodec === 'avc') return configuredCodec.startsWith('avc1');
  if (selectedCodec === 'vp9')
    return configuredCodec === 'vp9' || configuredCodec.startsWith('vp09');
  return configuredCodec === selectedCodec || configuredCodec.startsWith(`${selectedCodec}.`);
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
    bitrateMode: 'variable',
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
  const [videoTrack] = input.stream.getVideoTracks();
  if (!videoTrack) throw new Error('Live recording stream has no video track.');
  const videoSettings = videoTrack.getSettings();
  if (input.frameTransform) {
    const { outputSize, sourceRect } = input.frameTransform;
    const sourceWidth = videoSettings.width;
    const sourceHeight = videoSettings.height;
    if (
      !Number.isInteger(outputSize.width) ||
      !Number.isInteger(outputSize.height) ||
      outputSize.width <= 0 ||
      outputSize.height <= 0 ||
      outputSize.width % 2 !== 0 ||
      outputSize.height % 2 !== 0
    ) {
      throw new Error('Live recording transform output must use positive even dimensions.');
    }
    if (
      typeof sourceWidth !== 'number' ||
      typeof sourceHeight !== 'number' ||
      ![sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height].every(Number.isFinite) ||
      sourceRect.x < 0 ||
      sourceRect.y < 0 ||
      sourceRect.width <= 0 ||
      sourceRect.height <= 0 ||
      sourceRect.x + sourceRect.width > sourceWidth ||
      sourceRect.y + sourceRect.height > sourceHeight
    ) {
      throw new Error('Live recording transform source rectangle is outside the source frame.');
    }
    return outputSize;
  }
  if (!videoSettings.width || !videoSettings.height) {
    throw new Error('Live recording video dimensions are unavailable.');
  }
  return { height: videoSettings.height, width: videoSettings.width };
}

export class LiveRecordingArtifactSessionOwner implements LiveRecordingArtifactSession {
  private abortPromise: Promise<void> | null = null;
  private callbacks: LiveRecordingArtifactLifecycleCallbacks = {};
  private failure: Error | null = null;
  private phase: LiveArtifactSessionPhase = 'ready';
  private readonly output: Output;
  private readonly expectedContentHint: LiveEncoderContentHint;
  private readonly videoDiagnostics: LiveVideoSessionDiagnostics;
  private readonly expectedVideoEncoderConfig: VideoEncoderConfig | null;
  private readonly videoSource: VideoSampleSource;
  private readonly videoProcessor: MediaStreamTrackProcessor<VideoFrame>;
  private readonly videoReader: ReadableStreamDefaultReader<VideoFrame>;
  private readonly videoFrameBuffer = new LiveVideoFrameBuffer(LIVE_VIDEO_FRAME_BUFFER_SIZE);
  private readonly audioSources: MediaStreamAudioTrackSource[];
  private pauseStartedAtMs: number | null = null;
  private pendingPausedDuration = 0;
  private pendingVideoSegmentRestart = false;
  private resumeRequested = false;
  private videoReadPending = false;
  private activeVideoRead: ActiveVideoRead | null = null;
  private videoReadGeneration = 0;
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
    this.videoDiagnostics = new LiveVideoSessionDiagnostics({
      configuredBitrate: input.encoding.videoBitrate,
      keyFrameInterval: LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS,
      requestedFrameRate: input.encoding.frameRate,
      track: videoTrack,
    });
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
    this.videoProcessor = new MediaStreamTrackProcessor({
      maxBufferSize: LIVE_VIDEO_PROCESSOR_BUFFER_SIZE,
      track: videoTrack,
    });
    this.videoReader = this.videoProcessor.readable.getReader();
    this.videoSource = new VideoSampleSource({
      bitrate: input.encoding.videoBitrate,
      bitrateMode: 'variable',
      codec: input.encoding.videoCodec,
      contentHint: this.expectedContentHint,
      hardwareAcceleration: 'no-preference',
      keyFrameInterval: LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS,
      latencyMode: 'quality',
      ...(input.encoding.videoCodecString
        ? { fullCodecString: input.encoding.videoCodecString }
        : {}),
      onEncodedPacket: (packet) => {
        if (this.videoDiagnostics.observeEncodedPacket(packet).firstPacket) {
          this.resolveFirstEncodedVideoPacket();
        }
      },
      sizeChangeBehavior: 'deny',
      onEncoderConfig: (config) => this.assertEncoderConfig(config),
    });
    // Mediabunny uses track frameRate both as encoder rate-control metadata and as muxer cadence.
    // LiveVideoTimeline owns pre-muxer tick coalescing so this metadata can stabilize WebM packet
    // durations without manufacturing frames or collapsing multiple samples onto one timestamp.
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
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('Source-driven recording requires VideoEncoder.');
    }
    const contentHint = resolveLiveEncoderContentHint(videoTrack);
    const selectedConfigSupported = await canEncodeVideo(input.encoding.videoCodec, {
      bitrate: input.encoding.videoBitrate,
      bitrateMode: 'variable',
      contentHint,
      ...(input.encoding.videoCodecString
        ? { fullCodecString: input.encoding.videoCodecString }
        : {}),
      hardwareAcceleration: 'no-preference',
      height,
      latencyMode: 'quality',
      width,
    });
    if (!selectedConfigSupported) {
      throw new Error('The selected live video encoder configuration is not supported.');
    }
    const exactConfig = buildExactVideoEncoderConfig(input, { height, width }, contentHint);
    if (exactConfig && typeof VideoEncoder !== 'undefined') {
      const exactSupport = await VideoEncoder.isConfigSupported(exactConfig);
      if (!exactSupport.supported) {
        throw new Error(
          `The selected live video encoder configuration is not supported: ` +
            `${exactConfig.codec}, ${exactConfig.width}x${exactConfig.height}, ` +
            `source-timed cadence, ${exactConfig.bitrate} bps, ` +
            `hardware acceleration: ${exactConfig.hardwareAcceleration}.`
        );
      }
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
    this.pauseStartedAtMs = performance.now();
    this.resumeRequested = false;
    this.videoFrameBuffer.notifyProducer();
    this.audioSources.forEach((source) => source.pause());
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.resumeRequested = true;
    this.scheduleResumeAfterPendingRead(this.activeVideoRead);
    this.videoFrameBuffer.notifyProducer();
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
      this.videoFrameBuffer.abort();
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
    this.videoFrameBuffer.abort();
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
        requestedCaptureFrameRate: this.input.encoding.frameRate,
        frameTransform: this.input.frameTransform ?? null,
        contentHint: this.expectedContentHint,
        captureTrack: this.videoDiagnostics.captureTrack,
        bitrateMode: 'variable',
        keyFrameInterval: LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS,
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
        'Live encoder did not preserve the requested frame rate as its rate-control expectation.'
      );
    }
    if (config.bitrateMode !== 'variable') {
      throw new Error('Live encoder did not preserve screen-efficient variable bitrate mode.');
    }
    if (config.contentHint !== this.expectedContentHint) {
      throw new Error('Live encoder did not preserve source content hint.');
    }
    const dimensions = resolveEncodingDimensions(this.input);
    if (
      !matchesSelectedCodec(config.codec, this.input.encoding.videoCodec) ||
      config.width !== dimensions.width ||
      config.height !== dimensions.height ||
      config.bitrate !== this.input.encoding.videoBitrate ||
      config.alpha !== 'discard' ||
      config.hardwareAcceleration !== 'no-preference' ||
      config.latencyMode !== 'quality'
    ) {
      throw new Error('Live encoder did not preserve the selected video configuration.');
    }
    const expected = this.expectedVideoEncoderConfig;
    if (
      expected &&
      (config.codec !== expected.codec ||
        config.width !== expected.width ||
        config.height !== expected.height ||
        config.displayWidth !== expected.displayWidth ||
        config.displayHeight !== expected.displayHeight ||
        config.framerate !== expected.framerate ||
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
    const readPump = this.readVideoFramesIntoBuffer();
    const sampleColorSpace = resolveLiveSampleColorSpace(this.expectedContentHint);
    const encodePump = runLiveVideoEncoderPump({
      frameBuffer: this.videoFrameBuffer,
      frameRate: this.input.encoding.frameRate,
      ...(this.input.frameTransform ? { frameTransform: this.input.frameTransform } : {}),
      onFrameDequeued: () => this.completeResumeAfterProcessorDrain(),
      onEncoderSubmissionFailed: () => this.videoDiagnostics.encoderSubmissionFailed(),
      onEncoderSubmissionStarted: () => this.videoDiagnostics.encoderSubmissionStarted(),
      ...(sampleColorSpace ? { sampleColorSpace } : {}),
      shouldEncodeTerminalFrame: () => this.phase !== 'aborted' && this.phase !== 'failed',
      videoSource: this.videoSource,
    })
      .then((metrics) => {
        this.videoDiagnostics.setPumpMetrics(metrics);
        if (this.phase === 'starting') {
          throw new Error(
            metrics.submittedVideoFrames === 0
              ? 'The recording source ended before the first video frame.'
              : 'The recording source ended before the first encoded video packet.'
          );
        }
      })
      .catch(async (error: unknown) => {
        this.videoFrameBuffer.abort();
        await this.videoReader.cancel().catch(() => undefined);
        throw error;
      });
    const results = await Promise.allSettled([readPump, encodePump]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (!failure) return;
    const error = toError(failure.reason);
    this.videoFrameBuffer.abort();
    await this.videoReader.cancel().catch(() => undefined);
    this.handleVideoPumpFailure(error);
  }

  private async readVideoFramesIntoBuffer(): Promise<void> {
    let firstTimestamp: number | null = null;
    let pausedDuration = 0;
    try {
      while (true) {
        if (!(await this.videoFrameBuffer.waitForSpace(() => this.phase === 'paused'))) {
          break;
        }
        const result = await this.readNextVideoFrame();
        if (result.done) break;
        const frame = result.value;
        this.videoDiagnostics.observeSourceFrame(frame);
        if (this.phase === 'paused') {
          frame.close();
          continue;
        }
        if (this.phase !== 'starting' && this.phase !== 'recording') {
          frame.close();
          continue;
        }
        firstTimestamp ??= frame.timestamp;
        if (this.pendingPausedDuration > 0) {
          pausedDuration += this.pendingPausedDuration;
          this.pendingPausedDuration = 0;
        }
        const enqueued = this.videoFrameBuffer.enqueue({
          frame,
          ...(this.pendingVideoSegmentRestart ? { startsNewSegment: true } : {}),
          timestampSeconds: (frame.timestamp - firstTimestamp - pausedDuration) / 1_000_000,
        });
        if (!enqueued) {
          frame.close();
          break;
        }
        this.pendingVideoSegmentRestart = false;
        this.videoDiagnostics.observeFrameBufferDepth(this.videoFrameBuffer.depth);
      }
    } finally {
      this.videoFrameBuffer.closeInput();
    }
  }

  private async readNextVideoFrame(): Promise<ReadableStreamReadResult<VideoFrame>> {
    const activeRead: ActiveVideoRead = {
      generation: ++this.videoReadGeneration,
      settled: false,
    };
    this.activeVideoRead = activeRead;
    const read = this.videoReader.read();
    void read.then(
      () => {
        activeRead.settled = true;
      },
      () => {
        activeRead.settled = true;
      }
    );
    this.scheduleResumeAfterPendingRead(activeRead);
    try {
      return await read;
    } finally {
      activeRead.settled = true;
      if (this.activeVideoRead === activeRead) {
        this.activeVideoRead = null;
        this.videoReadPending = false;
      }
    }
  }

  private scheduleResumeAfterPendingRead(activeRead: ActiveVideoRead | null): void {
    if (!activeRead || this.phase !== 'paused' || !this.resumeRequested) return;
    setTimeout(() => {
      if (
        this.activeVideoRead !== activeRead ||
        activeRead.settled ||
        activeRead.generation !== this.videoReadGeneration ||
        this.phase !== 'paused' ||
        !this.resumeRequested
      ) {
        return;
      }
      this.videoReadPending = true;
      this.completeResumeAfterProcessorDrain();
    }, 0);
  }

  private completeResumeAfterProcessorDrain(): void {
    if (
      this.phase !== 'paused' ||
      !this.resumeRequested ||
      !this.videoReadPending ||
      this.videoFrameBuffer.depth >= LIVE_VIDEO_FRAME_BUFFER_SIZE
    ) {
      return;
    }
    if (this.pauseStartedAtMs !== null) {
      this.pendingPausedDuration += Math.max(0, performance.now() - this.pauseStartedAtMs) * 1_000;
      this.pauseStartedAtMs = null;
    }
    this.resumeRequested = false;
    this.pendingVideoSegmentRestart = true;
    this.audioSources.forEach((source) => source.resume());
    this.phase = 'recording';
  }

  private handleVideoPumpFailure(error: Error): void {
    this.rejectFirstEncodedVideoPacket(error);
    const intentionalCancellation =
      error instanceof DOMException &&
      error.name === 'AbortError' &&
      ['stopping', 'finalizing', 'aborted'].includes(this.phase);
    if (intentionalCancellation || this.phase === 'failed' || this.phase === 'aborted') return;
    if (this.phase === 'stopping' || this.phase === 'finalizing') throw error;
    this.fail(error);
  }

  private logEncodedCadence(): void {
    const cadenceDiagnostic = {
      ...this.videoDiagnostics.summarize({ processor: this.videoProcessor }),
      keyFrameInterval: LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS,
    };
    if (!cadenceDiagnostic.videoByteBudget.withinBudget) {
      logger.warn('Encoded live video exceeded its documented payload byte budget', {
        artifactId: this.input.artifactId,
        videoByteBudget: cadenceDiagnostic.videoByteBudget,
      });
    }
    if (!cadenceDiagnostic.videoKeyFrameBudget.withinBudget) {
      logger.warn('Encoded live video exceeded its documented keyframe budget', {
        artifactId: this.input.artifactId,
        videoKeyFrameBudget: cadenceDiagnostic.videoKeyFrameBudget,
      });
    }
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
    this.videoFrameBuffer.abort();
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
