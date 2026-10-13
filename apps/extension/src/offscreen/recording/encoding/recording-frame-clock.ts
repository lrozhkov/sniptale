import type {
  RecordingFrameClockAnchor,
  RecordingFrameClockBinding,
} from '../../../contracts/video/recording-frame-clock';

export type RecordingSourceClockCalibration = Readonly<{ offsetMs: number; uncertaintyMs: number }>;

/** A fresh TAB source cannot capture before acquisition; receipt bounds its original native timestamp. */
export async function sampleRecordingSourceClock(
  track: MediaStreamVideoTrack,
  acquisitionEpochMs: number,
  readClock = () => performance.timeOrigin + performance.now(),
  timeoutMs = 250
): Promise<RecordingSourceClockCalibration | null> {
  if (typeof MediaStreamTrackProcessor === 'undefined') return null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader();
    const frameRead = reader
      .read()
      .then((result) => {
        const receiptEpochMs = readClock();
        const frame = result.value;
        if (!frame) return null;
        try {
          if (!Number.isSafeInteger(frame.timestamp)) return null;
          const lower = acquisitionEpochMs - frame.timestamp / 1000 - 0.2;
          const upper = receiptEpochMs - frame.timestamp / 1000 + 0.2;
          if (![lower, upper].every(Number.isFinite) || upper < lower) return null;
          return { offsetMs: (lower + upper) / 2, uncertaintyMs: (upper - lower) / 2 };
        } finally {
          frame.close();
        }
      })
      .catch(() => null);
    return await Promise.race([
      frameRead,
      new Promise<null>((resolve) => {
        deadline = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    // This reader borrows the capture track: cancellation never stops the recording source.
    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

/** Source timestamps retain their native clock; every active phase uses the encoder's chosen PTS. */
export class RecordingFrameClockObserver {
  private firstTimestampUs: number | null = null;
  private current: RecordingFrameClockAnchor | null = null;
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly binding: RecordingFrameClockBinding,
    private readonly calibration: RecordingSourceClockCalibration | null,
    private readonly maximumUncertaintyMs = 1000 / 120
  ) {}

  get anchor(): RecordingFrameClockAnchor | null {
    return this.current ? { ...this.current } : null;
  }

  observeFirstFrame(frame: VideoFrame): void {
    if (this.firstTimestampUs !== null || this.disposed) return;
    this.firstTimestampUs = frame.timestamp;
    this.bind(frame.timestamp, 0);
  }

  pause(captureEpochMs: number): void {
    if (!this.current || this.current.phase !== 'active' || this.disposed) return;
    const mediaTimeSeconds =
      this.current.mediaTimeSeconds + (captureEpochMs - this.current.captureEpochMs) / 1000;
    this.current = {
      ...this.current,
      revision: ++this.revision,
      phase: 'paused',
      captureEpochMs,
      mediaTimeSeconds: Math.max(0, mediaTimeSeconds),
    };
  }

  resume(
    sourceTimestampUs: number,
    chosenMediaTimeSeconds: number
  ): RecordingFrameClockAnchor | null {
    if (this.firstTimestampUs === null || this.disposed) return null;
    const boundary =
      this.current?.phase === 'paused'
        ? Math.min(this.current.mediaTimeSeconds, chosenMediaTimeSeconds)
        : undefined;
    this.bind(sourceTimestampUs, chosenMediaTimeSeconds, boundary);
    return this.anchor;
  }

  dispose(): void {
    this.disposed = true;
  }

  private bind(
    timestamp: number,
    mediaTimeSeconds: number,
    previousMediaTimeSeconds?: number
  ): void {
    if (
      !this.calibration ||
      !Number.isSafeInteger(timestamp) ||
      !Number.isFinite(mediaTimeSeconds) ||
      mediaTimeSeconds < 0
    )
      return;
    const captureEpochMs = timestamp / 1000 + this.calibration.offsetMs;
    if (!Number.isFinite(captureEpochMs) || captureEpochMs <= 0) return;
    this.current = {
      ...this.binding,
      revision: ++this.revision,
      phase: 'active',
      captureEpochMs,
      uncertaintyMs: this.calibration.uncertaintyMs,
      maximumUncertaintyMs: this.maximumUncertaintyMs,
      mediaTimeSeconds,
      ...(previousMediaTimeSeconds === undefined ? {} : { previousMediaTimeSeconds }),
    };
  }
}
