import { VideoSample, type VideoSampleSource } from 'mediabunny';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { LiveVideoFrameBuffer } from './live-video-frame-buffer';
import { LiveVideoTimeline, type LiveVideoSampleTiming } from './live-video-timeline';

export type LiveVideoFrameTransform = Readonly<{
  fit: 'contain' | 'cover' | 'fill';
  outputSize: Readonly<{ height: number; width: number }>;
  sourceRect: Readonly<{ height: number; width: number; x: number; y: number }>;
}>;

export interface LiveVideoEncoderPumpMetrics {
  coalescedVideoFrames: number;
  forcedKeyFrames: number;
  maxEncoderAddDurationMs: number;
  submittedVideoFrames: number;
  totalEncoderAddDurationMs: number;
  videoEncoderBackpressureEvents: number;
}

interface RunLiveVideoEncoderPumpInput {
  frameBuffer: LiveVideoFrameBuffer;
  frameRate: number;
  frameTransform?: LiveVideoFrameTransform;
  onFrameDequeued(): void;
  shouldEncodeTerminalFrame(): boolean;
  videoSource: Pick<VideoSampleSource, 'add'>;
}

const logger = createLogger({ namespace: 'LiveVideoEncoderPump' });

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

async function encodeVideoFrame(
  input: RunLiveVideoEncoderPumpInput,
  frame: VideoFrame,
  timing: LiveVideoSampleTiming,
  logFirstEncoderInput: boolean,
  metrics: LiveVideoEncoderPumpMetrics
): Promise<void> {
  const sourceDescription = describeVideoFrame(frame);
  const sourceSample = new VideoSample(frame, {
    duration: timing.duration,
    timestamp: timing.timestamp,
  });
  let sample: VideoSample | null = null;
  const addStartedAt = performance.now();
  try {
    if (input.frameTransform) {
      const { fit, outputSize, sourceRect } = input.frameTransform;
      sample = await sourceSample.transform({
        alpha: 'discard',
        crop: {
          height: sourceRect.height,
          left: sourceRect.x,
          top: sourceRect.y,
          width: sourceRect.width,
        },
        fit,
        height: outputSize.height,
        width: outputSize.width,
      });
      sourceSample.close();
    } else {
      sample = sourceSample;
    }
    if (logFirstEncoderInput) {
      const encoderInput = {
        codedHeight: sample.codedHeight,
        codedWidth: sample.codedWidth,
        displayHeight: sample.displayHeight,
        displayWidth: sample.displayWidth,
        format: sample.format,
        visibleRect: sample.visibleRect,
      };
      logger.info(
        `TAB_RECORDING_DIAGNOSTIC first-encoder-frame ${JSON.stringify({
          frameTransform: input.frameTransform ?? null,
          input: encoderInput,
          source: sourceDescription,
          timing,
        })}`
      );
      logger.info('Observed first encoder input frame', encoderInput);
    }
    if (timing.keyFrame) metrics.forcedKeyFrames += 1;
    await input.videoSource.add(sample, timing.keyFrame ? { keyFrame: true } : undefined);
    metrics.submittedVideoFrames += 1;
  } finally {
    const addDuration = performance.now() - addStartedAt;
    metrics.maxEncoderAddDurationMs = Math.max(metrics.maxEncoderAddDurationMs, addDuration);
    metrics.totalEncoderAddDurationMs += addDuration;
    if (addDuration > 1_000 / input.frameRate) metrics.videoEncoderBackpressureEvents += 1;
    sample?.close();
    if (sample !== sourceSample) sourceSample.close();
  }
}

class LiveVideoEncoderPumpState {
  readonly metrics: LiveVideoEncoderPumpMetrics = {
    coalescedVideoFrames: 0,
    forcedKeyFrames: 0,
    maxEncoderAddDurationMs: 0,
    submittedVideoFrames: 0,
    totalEncoderAddDurationMs: 0,
    videoEncoderBackpressureEvents: 0,
  };
  private loggedFirstEncoderInput = false;
  private pendingEntry: Awaited<ReturnType<LiveVideoFrameBuffer['dequeue']>> = null;
  private readonly timeline: LiveVideoTimeline;

  constructor(private readonly input: RunLiveVideoEncoderPumpInput) {
    this.timeline = new LiveVideoTimeline(input.frameRate);
  }

  async accept(entry: NonNullable<Awaited<ReturnType<LiveVideoFrameBuffer['dequeue']>>>) {
    if (entry.startsNewSegment) {
      await this.startSegment(entry);
      return;
    }
    const decision = this.timeline.accept(entry.timestampSeconds);
    if (!this.pendingEntry) {
      this.pendingEntry = entry;
      return;
    }
    if (decision.kind === 'coalesce') {
      this.coalesce(entry, decision.replacePending);
      return;
    }
    if (decision.kind !== 'emit') {
      entry.frame.close();
      throw new Error('Live video timeline did not emit a pending frame.');
    }
    await this.submitPending(decision, entry);
  }

  async finish(): Promise<LiveVideoEncoderPumpMetrics> {
    const terminalTiming = this.timeline.finish();
    if (this.pendingEntry && terminalTiming && this.input.shouldEncodeTerminalFrame()) {
      const terminalFrame = this.pendingEntry.frame;
      this.pendingEntry = null;
      await this.submit(terminalFrame, terminalTiming);
    }
    return this.metrics;
  }

  dispose(): void {
    this.pendingEntry?.frame.close();
    this.pendingEntry = null;
  }

  private coalesce(
    entry: NonNullable<Awaited<ReturnType<LiveVideoFrameBuffer['dequeue']>>>,
    replacePending: boolean
  ): void {
    if (replacePending) {
      // Equal normalized timestamps can occur across pause/resume. The timeline timestamp and
      // retained content move together; rate-capped or backward frames never replace the pair.
      this.pendingEntry?.frame.close();
      this.pendingEntry = entry;
    } else {
      entry.frame.close();
    }
    this.metrics.coalescedVideoFrames += 1;
  }

  private async startSegment(
    entry: NonNullable<Awaited<ReturnType<LiveVideoFrameBuffer['dequeue']>>>
  ): Promise<void> {
    const segmentEndTiming = this.timeline.finish();
    if (this.pendingEntry && segmentEndTiming) {
      const frameToEncode = this.pendingEntry.frame;
      this.pendingEntry = entry;
      this.timeline.restart(entry.timestampSeconds);
      await this.submit(frameToEncode, segmentEndTiming);
      return;
    }
    this.timeline.restart(entry.timestampSeconds);
    this.pendingEntry = entry;
  }

  private async submitPending(
    timing: LiveVideoSampleTiming,
    nextEntry: NonNullable<Awaited<ReturnType<LiveVideoFrameBuffer['dequeue']>>>
  ): Promise<void> {
    const frameToEncode = this.pendingEntry!.frame;
    // Transfer ownership before awaiting the encoder. dispose() owns the successor if transform
    // or encoder submission fails.
    this.pendingEntry = nextEntry;
    await this.submit(frameToEncode, timing);
  }

  private async submit(frame: VideoFrame, timing: LiveVideoSampleTiming): Promise<void> {
    await encodeVideoFrame(this.input, frame, timing, !this.loggedFirstEncoderInput, this.metrics);
    this.loggedFirstEncoderInput = true;
  }
}

export async function runLiveVideoEncoderPump(
  input: RunLiveVideoEncoderPumpInput
): Promise<LiveVideoEncoderPumpMetrics> {
  const state = new LiveVideoEncoderPumpState(input);
  try {
    while (true) {
      const entry = await input.frameBuffer.dequeue();
      if (!entry) break;
      input.onFrameDequeued();
      await state.accept(entry);
    }
    return await state.finish();
  } finally {
    state.dispose();
  }
}
