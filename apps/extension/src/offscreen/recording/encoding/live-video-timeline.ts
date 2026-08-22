export type LiveVideoSampleTiming = Readonly<{
  duration: number;
  keyFrame: boolean;
  timestamp: number;
}>;

type LiveVideoTimelineDecision =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'coalesce'; replacePending: boolean }>
  | (LiveVideoSampleTiming & Readonly<{ kind: 'emit' }>);

/** Owns the truthful VFR timeline between capture timestamps and encoded samples. */
export class LiveVideoTimeline {
  private readonly fallbackDuration: number;
  private lastContinuousDuration: number | null = null;
  private nextEligibleTimestamp: number | null = null;
  private nextSegmentTimestampFloor: number | null = null;
  private pendingKeyFrame = true;
  private pendingTimestamp: number | null = null;
  private sourceTimestampOffset = 0;

  constructor(requestedFrameRate: number) {
    if (!Number.isFinite(requestedFrameRate) || requestedFrameRate <= 0) {
      throw new Error('Live video frame rate must be positive and finite.');
    }
    this.fallbackDuration = 1 / requestedFrameRate;
  }

  accept(timestamp: number): LiveVideoTimelineDecision {
    if (!Number.isFinite(timestamp)) {
      throw new Error('Live video timestamp must be finite.');
    }
    const adjustedTimestamp = timestamp + this.sourceTimestampOffset;
    if (this.pendingTimestamp === null) {
      this.pendingTimestamp = adjustedTimestamp;
      this.nextEligibleTimestamp = adjustedTimestamp + this.fallbackDuration;
      return { kind: 'pending' };
    }
    if (adjustedTimestamp <= this.pendingTimestamp) {
      return {
        kind: 'coalesce',
        replacePending: adjustedTimestamp === this.pendingTimestamp,
      };
    }

    const duration = adjustedTimestamp - this.pendingTimestamp;
    if (
      this.nextEligibleTimestamp !== null &&
      adjustedTimestamp + 0.000001 < this.nextEligibleTimestamp
    ) {
      return { kind: 'coalesce', replacePending: false };
    }
    const emitted: LiveVideoTimelineDecision = {
      duration,
      keyFrame: this.pendingKeyFrame,
      kind: 'emit',
      timestamp: this.pendingTimestamp,
    };
    this.pendingTimestamp = adjustedTimestamp;
    this.advanceEligibilityPast(adjustedTimestamp);
    // Compare against both the requested ceiling and the observed cadence so a steady 30 FPS
    // source under a 60 FPS request does not become an all-keyframe stream.
    const continuityBasis = Math.max(this.fallbackDuration, this.lastContinuousDuration ?? 0);
    this.pendingKeyFrame = duration > continuityBasis * 2;
    if (!this.pendingKeyFrame) this.lastContinuousDuration = duration;
    return emitted;
  }

  finish(): LiveVideoSampleTiming | null {
    if (this.pendingTimestamp === null) return null;
    const timing = {
      duration: this.lastContinuousDuration ?? this.fallbackDuration,
      keyFrame: this.pendingKeyFrame,
      timestamp: this.pendingTimestamp,
    };
    this.nextSegmentTimestampFloor = timing.timestamp + timing.duration;
    this.pendingTimestamp = null;
    return timing;
  }

  restart(timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('Live video timestamp must be finite.');
    if (this.pendingTimestamp !== null) {
      throw new Error('Live video timeline cannot restart with a pending sample.');
    }
    const timestampFloor = this.nextSegmentTimestampFloor ?? timestamp;
    this.sourceTimestampOffset = Math.max(0, timestampFloor - timestamp);
    this.nextSegmentTimestampFloor = null;
    this.lastContinuousDuration = null;
    this.pendingKeyFrame = true;
    this.pendingTimestamp = timestamp + this.sourceTimestampOffset;
    this.nextEligibleTimestamp = this.pendingTimestamp + this.fallbackDuration;
  }

  private advanceEligibilityPast(timestamp: number): void {
    if (this.nextEligibleTimestamp === null) {
      this.nextEligibleTimestamp = timestamp + this.fallbackDuration;
      return;
    }
    do {
      this.nextEligibleTimestamp += this.fallbackDuration;
    } while (this.nextEligibleTimestamp <= timestamp + 0.000001);
  }
}
