import type { EncodedPacket } from 'mediabunny';
import type { LiveVideoEncoderPumpMetrics } from './live-video-encoder-pump';
import { LiveVideoOutputMetrics } from './live-video-output-metrics';

type LiveCaptureTrackDiagnostics = Readonly<{
  capabilities: MediaTrackCapabilities | null;
  constraints: MediaTrackConstraints | null;
  settings: MediaTrackSettings | null;
}>;

type CaptureDiagnosticsTrack = Readonly<{
  getCapabilities?(): MediaTrackCapabilities;
  getConstraints?(): MediaTrackConstraints;
  getSettings?(): MediaTrackSettings;
}>;

type ProcessorCounterSource = object;

type LiveVideoSessionDiagnosticsInput = Readonly<{
  configuredBitrate: number;
  keyFrameInterval: number;
  requestedFrameRate: number;
  track: CaptureDiagnosticsTrack;
}>;

type LiveVideoSessionDiagnosticsSummaryInput = Readonly<{
  processor: ProcessorCounterSource;
}>;

const EMPTY_PUMP_METRICS: LiveVideoEncoderPumpMetrics = {
  coalescedVideoFrames: 0,
  forcedKeyFrames: 0,
  maxEncoderAddDurationMs: 0,
  maxFrameTransformDurationMs: 0,
  submittedVideoFrames: 0,
  totalEncoderAddDurationMs: 0,
  totalFrameTransformDurationMs: 0,
  transformedVideoFrames: 0,
  videoEncoderBackpressureEvents: 0,
};

function readOptionalProcessorCounter(
  processor: ProcessorCounterSource,
  key: string
): number | null {
  const value: unknown = Reflect.get(processor, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readProcessorDiscardedRatio(processor: ProcessorCounterSource): number | null {
  const discardedFrames = readOptionalProcessorCounter(processor, 'discardedFrames');
  const totalFrames = readOptionalProcessorCounter(processor, 'totalFrames');
  if (discardedFrames === null || totalFrames === null || totalFrames <= 0) return null;
  return discardedFrames / totalFrames;
}

function readCaptureTrackDiagnostics(track: CaptureDiagnosticsTrack): LiveCaptureTrackDiagnostics {
  let capabilities: MediaTrackCapabilities | null = null;
  let constraints: MediaTrackConstraints | null = null;
  let settings: MediaTrackSettings | null = null;
  try {
    capabilities = track.getCapabilities?.() ?? null;
  } catch {
    // Diagnostics are advisory and must not alter recording behavior.
  }
  try {
    constraints = track.getConstraints?.() ?? null;
  } catch {
    // Diagnostics are advisory and must not alter recording behavior.
  }
  try {
    settings = track.getSettings?.() ?? null;
  } catch {
    // Diagnostics are advisory and must not alter recording behavior.
  }
  return { capabilities, constraints, settings };
}

/** Owns capture/source/submission/output counters for final recording diagnostics. */
export class LiveVideoSessionDiagnostics {
  readonly captureTrack: LiveCaptureTrackDiagnostics;
  private firstSourceVideoTimestamp: number | null = null;
  private lastSourceVideoTimestamp: number | null = null;
  private maxFrameBufferDepth = 0;
  private maxPendingEncodedPackets = 0;
  private maxSourceFrameGap = 0;
  private pendingEncodedPackets = 0;
  private sourceFrameGapsOverCadenceBudget = 0;
  private readonly outputMetrics = new LiveVideoOutputMetrics();
  private sourceVideoFrames = 0;
  private videoPumpMetrics: LiveVideoEncoderPumpMetrics = { ...EMPTY_PUMP_METRICS };

  constructor(private readonly input: LiveVideoSessionDiagnosticsInput) {
    this.captureTrack = readCaptureTrackDiagnostics(input.track);
  }

  encoderSubmissionFailed(): void {
    this.pendingEncodedPackets = Math.max(0, this.pendingEncodedPackets - 1);
  }

  encoderSubmissionStarted(): void {
    this.pendingEncodedPackets += 1;
    this.maxPendingEncodedPackets = Math.max(
      this.maxPendingEncodedPackets,
      this.pendingEncodedPackets
    );
  }

  observeEncodedPacket(
    packet: Pick<EncodedPacket, 'byteLength' | 'duration' | 'timestamp' | 'type'>
  ): {
    firstPacket: boolean;
  } {
    this.pendingEncodedPackets = Math.max(0, this.pendingEncodedPackets - 1);
    return this.outputMetrics.observe(packet);
  }

  observeFrameBufferDepth(depth: number): void {
    this.maxFrameBufferDepth = Math.max(this.maxFrameBufferDepth, depth);
  }

  observeSourceFrame(frame: Pick<VideoFrame, 'timestamp'>): void {
    this.sourceVideoFrames += 1;
    this.firstSourceVideoTimestamp ??= frame.timestamp;
    if (this.lastSourceVideoTimestamp !== null) {
      const gap = (frame.timestamp - this.lastSourceVideoTimestamp) / 1_000_000;
      this.maxSourceFrameGap = Math.max(this.maxSourceFrameGap, gap);
      if (gap > (2 / this.input.requestedFrameRate) * 1.000001) {
        this.sourceFrameGapsOverCadenceBudget += 1;
      }
    }
    this.lastSourceVideoTimestamp = frame.timestamp;
  }

  setPumpMetrics(metrics: LiveVideoEncoderPumpMetrics): void {
    this.videoPumpMetrics = metrics;
  }

  summarize({ processor }: LiveVideoSessionDiagnosticsSummaryInput) {
    const outputMetrics = this.outputMetrics.summarize({
      configuredBitrate: this.input.configuredBitrate,
      forcedKeyFrames: this.videoPumpMetrics.forcedKeyFrames,
      keyFrameInterval: this.input.keyFrameInterval,
    });
    const sourceFrameRate =
      this.firstSourceVideoTimestamp !== null &&
      this.lastSourceVideoTimestamp !== null &&
      this.lastSourceVideoTimestamp > this.firstSourceVideoTimestamp
        ? ((this.sourceVideoFrames - 1) * 1_000_000) /
          (this.lastSourceVideoTimestamp - this.firstSourceVideoTimestamp)
        : 0;
    return {
      ...outputMetrics,
      averageEncoderAddDurationMs:
        this.videoPumpMetrics.submittedVideoFrames > 0
          ? this.videoPumpMetrics.totalEncoderAddDurationMs /
            this.videoPumpMetrics.submittedVideoFrames
          : 0,
      averageFrameTransformDurationMs:
        this.videoPumpMetrics.transformedVideoFrames > 0
          ? this.videoPumpMetrics.totalFrameTransformDurationMs /
            this.videoPumpMetrics.transformedVideoFrames
          : 0,
      encoderBackpressureEvents: this.videoPumpMetrics.videoEncoderBackpressureEvents,
      encoderBackpressureRatio:
        this.videoPumpMetrics.submittedVideoFrames > 0
          ? this.videoPumpMetrics.videoEncoderBackpressureEvents /
            this.videoPumpMetrics.submittedVideoFrames
          : 0,
      coalescedVideoFrames: this.videoPumpMetrics.coalescedVideoFrames,
      captureTrack: this.captureTrack,
      maxEncoderAddDurationMs: this.videoPumpMetrics.maxEncoderAddDurationMs,
      maxFrameTransformDurationMs: this.videoPumpMetrics.maxFrameTransformDurationMs,
      maxFrameBufferDepth: this.maxFrameBufferDepth,
      maxPendingEncodedPackets: this.maxPendingEncodedPackets,
      maxSourceFrameGapMs: this.maxSourceFrameGap * 1_000,
      processorDiscardedFrames: readOptionalProcessorCounter(processor, 'discardedFrames'),
      processorDiscardedRatio: readProcessorDiscardedRatio(processor),
      processorTotalFrames: readOptionalProcessorCounter(processor, 'totalFrames'),
      requestedFrameRate: this.input.requestedFrameRate,
      forcedKeyFrames: this.videoPumpMetrics.forcedKeyFrames,
      sourceDeliveryRatio: sourceFrameRate / this.input.requestedFrameRate,
      sourceFrameGapBudgetMs: (2_000 / this.input.requestedFrameRate) * 1.000001,
      sourceFrameGapsOverCadenceBudget: this.sourceFrameGapsOverCadenceBudget,
      sourceFrameRate,
      sourceVideoFrames: this.sourceVideoFrames,
      submittedVideoFrames: this.videoPumpMetrics.submittedVideoFrames,
      transformedVideoFrames: this.videoPumpMetrics.transformedVideoFrames,
    };
  }
}
