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
  private readonly frameTickEpsilon = 0.000001;
  private lastContinuousDuration: number | null = null;
  private nextEligibleTimestamp: number | null = null;
  private nextSegmentTickFloor: number | null = null;
  private pendingKeyFrame = true;
  private pendingSourceTimestamp: number | null = null;
  private pendingTick: number | null = null;
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
    const frameTick = this.toFrameTick(adjustedTimestamp);
    if (this.pendingTick === null) {
      this.pendingTick = frameTick;
      this.pendingSourceTimestamp = adjustedTimestamp;
      this.nextEligibleTimestamp = this.toTimestamp(frameTick + 1);
      return { kind: 'pending' };
    }
    if (frameTick <= this.pendingTick) {
      return {
        kind: 'coalesce',
        replacePending: adjustedTimestamp === this.pendingSourceTimestamp,
      };
    }

    if (
      this.nextEligibleTimestamp !== null &&
      adjustedTimestamp + this.frameTickEpsilon < this.nextEligibleTimestamp
    ) {
      return { kind: 'coalesce', replacePending: false };
    }
    const nextTick = Math.max(this.pendingTick + 1, frameTick);
    const duration = (nextTick - this.pendingTick) * this.fallbackDuration;
    const emitted: LiveVideoTimelineDecision = {
      duration,
      keyFrame: this.pendingKeyFrame,
      kind: 'emit',
      timestamp: this.toTimestamp(this.pendingTick),
    };
    this.pendingTick = nextTick;
    this.pendingSourceTimestamp = adjustedTimestamp;
    this.nextEligibleTimestamp = this.toTimestamp(this.pendingTick + 1);
    // A delayed source frame changes sample duration, not reference-frame validity. Only an
    // explicit segment restart below is allowed to request recovery from a new keyframe.
    const continuityBasis = Math.max(this.fallbackDuration, this.lastContinuousDuration ?? 0);
    this.pendingKeyFrame = false;
    if (duration <= continuityBasis * 2) this.lastContinuousDuration = duration;
    return emitted;
  }

  finish(): LiveVideoSampleTiming | null {
    if (this.pendingTick === null) return null;
    const timing = {
      duration: this.lastContinuousDuration ?? this.fallbackDuration,
      keyFrame: this.pendingKeyFrame,
      timestamp: this.toTimestamp(this.pendingTick),
    };
    this.nextSegmentTickFloor =
      this.pendingTick + Math.max(1, Math.round(timing.duration / this.fallbackDuration));
    this.pendingTick = null;
    this.pendingSourceTimestamp = null;
    return timing;
  }

  restart(timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('Live video timestamp must be finite.');
    if (this.pendingTick !== null) {
      throw new Error('Live video timeline cannot restart with a pending sample.');
    }
    const timestampFloor =
      this.nextSegmentTickFloor === null ? timestamp : this.toTimestamp(this.nextSegmentTickFloor);
    this.sourceTimestampOffset = Math.max(0, timestampFloor - timestamp);
    this.nextSegmentTickFloor = null;
    this.lastContinuousDuration = null;
    this.pendingKeyFrame = true;
    this.pendingTick = this.toFrameTick(timestamp + this.sourceTimestampOffset);
    this.pendingSourceTimestamp = timestamp + this.sourceTimestampOffset;
    this.nextEligibleTimestamp = this.toTimestamp(this.pendingTick + 1);
  }

  private toFrameTick(timestamp: number): number {
    return Math.max(0, Math.round(timestamp / this.fallbackDuration));
  }

  private toTimestamp(frameTick: number): number {
    return frameTick * this.fallbackDuration;
  }
}
