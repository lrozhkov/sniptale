import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
import type { QuickEditOriginalAudio } from '../../features/video/review/advanced/types';
import {
  buildReviewTimeMap,
  sourceToReviewResult,
  type ReviewTimeSegment,
} from '../../features/video/review/timeline';
import { retimeReviewResultRange } from '../../features/video/review/timeline-placement';
import type { ReviewEdit } from '../../features/video/review/types';
import type { ReviewActionAudioUnavailable } from '../../features/video/review/action-audio';
import {
  createReviewPlaybackRange,
  resolveReviewPlaybackSample,
  reviewPlaybackRangeStart,
  type ReviewPlaybackRange,
} from './playback-range';

/** One native observation. Adapters read the media element once per controller operation. */
export interface ReviewTransportMediaObservation {
  sourceId: string;
  time: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  readyState: number;
  errorCode: number | null;
}

/** Logical position and decoded sample share one epoch and accepted temporal map. */
export interface ReviewTransportPosition {
  readonly epoch: number;
  readonly mapRevision: number;
  readonly resultTime: number | null;
  readonly source: Readonly<{
    kind: 'video' | 'freeze';
    sourceTime: number;
    mediaTime: number;
    segmentId: string;
  }> | null;
  /** Recording can traverse removed source time without claiming a visible result sample. */
  readonly media: Readonly<{ sourceId: string; time: number }> | null;
}

export type ReviewTransportFailure =
  | { kind: 'media'; code: number | null }
  | { kind: 'audio'; reason?: ReviewActionAudioUnavailable['reason'] }
  | { kind: 'play' };

interface ReviewTransportStatus {
  readonly mode: 'paused' | 'preparing' | 'playing' | 'recovering' | 'failed' | 'ended';
  readonly playing: boolean;
  readonly range: Readonly<ReviewPlaybackRange> | null;
  readonly seekRevision: number;
  readonly navigationRevision: number;
  /** Updated on commands and segment/status transitions, never on a continuous tick alone. */
  readonly position: ReviewTransportPosition;
  readonly failure: ReviewTransportFailure | null;
}

export interface ReviewTransportConfiguration {
  sourceId: string;
  duration: number;
  edits: readonly ReviewEdit[];
  original: QuickEditOriginalAudio;
  silent?: boolean;
  retainCutTime?: boolean;
  boundaries?(): readonly number[] | undefined;
}

/** One accepted audio activation; later completions retain this epoch and temporal map. */
export interface ReviewTransportAudioRequest {
  position: ReviewTransportPosition;
  seekRevision: number;
}

/** Derived accepted temporal data; this does not own or mutate the project document. */
export interface ReviewTransportTimeMapSnapshot {
  readonly mapRevision: number;
  readonly duration: number;
  readonly segments: readonly ReviewTimeSegment[];
  readonly edits: readonly ReviewEdit[];
}

/** Read-only pair from one running audio context; scheduling never uses output time. */
export interface ReviewTransportAudioClock {
  readonly identity: object;
  readonly graphTime: number;
  readonly outputTime?: number | null;
}
export interface ReviewTransportDependencies {
  now(): number;
  /** Used only for the existing bounded decoder recovery, not for playback cadence. */
  schedule(delayMs: number, callback: () => void): () => void;
  media: {
    read(): ReviewTransportMediaObservation | null;
    seek(time: number): void;
    play(): Promise<void>;
    pause(): void;
    configure(settings: { rate: number; muted: boolean; volume: number }): void;
    recoveryMode(active: boolean): void;
    reload(): void;
  };
  audio: {
    readClock?(): ReviewTransportAudioClock | null;
    prepare(signal: AbortSignal, request: ReviewTransportAudioRequest): boolean | Promise<boolean>;
    start(request: ReviewTransportAudioRequest): void;
    stop(): void;
  };
  onSeek?(sourceTime: number): void;
  onFailure?(failure: ReviewTransportFailure): void;
  onRecovered?(): void;
  onInvalidRange?(): void;
}

interface Hold {
  segment: ReviewTimeSegment;
  elapsed: number;
  started: number | null;
}
interface Recovery {
  sourceTime: number;
  resume: boolean;
  restored: boolean;
  cancelReload(): void;
  cancelDeadline(): void;
}

interface NativePlayRequest {
  revision: number;
  sourceId: string;
  promise: Promise<void>;
  interruptedByPause: boolean;
}

interface RunningReference {
  kind: 'audio' | 'monotonic';
  resultTime: number;
  clock: number;
  monotonic: number;
  identity: object | null;
  projection: { start: number; floor: number; offset: number; pending: boolean };
  drain?: { boundary: number; loop: boolean } | undefined;
}

/** Match the existing preview drift threshold; ordinary native frame jitter must not seek. */
const NATIVE_DRIFT_SECONDS = 0.15;
/** Native seek receipts can round by a fraction of one 48 kHz audio sample. */
const NATIVE_RECEIPT_SECONDS = 1 / 48000;

/** Gallery-local transport authority; React and native resource lifecycles are adapters. */
export function createReviewTransportController(
  configuration: ReviewTransportConfiguration,
  dependencies: ReviewTransportDependencies
) {
  return new ReviewTransportController(configuration, dependencies);
}

class ReviewTransportController {
  private configuration: ReviewTransportConfiguration;
  private segments: readonly ReviewTimeSegment[];
  private timeMap: ReviewTransportTimeMapSnapshot;
  private epoch = 0;
  private mapRevision = 0;
  private intentRevision = 0;
  private desiredPlaying = false;
  private mode: ReviewTransportStatus['mode'] = 'paused';
  private failure: ReviewTransportFailure | null = null;
  private range: ReviewPlaybackRange | null = null;
  private hold: Hold | null = null;
  private played = new Set<string>();
  private previousSource: number | null = null;
  private sourceFloor: number | null = null;
  private sourceTime = 0;
  private preparation: AbortController | null = null;
  private recovery: Recovery | null = null;
  private automaticRecoveryUsed = false;
  private seekRevision = 0;
  private navigationRevision = 0;
  private disposed = false;
  private reference: RunningReference | null = null;
  private nativePlay: NativePlayRequest | null = null;
  private status: ReviewTransportStatus;
  private positionListeners = new Set<(position: ReviewTransportPosition) => void>();
  private statusListeners = new Set<() => void>();

  constructor(
    configuration: ReviewTransportConfiguration,
    private dependencies: ReviewTransportDependencies
  ) {
    this.configuration = configuration;
    this.segments = buildReviewTimeMap(configuration.duration, configuration.edits);
    this.timeMap = {
      mapRevision: 0,
      duration: configuration.duration,
      segments: this.segments,
      edits: configuration.edits,
    };
    this.status = this.snapshotStatus();
  }

  /** Samples native time and monotonic time once; receipts cannot change this position. */
  readPosition = (): ReviewTransportPosition => {
    if (this.disposed) return this.status.position;
    return this.positionAt(this.observe(), this.dependencies.now(), this.readAudioClock());
  };

  /** Audio input control reads graph phase; preview consumers use the public output position. */
  readSchedulingPosition = (): ReviewTransportPosition => {
    if (this.disposed) return this.status.position;
    const observation = this.observe();
    const now = this.dependencies.now();
    const clock = this.readAudioClock();
    return this.reference && this.desiredPlaying
      ? this.positionAtResult(this.referenceTime(now, clock), observation)
      : this.positionAt(observation, now, clock);
  };

  getStatusSnapshot = (): ReviewTransportStatus => this.status;
  getTimeMapSnapshot = (): ReviewTransportTimeMapSnapshot => this.timeMap;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  subscribePosition = (listener: (position: ReviewTransportPosition) => void): (() => void) => {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  };

  /** Preview retains receipts; validation cannot change the accepted transport target. */
  acceptsPresentation = (position: {
    epoch: number;
    mapRevision: number;
    resultTime: number;
  }): boolean => {
    if (
      this.disposed ||
      position.epoch !== this.epoch ||
      position.mapRevision !== this.mapRevision ||
      !Number.isFinite(position.resultTime) ||
      position.resultTime < 0 ||
      position.resultTime > this.resultDuration()
    )
      return false;
    return true;
  };

  /** Accepts temporal changes without depending on durable workspace publication revisions. */
  configure = (configuration: ReviewTransportConfiguration): void => {
    if (this.disposed) return;
    const before = this.segments;
    const next = buildReviewTimeMap(configuration.duration, configuration.edits);
    const sourceChanged = configuration.sourceId !== this.configuration.sourceId;
    const mapChanged = !sameSegments(before, next);
    if (mapChanged && (this.mode === 'preparing' || this.mode === 'playing')) this.pause();
    const oldHold = this.hold;
    this.configuration = configuration;
    if (mapChanged) {
      this.segments = next;
      this.mapRevision++;
      if (this.range?.result) {
        const result = retimeReviewResultRange(this.range.result, before, next);
        this.range =
          result.end - result.start >= 0.05 - 1e-9
            ? {
                start: this.sourceAtResult(result.start),
                end: this.sourceAtResult(result.end, true),
                result,
              }
            : null;
      }
    }
    if (
      mapChanged ||
      this.timeMap.edits !== configuration.edits ||
      this.timeMap.duration !== configuration.duration
    )
      this.timeMap = {
        mapRevision: this.mapRevision,
        duration: configuration.duration,
        segments: this.segments,
        edits: configuration.edits,
      };
    if (sourceChanged) {
      this.cancelWork();
      this.reference = null;
      this.dependencies.audio.stop();
      this.desiredPlaying = false;
      this.mode = 'paused';
      this.dependencies.media.pause();
      this.epoch++;
      this.hold = null;
      this.played.clear();
      this.previousSource = null;
      this.sourceFloor = null;
      this.sourceTime = 0;
      this.range = null;
      this.failure = null;
      this.automaticRecoveryUsed = false;
    } else if (oldHold && mapChanged) {
      const replacement = next.find((part) => part.freezeId === oldHold.segment.freezeId);
      if (replacement) oldHold.segment = replacement;
      else {
        const source = oldHold.segment.sourceStart;
        this.hold = null;
        this.commitSeek(source, sourceToReviewResult(source, next));
        return;
      }
    }
    if (this.range && !this.range.result) {
      const normalized = createReviewPlaybackRange(
        this.range.start,
        this.range.end,
        configuration.duration
      );
      if (!normalized || normalized.start !== this.range.start || normalized.end !== this.range.end)
        this.range = normalized;
      if (this.range && reviewPlaybackRangeStart(this.range, configuration.edits) === null)
        this.range = null;
      if (!this.range) this.pause();
    }
    const observation = this.observe();
    if (observation && !this.hold) this.applySource(observation.time, false);
    this.publishStatus(mapChanged || sourceChanged);
    this.publishPosition();
  };

  pause = (): void => {
    if (this.disposed) return;
    this.pauseAt(this.readPosition());
  };

  /** Commands can stop at their single activation snapshot without sampling a second clock. */
  pauseAt = (position: ReviewTransportPosition): boolean => {
    if (this.disposed || position.epoch !== this.epoch || position.mapRevision !== this.mapRevision)
      return false;
    const referenced = this.reference !== null;
    const graphStopped = this.reference?.drain !== undefined;
    const hold =
      position.source?.kind === 'freeze'
        ? this.holds().find((part) => `freeze:${part.freezeId}` === position.source?.segmentId)
        : undefined;
    this.hold = hold
      ? {
          segment: hold,
          elapsed: Math.max(
            0,
            Math.min(
              hold.resultEnd - hold.resultStart,
              (position.resultTime ?? hold.resultStart) - hold.resultStart
            )
          ),
          started: null,
        }
      : null;
    this.sourceTime = this.clampSource(
      position.source?.sourceTime ?? position.media?.time ?? this.sourceTime
    );
    this.previousSource = this.sourceTime;
    if (position.resultTime !== null)
      for (const part of this.holds())
        if (part.resultEnd <= position.resultTime) this.played.add(part.freezeId!);
    if (hold) this.played.add(hold.freezeId!);
    this.reference = null;
    this.cancelWork();
    this.desiredPlaying = false;
    this.mode = 'paused';
    if (!graphStopped) this.dependencies.audio.stop();
    this.dependencies.media.pause();
    if ((referenced || hold) && position.source)
      this.dependencies.media.seek(position.source.mediaTime);
    this.publishStatus(true, position);
    this.publishPosition(position);
    return true;
  };

  play = async (): Promise<void> => {
    if (this.disposed || this.desiredPlaying || this.mode === 'preparing') return;
    if (this.recovery) {
      this.recovery.resume = true;
      return;
    }
    if (
      this.observe()?.errorCode === 3 ||
      (this.mode === 'failed' && this.failure?.kind === 'media' && this.failure.code === 3)
    ) {
      this.startRecovery(true);
      return;
    }
    const observation = this.observe();
    if (!this.hold && observation && observation.time >= this.configuration.duration) {
      this.seekSource(0, false);
      this.played.clear();
    }
    this.desiredPlaying = true;
    await this.startPlayback();
  };

  toggle = (): Promise<void> => {
    if (this.recovery) {
      this.recovery.resume = !this.recovery.resume;
      return Promise.resolve();
    }
    if (this.desiredPlaying || this.mode === 'preparing') {
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  };

  seekSource = (requested: number, snap = true): void => {
    if (this.disposed || !Number.isFinite(requested)) return;
    const clamped = this.clampSource(requested);
    const boundaries = snap ? this.configuration.boundaries?.() : undefined;
    const source = boundaries ? nearestReviewBoundary(clamped, boundaries) : clamped;
    const result = sourceToReviewResult(source, this.segments);
    if (
      this.range &&
      (this.range.result
        ? result === null || result < this.range.result.start || result >= this.range.result.end
        : source < this.range.start || source >= this.range.end)
    )
      this.range = null;
    this.commitSeek(source, result);
  };

  seekResult = (requested: number): void => {
    if (this.disposed || !Number.isFinite(requested)) return;
    const time = Math.max(0, Math.min(this.resultDuration(), requested));
    const part = this.segments.find(
      (segment) => segment.kind !== 'cut' && time >= segment.resultStart && time < segment.resultEnd
    );
    const source = part
      ? part.sourceStart + (time - part.resultStart) * part.rate
      : this.configuration.duration;
    if (
      this.range &&
      (this.range.result
        ? time < this.range.result.start || time >= this.range.result.end
        : source < this.range.start || source >= this.range.end)
    )
      this.range = null;
    this.commitSeek(
      source,
      time,
      part?.kind === 'freeze'
        ? { segment: part, elapsed: time - part.resultStart, started: null }
        : null
    );
  };

  setRange = (requested: ReviewPlaybackRange | null): void => {
    if (this.disposed) return;
    if (!requested) {
      if (!this.range) return;
      this.range = null;
      this.publishStatus();
      return;
    }
    if (requested.result) {
      const { start, end } = requested.result;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end > this.resultDuration() ||
        end - start < 0.05 - 1e-9
      )
        return;
      this.range = {
        start: this.sourceAtResult(start),
        end: this.sourceAtResult(end, true),
        result: { start, end },
      };
      this.seekResult(start);
      return;
    }
    const range = createReviewPlaybackRange(
      requested.start,
      requested.end,
      this.configuration.duration
    );
    if (!range) return;
    const start = reviewPlaybackRangeStart(range, this.configuration.edits);
    if (start === null) {
      this.dependencies.onInvalidRange?.();
      return;
    }
    this.range = range;
    this.seekSource(start, false);
    this.played.clear();
  };

  /** Called by the single lifecycle adapter's existing frame callback. */
  tick = (): void => {
    if (this.disposed || !this.desiredPlaying || this.mode !== 'playing') return;
    const observation = this.observe();
    if (!observation) return;
    const now = this.dependencies.now();
    const audioClock = this.readAudioClock();
    this.updateReference(observation, now, audioClock);
    if (!this.desiredPlaying || this.mode !== 'playing') return;
    if (this.reference) {
      this.tickReference(observation, now, audioClock);
      return;
    }
    if (this.hold) {
      if (this.hold.started === null && !observation.seeking && observation.readyState >= 2)
        this.hold.started = now;
      const position = this.positionAt(observation, now);
      if (
        this.range?.result &&
        position.resultTime !== null &&
        position.resultTime >= this.range.result.end
      ) {
        this.restartRange();
        return;
      }
      if (
        this.holdElapsed(this.hold, now) >=
        this.hold.segment.resultEnd - this.hold.segment.resultStart
      ) {
        const completed = this.hold.segment;
        const next = this.holds().find(
          (part) => part.resultStart === completed.resultEnd && !this.played.has(part.freezeId!)
        );
        if (next) this.enterHold(next, 0, true);
        else {
          this.hold = null;
          this.sourceFloor = completed.sourceStart;
          this.sourceTime = completed.sourceStart;
          this.previousSource = completed.sourceStart;
          this.dependencies.media.seek(completed.sourceStart);
          if (completed.sourceStart >= this.configuration.duration) this.ended();
          else void this.resumeNative();
          this.publishStatus();
        }
      }
    } else if (!observation.paused && !observation.seeking) {
      const result = sourceToReviewResult(observation.time, this.segments);
      if (
        !this.configuration.retainCutTime &&
        this.range?.result &&
        result !== null &&
        (result < this.range.result.start - 1e-7 || result >= this.range.result.end)
      ) {
        this.restartRange();
        return;
      }
      if (this.previousSource !== null && observation.time < this.previousSource - 0.1)
        this.played.clear();
      const pending = this.pendingHold(observation.time);
      this.previousSource = observation.time;
      if (pending && (!this.range || pending.sourceStart < this.range.end))
        this.enterHold(pending, 0, true);
      else {
        const sample = this.applySource(observation.time, true);
        if (sample.looped) {
          this.restartRange();
          return;
        }
        if (sample.time >= this.configuration.duration) this.ended();
      }
    }
    this.publishPosition();
  };

  /** Native events confirm adapter state; they cannot directly set logical playing. */
  observeMedia = (
    event: 'play' | 'pause' | 'ended' | 'metadata' | 'ready' | 'seeked' | 'error'
  ): void => {
    if (this.disposed) return;
    const observation = this.observe();
    if (!observation) return;
    if (event === 'error') {
      if (observation.errorCode !== null) this.mediaError(observation.errorCode);
      return;
    }
    if (this.recovery) {
      if (event === 'metadata') {
        this.dependencies.media.seek(this.hold?.segment.frameTime ?? this.recovery.sourceTime);
        if (!this.hold) this.applySource(this.recovery.sourceTime, false);
        this.recovery.restored = true;
      }
      if (
        (event === 'ready' || event === 'seeked') &&
        this.recovery.restored &&
        !observation.seeking &&
        observation.readyState >= 3
      ) {
        const resume = this.recovery.resume;
        this.cancelRecovery();
        this.mode = 'paused';
        this.failure = null;
        this.publishStatus();
        if (resume) void this.play();
        else this.dependencies.onRecovered?.();
      }
      return;
    }
    if (
      event === 'seeked' &&
      !observation.seeking &&
      observation.paused &&
      !this.desiredPlaying &&
      !this.hold &&
      (this.mode === 'paused' || this.mode === 'ended') &&
      Math.abs(this.clampSource(observation.time) - this.sourceTime) > NATIVE_RECEIPT_SECONDS
    ) {
      this.seekSource(observation.time, false);
      return;
    }
    if (this.reference?.drain && event === 'pause') {
      this.publishPosition();
      return;
    }
    if (event === 'ended' && this.reference) {
      this.publishPosition();
      return;
    }
    if (event === 'ended' && observation.ended && this.desiredPlaying) this.ended();
    else if (
      event === 'pause' &&
      observation.paused &&
      !observation.ended &&
      !this.hold &&
      this.mode === 'playing'
    )
      this.pause();
    else if (event === 'play' && !observation.paused && !this.desiredPlaying)
      this.dependencies.media.pause();
    else if (
      event === 'play' &&
      !observation.paused &&
      this.desiredPlaying &&
      this.mode === 'playing'
    )
      this.publishStatus();
    this.publishPosition();
  };

  fail = (failure: ReviewTransportFailure): void => {
    if (this.disposed) return;
    this.pause();
    this.failure = failure;
    this.mode = 'failed';
    this.publishStatus();
    this.dependencies.onFailure?.(failure);
  };

  /** Effect cleanup cancels work immediately; StrictMode can retain the same inactive instance. */
  deactivate = (): void => {
    if (this.disposed) return;
    const position = this.readPosition();
    this.cancelWork();
    this.desiredPlaying = false;
    this.mode = 'paused';
    this.reference = null;
    this.dependencies.audio.stop();
    this.dependencies.media.pause();
    const status = this.snapshotStatus(position);
    if (!sameStatus(this.status, status)) this.status = status;
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.deactivate();
    this.disposed = true;
    this.positionListeners.clear();
    this.statusListeners.clear();
  };

  private observe() {
    const observation = this.dependencies.media.read();
    return observation?.sourceId === this.configuration.sourceId ? observation : null;
  }

  private readAudioClock(): ReviewTransportAudioClock | null {
    if (this.configuration.silent || this.configuration.retainCutTime) return null;
    const time = this.dependencies.audio.readClock?.();
    return time && Number.isFinite(time.graphTime) ? time : null;
  }

  private referenceTime(now: number, audioClock: ReviewTransportAudioClock | null) {
    const reference = this.reference!;
    const elapsed =
      reference.kind === 'audio' && audioClock !== null && !this.audioInterrupted(now, audioClock)
        ? audioClock.graphTime - reference.clock
        : Math.max(0, now / 1000 - reference.monotonic);
    return reference.resultTime + elapsed;
  }

  private audioInterrupted(now: number, audioClock: ReviewTransportAudioClock) {
    const reference = this.reference!;
    return (
      audioClock.identity !== reference.identity ||
      audioClock.graphTime < reference.clock ||
      now / 1000 - reference.monotonic - (audioClock.graphTime - reference.clock) >
        NATIVE_DRIFT_SECONDS
    );
  }

  private updateReference(
    observation: ReviewTransportMediaObservation,
    now: number,
    audioClock: ReviewTransportAudioClock | null
  ) {
    if (this.configuration.retainCutTime || this.configuration.silent) {
      this.reference = null;
      return;
    }
    const reference = this.reference;
    if (!reference) {
      const position = this.positionAt(observation, now);
      if (audioClock !== null && position.resultTime !== null)
        this.reference = {
          kind: 'audio',
          resultTime: position.resultTime,
          clock: audioClock.graphTime,
          monotonic: now / 1000,
          identity: audioClock.identity,
          projection: this.newProjection(position.resultTime, audioClock),
        };
      return;
    }
    const resultTime = this.referenceTime(now, audioClock);
    const resuming =
      audioClock !== null &&
      (reference.kind === 'monotonic' || this.audioInterrupted(now, audioClock));
    this.reference = {
      kind: audioClock === null ? 'monotonic' : 'audio',
      resultTime,
      clock: audioClock?.graphTime ?? now / 1000,
      monotonic: now / 1000,
      identity: audioClock?.identity ?? reference.identity,
      projection: reference.projection,
      drain: reference.drain,
    };
    if (audioClock && audioClock.identity !== reference.identity) {
      this.reference.projection = {
        ...reference.projection,
        offset: 0,
        pending: audioClock.outputTime === null,
      };
    }
    if (resuming && !reference.drain && resultTime < this.resultDuration()) {
      try {
        this.dependencies.audio.start({
          position: this.positionAtResult(resultTime, observation),
          seekRevision: this.seekRevision,
        });
      } catch {
        this.fail({ kind: 'audio' });
      }
    }
  }

  private newProjection(start: number, clock: ReviewTransportAudioClock) {
    return { start, floor: start, offset: 0, pending: clock.outputTime === null };
  }

  /** Calibration is derived from the one graph reference; reads never schedule or publish work. */
  private presentationTime(graphResult: number, clock: ReviewTransportAudioClock | null) {
    const reference = this.reference!;
    const projection = reference.projection;
    if (
      clock?.identity === reference.identity &&
      typeof clock.outputTime === 'number' &&
      Number.isFinite(clock.outputTime) &&
      clock.outputTime <= clock.graphTime
    ) {
      projection.offset = clock.outputTime - clock.graphTime;
      projection.pending = false;
    }
    const result = projection.pending ? projection.floor : graphResult + projection.offset;
    projection.floor = Math.max(projection.start, projection.floor, result);
    return projection.floor;
  }

  private positionAtResult(
    result: number,
    observation: ReviewTransportMediaObservation | null
  ): ReviewTransportPosition {
    const time = Math.max(0, Math.min(this.resultDuration(), result));
    let index = this.segments.findIndex(
      (part) => part.kind !== 'cut' && time >= part.resultStart && time < part.resultEnd
    );
    if (index < 0 && time === this.resultDuration())
      index = this.segments.findLastIndex((part) => part.kind !== 'cut');
    const part = this.segments[index];
    const sourceTime = part ? part.sourceStart + (time - part.resultStart) * part.rate : null;
    return {
      epoch: this.epoch,
      mapRevision: this.mapRevision,
      resultTime: time,
      source:
        !part || sourceTime === null
          ? null
          : {
              kind: part.kind === 'freeze' ? 'freeze' : 'video',
              sourceTime,
              mediaTime: part.kind === 'freeze' ? part.frameTime! : sourceTime,
              segmentId: part.kind === 'freeze' ? `freeze:${part.freezeId}` : `video:${index}`,
            },
      media: observation ? { sourceId: observation.sourceId, time: observation.time } : null,
    };
  }

  private tickReference(
    observation: ReviewTransportMediaObservation,
    now: number,
    audioClock: ReviewTransportAudioClock | null
  ) {
    const graphResult = this.referenceTime(now, audioClock);
    const position = this.positionAtResult(graphResult, observation);
    const result = position.resultTime!;
    const source = position.source;
    const drain = this.reference!.drain;
    if (drain) {
      this.drainReference(drain.boundary, drain.loop, graphResult, observation, audioClock);
      return;
    }
    for (const part of this.holds()) if (part.resultEnd <= result) this.played.add(part.freezeId!);
    if (
      this.range &&
      (this.range.result
        ? result < this.range.result.start - 1e-7 || result >= this.range.result.end
        : source && (source.sourceTime < this.range.start || source.sourceTime >= this.range.end))
    ) {
      const end = this.range.result?.end ?? this.rangeResultEnd(this.range.end);
      if (result >= end) this.drainReference(end, true, graphResult, observation, audioClock);
      else this.restartRange();
      return;
    }
    if (result >= this.resultDuration()) {
      this.drainReference(this.resultDuration(), false, graphResult, observation, audioClock);
      return;
    }
    if (!source) return;
    if (source.kind === 'freeze') {
      const segment = this.holds().find((part) => `freeze:${part.freezeId}` === source.segmentId)!;
      if (this.hold?.segment !== segment)
        this.enterHold(segment, result - segment.resultStart, true);
    } else {
      const leavingHold = this.hold !== null;
      this.hold = null;
      const part = this.segments.find((_item, index) => `video:${index}` === source.segmentId)!;
      const sameSegment = observation.time >= part.sourceStart && observation.time < part.sourceEnd;
      if (
        !observation.seeking &&
        !this.nativePlay &&
        (leavingHold ||
          !sameSegment ||
          Math.abs(observation.time - source.mediaTime) > NATIVE_DRIFT_SECONDS)
      )
        this.dependencies.media.seek(source.mediaTime);
      this.applySource(source.sourceTime, false);
      this.previousSource = source.sourceTime;
      if (observation.paused && !observation.seeking) void this.resumeNative();
      if (leavingHold) this.publishStatus();
    }
    this.publishPosition(
      this.positionAtResult(this.presentationTime(graphResult, audioClock), observation)
    );
  }

  private rangeResultEnd(source: number) {
    const part = this.segments.find(
      (segment) => source >= segment.sourceStart && source <= segment.sourceEnd
    );
    return part
      ? part.kind === 'cut' || part.kind === 'freeze'
        ? part.resultStart
        : part.resultStart + (source - part.sourceStart) / part.rate
      : this.resultDuration();
  }

  /** Stop graph inputs once, then let the borrowed output clock finish the published interval. */
  private drainReference(
    boundary: number,
    loop: boolean,
    graphResult: number,
    observation: ReviewTransportMediaObservation,
    clock: ReviewTransportAudioClock | null
  ) {
    const output = this.presentationTime(graphResult, clock);
    if (output >= boundary - 1e-9) {
      this.reference!.projection.floor = Math.max(this.reference!.projection.floor, boundary);
      this.publishPosition(this.positionAtResult(boundary, observation));
      if (loop) this.restartRange();
      else this.ended();
      return;
    }
    if (!this.reference!.drain) {
      this.reference!.drain = { boundary, loop };
      this.dependencies.audio.stop();
      this.pauseNativeInput();
    }
    this.publishPosition(this.positionAtResult(output, observation));
  }

  private positionAt(
    observation: ReviewTransportMediaObservation | null,
    now: number,
    audioClock: ReviewTransportAudioClock | null = null
  ): ReviewTransportPosition {
    if (this.reference && this.desiredPlaying)
      return this.positionAtResult(
        this.presentationTime(this.referenceTime(now, audioClock), audioClock),
        observation
      );
    const hold = this.hold;
    const source = this.clampSource(
      Math.max(
        this.sourceFloor ?? 0,
        this.recovery?.sourceTime ??
          (this.desiredPlaying ? observation?.time : undefined) ??
          this.sourceTime
      )
    );
    const pending = !hold && this.desiredPlaying ? this.pendingHold(source) : null;
    const segment = hold?.segment ?? pending;
    const media = observation ? { sourceId: observation.sourceId, time: observation.time } : null;
    if (segment)
      return {
        epoch: this.epoch,
        mapRevision: this.mapRevision,
        resultTime: segment.resultStart + (hold ? this.holdElapsed(hold, now) : 0),
        source: {
          kind: 'freeze',
          sourceTime: segment.sourceStart,
          mediaTime: segment.frameTime!,
          segmentId: `freeze:${segment.freezeId}`,
        },
        media,
      };
    const resultTime = sourceToReviewResult(source, this.segments);
    const index = this.segments.findIndex(
      (part) =>
        part.kind !== 'freeze' &&
        part.kind !== 'cut' &&
        ((source >= part.sourceStart && source < part.sourceEnd) ||
          (source === this.configuration.duration && source === part.sourceEnd))
    );
    return {
      epoch: this.epoch,
      mapRevision: this.mapRevision,
      resultTime,
      source:
        index < 0
          ? null
          : { kind: 'video', sourceTime: source, mediaTime: source, segmentId: `video:${index}` },
      media,
    };
  }

  private holdElapsed(hold: Hold, now: number) {
    return Math.min(
      hold.segment.resultEnd - hold.segment.resultStart,
      hold.elapsed + (hold.started === null ? 0 : Math.max(0, now - hold.started) / 1000)
    );
  }

  private holds() {
    return this.segments.filter((part) => part.kind === 'freeze');
  }
  private resultDuration() {
    return this.segments.at(-1)?.resultEnd ?? 0;
  }
  private clampSource(time: number) {
    return Math.max(0, Math.min(this.configuration.duration, time));
  }
  private pendingHold(source: number) {
    const from = this.previousSource ?? source;
    return this.holds().find(
      (part) =>
        !this.played.has(part.freezeId!) && part.sourceStart >= from && part.sourceStart <= source
    );
  }
  private sourceAtResult(time: number, end = false) {
    const part = this.segments.find(
      (segment) =>
        segment.kind !== 'cut' &&
        (end
          ? time > segment.resultStart && time <= segment.resultEnd
          : time >= segment.resultStart && time < segment.resultEnd)
    );
    return part
      ? part.sourceStart + (time - part.resultStart) * part.rate
      : this.configuration.duration;
  }

  private commitSeek(
    source: number,
    result: number | null,
    hold: Hold | null = null,
    navigation = true
  ) {
    const previous = this.readPosition();
    const changed =
      previous.resultTime !== result ||
      previous.source?.kind !== (hold ? 'freeze' : result === null ? undefined : 'video') ||
      (previous.source?.sourceTime ?? previous.media?.time) !== source;
    const recovery = this.recovery;
    const graphStopped = this.reference?.drain !== undefined;
    this.reference = null;
    if (recovery) {
      this.intentRevision++;
      this.preparation?.abort();
      this.preparation = null;
      recovery.sourceTime = source;
      recovery.resume = false;
    } else this.cancelWork();
    if (!graphStopped) this.dependencies.audio.stop();
    this.desiredPlaying = false;
    this.mode = recovery ? 'recovering' : 'paused';
    this.failure = null;
    this.hold = hold;
    this.sourceFloor = null;
    this.sourceTime = source;
    this.previousSource = source;
    this.played = new Set(
      this.holds()
        .filter((part) =>
          hold ? part.resultStart <= hold.segment.resultStart : part.sourceStart <= source
        )
        .map((part) => part.freezeId!)
    );
    if (changed) this.epoch++;
    this.seekRevision++;
    if (navigation) this.navigationRevision++;
    this.dependencies.media.pause();
    if (!recovery || recovery.restored)
      this.dependencies.media.seek(hold ? hold.segment.frameTime! : source);
    if (!hold) this.applySource(source, false);
    if (navigation) this.dependencies.onSeek?.(source);
    this.publishStatus();
    this.publishPosition();
  }

  private applySource(time: number, applyEdits: boolean) {
    const sample = resolveReviewPlaybackSample({
      time,
      applyEdits,
      duration: this.configuration.duration,
      edits: this.configuration.edits,
      retainCutTime: !!this.configuration.retainCutTime,
      range: this.range?.result ? null : this.range,
    });
    this.sourceTime = this.clampSource(sample.time);
    if (sample.time !== time && !sample.looped) this.dependencies.media.seek(sample.time);
    const gain = originalAudioGainAt(
      this.configuration.original,
      sample.time,
      this.configuration.edits
    );
    this.dependencies.media.configure({
      rate: sample.rate,
      muted: !!this.configuration.silent || sample.muted || gain === 0,
      volume: Math.min(1, gain),
    });
    return sample;
  }

  private enterHold(segment: ReviewTimeSegment, elapsed: number, playing: boolean) {
    this.stageHold(segment, elapsed);
    this.desiredPlaying = playing;
    this.mode = playing ? 'playing' : 'paused';
    this.publishStatus();
    this.publishPosition();
  }

  /** A same-intent hold or drain can interrupt its own pending native Play. */
  private pauseNativeInput() {
    if (
      this.nativePlay?.revision === this.intentRevision &&
      this.nativePlay.sourceId === this.configuration.sourceId
    )
      this.nativePlay.interruptedByPause = true;
    this.dependencies.media.pause();
  }

  private stageHold(segment: ReviewTimeSegment, elapsed = 0) {
    this.hold = { segment, elapsed, started: null };
    this.played.add(segment.freezeId!);
    this.sourceTime = segment.sourceStart;
    this.pauseNativeInput();
    this.dependencies.media.seek(segment.frameTime!);
  }

  private async startPlayback() {
    this.cancelWork();
    this.reference = null;
    this.desiredPlaying = true;
    const revision = this.intentRevision;
    const sourceId = this.configuration.sourceId;
    const controller = new AbortController();
    this.preparation = controller;
    this.mode = 'preparing';
    let failureKind: 'audio' | 'play' = 'audio';
    try {
      if (!this.hold) {
        const observation = this.observe();
        if (observation) {
          const sample = this.applySource(observation.time, true);
          if (sample.looped) {
            this.restartRange();
            return;
          }
          const pending = this.pendingHold(sample.time);
          this.previousSource = sample.time;
          if (pending) this.stageHold(pending);
          else if (sample.time >= this.configuration.duration) {
            this.ended();
            return;
          }
        }
      }
      this.publishStatus();
      const preparation =
        this.configuration.silent ||
        this.dependencies.audio.prepare(controller.signal, {
          position: this.readPosition(),
          seekRevision: this.seekRevision,
        });
      const ready = typeof preparation === 'boolean' ? preparation : await preparation;
      if (!this.current(revision, sourceId)) return;
      if (!ready) {
        this.preparation = null;
        this.desiredPlaying = false;
        this.mode = 'paused';
        this.publishStatus();
        return;
      }
      failureKind = 'play';
      if (!this.hold) await this.resumeNative();
      if (!this.current(revision, sourceId)) return;
      // Native play readiness can advance media, cross a cut or reach a hold.
      if (!this.hold) {
        const observation = this.observe();
        if (observation) {
          const sample = this.applySource(observation.time, true);
          if (sample.looped) {
            this.restartRange();
            return;
          }
          const pending = this.pendingHold(sample.time);
          this.previousSource = sample.time;
          if (pending) this.stageHold(pending);
          else if (sample.time >= this.configuration.duration) {
            this.ended();
            return;
          }
        }
      }
      this.preparation = null;
      if (this.hold) this.hold.started = null;
      const start = this.readPosition();
      failureKind = 'audio';
      if (!this.configuration.silent)
        this.dependencies.audio.start({ position: start, seekRevision: this.seekRevision });
      const audioClock = this.readAudioClock();
      if (audioClock !== null && start.resultTime !== null)
        this.reference = {
          kind: 'audio',
          resultTime: start.resultTime,
          clock: audioClock.graphTime,
          monotonic: this.dependencies.now() / 1000,
          identity: audioClock.identity,
          projection: this.newProjection(start.resultTime, audioClock),
        };
      this.mode = 'playing';
      this.failure = null;
      this.publishStatus();
      this.dependencies.onRecovered?.();
    } catch {
      if (this.current(revision, sourceId)) this.fail({ kind: failureKind });
    }
  }

  private resumeNative(): Promise<void> {
    const revision = this.intentRevision;
    const sourceId = this.configuration.sourceId;
    if (this.nativePlay?.revision === revision && this.nativePlay.sourceId === sourceId)
      return this.nativePlay.promise;
    const request: NativePlayRequest = {
      revision,
      sourceId,
      promise: Promise.resolve(),
      interruptedByPause: false,
    };
    this.nativePlay = request;
    request.promise = this.completeNativePlay(request);
    return request.promise;
  }

  private async completeNativePlay(request: NativePlayRequest) {
    const { revision, sourceId } = request;
    try {
      await this.dependencies.media.play();
      if (!this.current(revision, sourceId)) {
        if (!this.desiredPlaying && this.observe()?.sourceId === sourceId)
          this.dependencies.media.pause();
        return;
      }
      // Resuming video after a hold must catch the already running audio once.
      // Keep the reference and audio graph; ordinary ticks retain their drift policy.
      if (this.reference?.drain) {
        this.dependencies.media.pause();
        return;
      }
      const observation = this.observe();
      if (this.reference && observation) {
        this.tickReference(observation, this.dependencies.now(), this.readAudioClock());
        if (!this.current(revision, sourceId) || !this.reference) return;
        const source = this.positionAtResult(
          this.referenceTime(this.dependencies.now(), this.readAudioClock()),
          observation
        ).source;
        if (
          source?.kind === 'video' &&
          Math.abs(observation.time - source.mediaTime) > NATIVE_RECEIPT_SECONDS
        )
          this.dependencies.media.seek(source.mediaTime);
      }
    } catch (error) {
      const ownedInterruption =
        request.interruptedByPause && error instanceof DOMException && error.name === 'AbortError';
      if (this.current(revision, sourceId) && !ownedInterruption) this.fail({ kind: 'play' });
    } finally {
      if (this.nativePlay === request) this.nativePlay = null;
    }
  }

  private restartRange() {
    const range = this.range;
    if (!range) return;
    if (range.result) {
      const time = range.result.start;
      const part = this.segments.find(
        (segment) =>
          segment.kind !== 'cut' && time >= segment.resultStart && time < segment.resultEnd
      );
      const source = part
        ? part.sourceStart + (time - part.resultStart) * part.rate
        : this.configuration.duration;
      this.commitSeek(
        source,
        time,
        part?.kind === 'freeze'
          ? { segment: part, elapsed: time - part.resultStart, started: null }
          : null,
        false
      );
    } else {
      const source = reviewPlaybackRangeStart(range, this.configuration.edits) ?? range.start;
      this.commitSeek(source, sourceToReviewResult(source, this.segments), null, false);
    }
    this.range = range;
    this.played = new Set(this.hold ? [this.hold.segment.freezeId!] : []);
    void this.play();
  }

  private ended() {
    if (!this.configuration.retainCutTime && this.range) {
      this.restartRange();
      return;
    }
    const hold = this.holds().find(
      (part) => part.sourceStart === this.configuration.duration && !this.played.has(part.freezeId!)
    );
    if (hold) {
      this.enterHold(hold, 0, true);
      return;
    }
    this.pause();
    this.mode = 'ended';
    this.publishStatus();
  }

  private mediaError(code: number | null) {
    if (code === 3 && !this.automaticRecoveryUsed && !this.recovery) {
      this.automaticRecoveryUsed = true;
      this.startRecovery(this.desiredPlaying);
    } else this.fail({ kind: 'media', code });
  }

  private startRecovery(resume: boolean) {
    const position = this.readPosition();
    const source = position.source?.sourceTime ?? position.media?.time ?? this.sourceTime;
    this.pause();
    this.mode = 'recovering';
    this.dependencies.media.recoveryMode(true);
    const transaction: Recovery = {
      sourceTime: source,
      resume,
      restored: false,
      cancelReload() {},
      cancelDeadline() {},
    };
    this.recovery = transaction;
    const current = () => !this.disposed && this.recovery === transaction;
    transaction.cancelReload = this.dependencies.schedule(500, () => {
      if (!current()) return;
      try {
        this.dependencies.media.reload();
      } catch {
        this.fail({ kind: 'media', code: 3 });
      }
    });
    transaction.cancelDeadline = this.dependencies.schedule(10000, () => {
      if (current()) this.fail({ kind: 'media', code: 3 });
    });
    this.publishStatus();
  }

  private cancelRecovery() {
    if (!this.recovery) return;
    this.recovery.cancelReload();
    this.recovery.cancelDeadline();
    this.recovery = null;
    this.dependencies.media.recoveryMode(false);
  }

  private cancelWork() {
    this.intentRevision++;
    this.preparation?.abort();
    this.preparation = null;
    this.nativePlay = null;
    this.cancelRecovery();
  }

  private current(revision: number, sourceId: string) {
    return (
      !this.disposed &&
      revision === this.intentRevision &&
      sourceId === this.configuration.sourceId &&
      this.desiredPlaying
    );
  }

  private snapshotStatus(position = this.readPosition()): ReviewTransportStatus {
    return {
      mode: this.mode,
      playing: this.mode === 'playing',
      range: this.range,
      seekRevision: this.seekRevision,
      navigationRevision: this.navigationRevision,
      position,
      failure: this.failure,
    };
  }

  private publishStatus(capturePosition = true, position?: ReviewTransportPosition) {
    if (this.disposed) return;
    const next = this.snapshotStatus(
      position ?? (capturePosition ? this.readPosition() : this.status.position)
    );
    if (sameStatus(this.status, next)) return;
    this.status = next;
    for (const listener of this.statusListeners) listener();
  }

  private publishPosition(position = this.readPosition()) {
    if (this.disposed) return;
    if (position.epoch !== this.epoch || position.mapRevision !== this.mapRevision) return;
    for (const listener of this.positionListeners) listener(position);
  }
}

function sameSegments(left: readonly ReviewTimeSegment[], right: readonly ReviewTimeSegment[]) {
  return (
    left.length === right.length &&
    left.every((part, index) => {
      const other = right[index]!;
      return (
        part.kind === other.kind &&
        part.sourceStart === other.sourceStart &&
        part.sourceEnd === other.sourceEnd &&
        part.resultStart === other.resultStart &&
        part.resultEnd === other.resultEnd &&
        part.rate === other.rate &&
        part.freezeId === other.freezeId &&
        part.frameTime === other.frameTime &&
        part.frameDuration === other.frameDuration
      );
    })
  );
}

function sameStatus(left: ReviewTransportStatus, right: ReviewTransportStatus) {
  return (
    left.mode === right.mode &&
    left.range === right.range &&
    left.seekRevision === right.seekRevision &&
    left.navigationRevision === right.navigationRevision &&
    left.failure === right.failure &&
    left.position.epoch === right.position.epoch &&
    left.position.mapRevision === right.position.mapRevision &&
    left.position.resultTime === right.position.resultTime &&
    left.position.source?.kind === right.position.source?.kind &&
    left.position.source?.sourceTime === right.position.source?.sourceTime
  );
}
