import { inferRecordingClockOffset } from '../../../platform/media-utils/recording-clock-synchronization';
import {
  matchesRecordingFrameClockBinding,
  normalizeRecordingFrameClockLease,
  RECORDING_FRAME_CLOCK_PROBE_MS,
  type RecordingFrameClockAnchor,
  type RecordingFrameClockBinding,
  type RecordingFrameClockLease,
} from '../../../contracts/video/recording-frame-clock';
import { openRecordingFrameClockPort } from '../../../platform/media-utils/recording-frame-clock-client';

/** The helper may return only the original frame identity and its local clock readings. */
function readNativeClockResult(value: unknown, nonce: string, timestamp: number) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'result' ||
    !('nonce' in value) ||
    value.nonce !== nonce ||
    !('sourceTimestampUs' in value) ||
    value.sourceTimestampUs !== timestamp ||
    !('captureEpochMs' in value) ||
    typeof value.captureEpochMs !== 'number' ||
    !Number.isFinite(value.captureEpochMs) ||
    value.captureEpochMs <= 0 ||
    !('receivedAtMs' in value) ||
    typeof value.receivedAtMs !== 'number' ||
    !('repliedAtMs' in value) ||
    typeof value.repliedAtMs !== 'number' ||
    Object.keys(value).some(
      (key) =>
        ![
          'type',
          'nonce',
          'sourceTimestampUs',
          'captureEpochMs',
          'receivedAtMs',
          'repliedAtMs',
        ].includes(key)
    )
  )
    return null;
  return {
    captureEpochMs: value.captureEpochMs,
    receivedAtMs: value.receivedAtMs,
    repliedAtMs: value.repliedAtMs,
  };
}

/** One native source-frame calibration; subsequent segments use the encoder's chosen PTS. */
export class RecordingFrameClockObserver {
  private readonly cancellation = new AbortController();
  private firstTimestampUs: number | null = null;
  private firstCaptureEpochMs: number | null = null;
  private current: RecordingFrameClockAnchor | null = null;
  private revision = 0;
  private resolveReady!: () => void;
  readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor(
    private readonly binding: RecordingFrameClockBinding,
    private readonly lease: RecordingFrameClockLease | null,
    private readonly connect = openRecordingFrameClockPort,
    private readonly readClock = () => performance.timeOrigin + performance.now(),
    private readonly maximumUncertaintyMs = 1000 / 120
  ) {}

  get anchor(): RecordingFrameClockAnchor | null {
    return this.current ? { ...this.current } : null;
  }

  observeFirstFrame(frame: VideoFrame): void {
    if (this.firstTimestampUs !== null) return;
    this.firstTimestampUs = frame.timestamp;
    if (
      !Number.isSafeInteger(frame.timestamp) ||
      !this.lease ||
      !normalizeRecordingFrameClockLease(this.lease, this.binding) ||
      this.lease.expiresAtEpochMs <= Date.now() ||
      this.cancellation.signal.aborted
    ) {
      this.resolveReady();
      return;
    }
    let clone: VideoFrame;
    try {
      clone = frame.clone();
    } catch {
      this.resolveReady();
      return;
    }
    void this.probe(clone).then((measurement) => {
      if (measurement !== null && !this.cancellation.signal.aborted) {
        this.firstCaptureEpochMs = measurement.epoch;
        this.current = {
          ...this.binding,
          revision: ++this.revision,
          phase: 'active',
          captureEpochMs: measurement.epoch,
          uncertaintyMs: measurement.uncertaintyMs,
          maximumUncertaintyMs: this.maximumUncertaintyMs,
          mediaTimeSeconds: 0,
        };
      }
      this.resolveReady();
    });
  }

  pause(captureEpochMs: number): void {
    if (!this.current || this.current.phase !== 'active') return;
    const mediaTimeSeconds =
      this.current.mediaTimeSeconds + (captureEpochMs - this.current.captureEpochMs) / 1000;
    this.current = {
      ...this.binding,
      revision: ++this.revision,
      phase: 'paused',
      captureEpochMs,
      uncertaintyMs: this.current.uncertaintyMs ?? 0,
      maximumUncertaintyMs: this.maximumUncertaintyMs,
      mediaTimeSeconds: Math.max(0, mediaTimeSeconds),
    };
  }

  resume(
    sourceTimestampUs: number,
    chosenMediaTimeSeconds: number
  ): RecordingFrameClockAnchor | null {
    if (
      this.firstTimestampUs === null ||
      this.firstCaptureEpochMs === null ||
      !this.current ||
      this.cancellation.signal.aborted
    )
      return null;
    const captureEpochMs =
      this.firstCaptureEpochMs + (sourceTimestampUs - this.firstTimestampUs) / 1000;
    if (
      !Number.isFinite(captureEpochMs) ||
      !Number.isFinite(chosenMediaTimeSeconds) ||
      chosenMediaTimeSeconds < 0
    )
      return null;
    const previousBoundary =
      this.current.phase === 'paused'
        ? Math.min(this.current.mediaTimeSeconds, chosenMediaTimeSeconds)
        : null;
    this.current = {
      ...this.binding,
      revision: ++this.revision,
      phase: 'active',
      ...(previousBoundary === null ? {} : { previousMediaTimeSeconds: previousBoundary }),
      captureEpochMs,
      uncertaintyMs: this.current.uncertaintyMs ?? 0,
      maximumUncertaintyMs: this.maximumUncertaintyMs,
      mediaTimeSeconds: chosenMediaTimeSeconds,
    };
    return this.anchor;
  }

  dispose(): void {
    this.cancellation.abort();
    this.resolveReady();
  }

  private async probe(frame: VideoFrame): Promise<{ epoch: number; uncertaintyMs: number } | null> {
    const lease = this.lease;
    if (!lease || !matchesRecordingFrameClockBinding(lease, this.binding)) {
      frame.close();
      return null;
    }
    let connection: Awaited<ReturnType<typeof openRecordingFrameClockPort>> | null = null;
    let transferred = false;
    const timestamp = frame.timestamp;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    try {
      connection = await this.connect(lease, 'source', this.cancellation.signal);
      const { port } = connection;
      return await new Promise<{ epoch: number; uncertaintyMs: number } | null>((resolve) => {
        let sentAtMs = 0;
        let settled = false;
        const finish = (measurement: { epoch: number; uncertaintyMs: number } | null) => {
          if (settled) return;
          settled = true;
          this.cancellation.signal.removeEventListener('abort', cancelled);
          resolve(measurement);
        };
        const cancelled = () => finish(null);
        deadline = setTimeout(
          cancelled,
          Math.min(RECORDING_FRAME_CLOCK_PROBE_MS, Math.max(0, lease.expiresAtEpochMs - Date.now()))
        );
        this.cancellation.signal.addEventListener('abort', cancelled, { once: true });
        port.onmessageerror = cancelled;
        port.onmessage = (event: MessageEvent<unknown>) => {
          const receivedAtMs = this.readClock();
          const data = event.data;
          if (
            lease.expiresAtEpochMs <= Date.now() ||
            this.cancellation.signal.aborted ||
            event.ports.length > 0
          ) {
            event.ports.forEach((handle) => handle.close());
            cancelled();
            return;
          }
          if (typeof data !== 'object' || data === null || !('type' in data)) {
            cancelled();
            return;
          }
          if (
            data.type === 'ready' &&
            !transferred &&
            'nonce' in data &&
            data.nonce === lease.nonce
          ) {
            if (lease.expiresAtEpochMs <= Date.now() || this.cancellation.signal.aborted) {
              cancelled();
              return;
            }
            try {
              sentAtMs = this.readClock();
              port.postMessage(
                { type: 'frame', nonce: lease.nonce, sourceTimestampUs: timestamp, frame },
                [frame]
              );
              transferred = true;
            } catch {
              cancelled();
            }
            return;
          }
          const result = transferred ? readNativeClockResult(data, lease.nonce, timestamp) : null;
          if (!result) {
            cancelled();
            return;
          }
          const offset = inferRecordingClockOffset(
            [{ a0: sentAtMs, b1: result.receivedAtMs, b2: result.repliedAtMs, a3: receivedAtMs }],
            this.maximumUncertaintyMs - 0.1
          );
          if (!offset) {
            cancelled();
            return;
          }
          const epoch = result.captureEpochMs - offset.offsetMs;
          finish(
            Number.isFinite(epoch) && epoch > 0
              ? { epoch, uncertaintyMs: offset.uncertaintyMs + 0.1 }
              : null
          );
        };
      });
    } catch {
      return null;
    } finally {
      if (deadline !== null) clearTimeout(deadline);
      if (!transferred) frame.close();
      connection?.close();
    }
  }
}
