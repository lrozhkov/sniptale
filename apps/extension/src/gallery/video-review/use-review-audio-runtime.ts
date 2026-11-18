import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { ReviewEdit } from '../../features/video/review/types';
import type {
  ReviewTransportAudioRequest,
  ReviewTransportPosition,
  ReviewTransportTimeMapSnapshot,
} from './transport';
import {
  REVIEW_PLAYBACK_UI_INTERVAL_MS,
  type ReviewPlaybackPresentationClock,
} from './playback-presentation-clock';
import { hasReviewAudioProcessing } from '../../workflows/video-review/audio-clip-processing';
import type { RecordingProjectActionAudioSource } from '../../workflows/video-review/recording-action-audio';
import {
  BrowserReviewAudioBuffer,
  createReviewAudioEngine,
  type ReviewAudioClipBuffer,
  type ReviewAudioEngine,
  type ReviewAudioPreparedClip,
} from '../../workflows/video-review/audio-playback-engine';
import { decodeReviewAudioClipBuffer } from '../../workflows/video-review/audio-clip-source';
import {
  createReviewActionAudioSource,
  admitReviewActionAudioPlan,
  type ReviewActionAudioSource,
} from '../../workflows/video-review/action-audio-source';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  ReviewActionAudioUnavailable,
  type ReviewActionAudioPlan,
} from '../../features/video/review/action-audio';
import type { ActionSoundSampleId } from '../../features/video/review/action-audio-catalog';
import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  buildQuickEditAudioPlan,
  buildQuickEditOriginalAudioPlan,
  quickEditAudioSourceKey,
  hasQuickEditActionAudio,
  iterateQuickEditActionAudioPlan,
  type QuickEditActionAudioSchedule,
  planQuickEditClipPlayback,
  type QuickEditAudioPlanEntry,
} from '../../features/video/review/advanced/audio-plan';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';

/** Seek-scale discontinuity before external clips are stopped and rescheduled. */
const SEEK_RESCHEDULE_SECONDS = 0.15;

/** One Web Audio owner per element; the context outlives switched resources. */
const elementEngines = new WeakMap<HTMLMediaElement, ReviewAudioEngine>();

interface OriginalAudioSource {
  file: Blob;
  segments: readonly ReviewTimeSegment[];
  edits: readonly ReviewEdit[];
}
interface ReviewAudioTransportControl {
  readPosition(): ReviewTransportPosition;
  readSchedulingPosition?(): ReviewTransportPosition;
  readTimeMap?(): ReviewTransportTimeMapSnapshot;
  alignNativeOriginal?(): boolean;
}
interface ReviewAudioRuntimeProps {
  /** Gallery commands own playback; React updates only supply the accepted audio plan. */
  transportControl?: ReviewAudioTransportControl;
  originalSource?: OriginalAudioSource;
  mappedOriginal?: boolean;
  video: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  silent?: boolean;
  outputTime: number;
  playbackClock?: ReviewPlaybackPresentationClock | undefined;
  /** Reads the media clock in result time when React commits a delayed transport sample. */
  sourceToResult?: ((sourceTime: number) => number | null) | undefined;
  seekRevision?: number | undefined;
  original: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  actionPlan?: ReviewActionAudioPlan;
  recordingActionSource?: RecordingProjectActionAudioSource | null;
  resolveAsset(assetId: string): Promise<Blob | null>;
  sessionKey: string;
  onFailure(reason?: ReviewActionAudioUnavailable['reason']): void;
  onActionAudioRecovered?(): void;
  createActionSource?: (signal: AbortSignal) => ReviewActionAudioSource<AudioBuffer>;
  createEngine?: (element: HTMLMediaElement | null) => ReviewAudioEngine | null;
}

/** Original samples enter the graph from native media, ahead of the output-facing preview. */
function originalSourceTime(current: ReviewAudioRuntimeProps) {
  return current.transportControl
    ? (current.video.current?.currentTime ?? 0)
    : (current.playbackClock?.read() ?? current.video.current?.currentTime ?? 0);
}

function reviewAudioPlanKey(props: ReviewAudioRuntimeProps): string {
  return JSON.stringify([
    props.voiceover,
    props.music,
    props.actionPlan,
    props.original,
    props.originalSource?.segments,
    props.originalSource?.edits,
  ]);
}

function useElementAudioEngine(latest: { current: ReviewAudioRuntimeProps }) {
  const engineRef = useRef<ReviewAudioEngine | null>(null);
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const effectLifetime = useRef({ revision: 0, releasing: false });
  const dispose = useCallback(() => {
    const engine = engineRef.current;
    const element = elementRef.current;
    engineRef.current = null;
    elementRef.current = null;
    if (!engine) return;
    if (element && elementEngines.get(element) === engine) elementEngines.delete(element);
    engine.dispose();
  }, []);
  const peek = useCallback((): ReviewAudioEngine | null => {
    if (effectLifetime.current.releasing) return null;
    const element = latest.current.video.current;
    if (engineRef.current && elementRef.current === element) return engineRef.current;
    if (engineRef.current) dispose();
    return (element && elementEngines.get(element)) ?? null;
  }, [dispose, latest]);
  const get = useCallback((): ReviewAudioEngine | null => {
    const shared = peek();
    if (shared) {
      engineRef.current = shared;
      elementRef.current = latest.current.video.current;
      return shared;
    }
    const element = latest.current.video.current;
    if (!element) return null;
    const created = (latest.current.createEngine ?? createReviewAudioEngine)(element);
    if (!created) return null;
    elementEngines.set(element, created);
    engineRef.current = created;
    elementRef.current = element;
    return created;
  }, [latest, peek]);
  useEffect(() => {
    const ownership = effectLifetime.current;
    const lifetime = ++ownership.revision;
    ownership.releasing = false;
    return () => {
      const engine = engineRef.current;
      ownership.releasing = true;
      // React can replay effects while retaining the media element. Its source node
      // cannot be recreated; release the graph only after that replay boundary.
      queueMicrotask(() => {
        if (ownership.revision === lifetime && engineRef.current === engine) dispose();
      });
    };
  }, [dispose]);
  return { peek, get };
}

type ReviewEditorAudioRuntimeProps = Omit<
  ReviewAudioRuntimeProps,
  'original' | 'resolveAsset' | 'createActionSource' | 'createEngine' | 'onActionAudioRecovered'
> & {
  originalAudio: QuickEditOriginalAudio;
  onActionAudioRecovered?: (() => void) | undefined;
};

/**
 * One preview playback owner: the source element keeps cuts and speed rules while
 * external voiceover and music clips are scheduled on the audio clock from the
 * effective configuration. Stale decodes and switched resources never connect.
 */
export function useReviewEditorAudioRuntime(args: ReviewEditorAudioRuntimeProps) {
  return useReviewAudioRuntime({
    ...(args.transportControl ? { transportControl: args.transportControl } : {}),
    video: args.video,
    playing: args.playing,
    silent: args.silent ?? false,
    outputTime: args.outputTime,
    playbackClock: args.playbackClock,
    sourceToResult: args.sourceToResult,
    seekRevision: args.seekRevision,
    original: args.originalAudio,
    ...(args.originalSource ? { originalSource: args.originalSource } : {}),
    ...(args.mappedOriginal ? { mappedOriginal: true } : {}),
    voiceover: args.voiceover,
    music: args.music,
    ...(args.actionPlan ? { actionPlan: args.actionPlan } : {}),
    ...(args.recordingActionSource ? { recordingActionSource: args.recordingActionSource } : {}),
    resolveAsset: resolveReviewAssetBytes,
    sessionKey: args.sessionKey,
    onFailure: args.onFailure,
    ...(args.onActionAudioRecovered ? { onActionAudioRecovered: args.onActionAudioRecovered } : {}),
  });
}
/** One session authority for decoded assets, processed variants, clock and cancellable playback jobs. */
class ReviewAudioPlaybackSession {
  private buffers = new Map<string, Promise<ReviewAudioClipBuffer | null>>();
  private prepared = new Map<string, ReviewAudioClipBuffer>();
  private processed = new Map<
    string,
    {
      entry: QuickEditAudioPlanEntry;
      pending: Promise<ReviewAudioPreparedClip>;
      scheduled: boolean;
    }
  >();
  private processedTimer: ReturnType<typeof setTimeout> | null = null;
  private stagedProcessingKey = '';
  private requestedPlayback = false;
  private requestedProcessingKey = '';
  private stagedProcessingTime = 0;
  private stagedSourceFile: Blob | undefined;
  private mappedOriginalFile: Blob | undefined;
  private mappedOriginalReady = false;
  private unavailableMappedOriginals = new WeakSet<Blob>();
  private actionBuffers = new Map<ActionSoundSampleId, ReviewAudioClipBuffer>();
  private planKey = '';
  private generation = 0;
  private handles: {
    lane: QuickEditAudioPlanEntry['lane'];
    end: number;
    handle: ReturnType<ReviewAudioEngine['scheduleClip']>;
  }[] = [];
  private preparation: AbortController | null = null;
  private releaseTransportAbort: (() => void) | null = null;
  private anchor: { outputTime: number; audioNow: number } | null = null;
  private rollingTimer: ReturnType<typeof setTimeout> | null = null;
  private actionSource: ReviewActionAudioSource<AudioBuffer> | null = null;
  private admission: {
    identity: object;
    result: Awaited<ReturnType<typeof admitReviewActionAudioPlan>>;
  } | null = null;
  private windowRead: Promise<ReviewActionAudioPlan> | null = null;
  private pendingAdmission: Promise<
    Awaited<ReturnType<RecordingProjectActionAudioSource['admit']>>
  > | null = null;
  private auditionActive = false;
  constructor(
    private latest: { current: ReviewAudioRuntimeProps },
    private engines: { get(): ReviewAudioEngine | null; peek(): ReviewAudioEngine | null }
  ) {}

  stop(stopEngine = true, preserveMusic = false) {
    this.releaseTransportAbort?.();
    this.releaseTransportAbort = null;
    if (preserveMusic)
      for (const owned of this.handles) if (owned.lane !== 'music') owned.handle.stop();
    this.handles = preserveMusic ? this.handles.filter((owned) => owned.lane === 'music') : [];
    this.generation += 1;
    this.requestedPlayback = false;
    this.requestedProcessingKey = '';
    this.auditionActive = false;
    this.preparation?.abort();
    this.stagedProcessingKey = '';
    this.mappedOriginalFile = undefined;
    this.mappedOriginalReady = false;
    if (this.processedTimer !== null) clearTimeout(this.processedTimer);
    this.processedTimer = null;
    for (const value of this.processed.values())
      void value.pending.then(
        (clip) => clip.dispose(),
        () => {}
      );
    this.processed.clear();
    this.clearActionResources();
    this.anchor = null;
    if (stopEngine) this.engines.peek()?.stopAll();
  }
  pausePlayback() {
    if (!this.auditionActive) this.stop();
  }
  cancelAudition() {
    if (this.auditionActive) this.stop();
  }
  private accepts(request: ReviewTransportAudioRequest | undefined): boolean {
    const control = this.latest.current.transportControl;
    if (!control) return true;
    if (!request || request.position.resultTime === null) return false;
    const position = control.readPosition();
    const map = control.readTimeMap?.();
    return (
      position.epoch === request.position.epoch &&
      position.mapRevision === request.position.mapRevision &&
      (!map || map.mapRevision === request.position.mapRevision)
    );
  }
  private commandSnapshot(request?: ReviewTransportAudioRequest): ReviewAudioRuntimeProps {
    const current = this.latest.current;
    const map = request ? current.transportControl?.readTimeMap?.() : undefined;
    return {
      ...current,
      ...(request ? { seekRevision: request.seekRevision } : {}),
      ...(map && current.originalSource
        ? {
            originalSource: {
              file: current.originalSource.file,
              segments: map.segments,
              edits: map.edits,
            },
          }
        : {}),
      outputTime:
        request?.position.resultTime ?? this.readOutputTime(current) ?? current.outputTime,
    };
  }
  async preparePlayback(
    planKey: string,
    request?: ReviewTransportAudioRequest,
    signal?: AbortSignal
  ): Promise<boolean> {
    this.stop();
    if (!this.accepts(request) || signal?.aborted) return false;
    const current = this.commandSnapshot(request);
    if (current.transportControl) planKey = reviewAudioPlanKey(current);
    const plan = current.actionPlan;
    const plainEntries = buildQuickEditAudioPlan(current).filter(
      (entry) =>
        !hasReviewAudioProcessing(entry.audioProcessing) &&
        entry.timelineStart + entry.duration > current.outputTime
    );
    let processedEntries: readonly QuickEditAudioPlanEntry[];
    const probeGeneration = this.generation;
    try {
      // Renderer readiness is sampled for this command, independently of authored audio.
      if (!(await this.admitMappedOriginal(current, request, signal))) return false;
      processedEntries = this.processingEntries(current);
    } catch {
      if (!signal?.aborted && this.generation === probeGeneration && this.accepts(request))
        current.onFailure();
      return false;
    }
    if (
      current.silent ||
      (!plan?.descriptors.length &&
        !current.recordingActionSource &&
        !processedEntries.length &&
        !plainEntries.length)
    )
      return true;
    const controller = new AbortController();
    this.preparation = controller;
    if (signal) {
      const abort = () => {
        if (this.preparation === controller) this.stop();
      };
      signal.addEventListener('abort', abort, { once: true });
      this.releaseTransportAbort = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) abort();
    }
    const generation = this.generation;
    const samePlan = () =>
      current.transportControl
        ? this.latest.current.transportControl !== undefined &&
          reviewAudioPlanKey(this.commandSnapshot(request)) === planKey
        : this.latest.current.actionPlan === plan &&
          this.latest.current.voiceover === current.voiceover &&
          this.latest.current.music === current.music &&
          JSON.stringify(this.latest.current.original) === JSON.stringify(current.original) &&
          this.latest.current.originalSource?.segments === current.originalSource?.segments;
    const valid = () =>
      !controller.signal.aborted &&
      this.accepts(request) &&
      generation === this.generation &&
      this.latest.current.sessionKey === current.sessionKey &&
      samePlan() &&
      this.latest.current.recordingActionSource === current.recordingActionSource &&
      (this.latest.current.transportControl !== undefined ||
        this.latest.current.seekRevision === current.seekRevision) &&
      this.latest.current.silent === current.silent &&
      this.latest.current.originalSource?.file === current.originalSource?.file;
    try {
      await this.loadActions(current, controller.signal, valid);
      if (!valid()) return false;
      if (this.planKey !== planKey) {
        this.prepared.clear();
        this.planKey = planKey;
      }
      if (plainEntries.length) {
        const engine = this.engines.get();
        if (!engine) throw new Error('Audio preview is unavailable.');
        await engine.resume();
        for (const entry of plainEntries) {
          if (!valid()) return false;
          await this.preparePlainClip(entry, engine, controller.signal);
        }
        if (!valid()) return false;
      }
      if (processedEntries.length) {
        const engine = this.engines.get();
        if (!engine) throw new Error('Processed audio preview is unavailable.');
        this.configureOriginal(engine, current);
        await engine.resume();
        await this.primePlaybackProcessing(
          processedEntries,
          current,
          engine,
          controller.signal,
          valid
        );
        if (!valid()) return false;
        if (this.mapsOriginal(current)) {
          this.mappedOriginalReady = true;
          this.configureOriginal(engine, current);
        }
        this.stagedProcessingKey = this.processingKey(current);
        this.stagedProcessingTime = current.outputTime;
        this.stagedSourceFile = current.originalSource?.file;
      }
      return valid();
    } catch (error) {
      if (valid()) {
        this.stop();
        current.onFailure(error instanceof ReviewActionAudioUnavailable ? error.reason : undefined);
      }
      return false;
    } finally {
      if (!valid() && this.preparation === controller) this.stop();
    }
  }
  audition(plan: ReviewActionAudioPlan, at?: number, duration = 2) {
    this.stop();
    const current = this.latest.current;
    current.video.current?.pause();
    const engine = this.engines.get();
    if (!engine) {
      current.onFailure();
      return;
    }
    const action = { plan, offset: 0, busGain: 1 };
    const first = iterateQuickEditActionAudioPlan(action, { start: 0, end: plan.duration }).next();
    const outputTime = at ?? (first.done ? undefined : first.value[0]?.timelineStart) ?? 0;
    const until = Math.min(plan.duration, outputTime + Math.min(2, duration));
    if (!hasQuickEditActionAudio(action, { start: outputTime, end: until })) return;
    this.auditionActive = true;
    const controller = new AbortController();
    this.preparation = controller;
    this.anchor = { outputTime, audioNow: engine.now() };
    engine.setOriginalGain(0);
    const job: PlaybackJob = {
      current: { ...current, actionPlan: plan, recordingActionSource: null, outputTime },
      generation: this.generation,
      signal: controller.signal,
      engine,
      audition: true,
      until,
    };
    void engine
      .resume()
      .then(() => this.startActions(job))
      .catch((error: unknown) => this.fail(job, error));
  }
  dispose() {
    this.stop();
    this.buffers.clear();
    this.prepared.clear();
    this.actionBuffers.clear();
    this.admission = null;
  }
  private clearActionResources() {
    if (this.rollingTimer !== null) clearTimeout(this.rollingTimer);
    this.rollingTimer = null;
    this.actionSource?.dispose();
    this.actionSource = null;
  }
  private readOutputTime(current: ReviewAudioRuntimeProps) {
    if (current.transportControl)
      return (
        current.transportControl.readSchedulingPosition?.() ??
        current.transportControl.readPosition()
      ).resultTime;
    const clock = current.playbackClock;
    if (clock?.readResult) return clock.readResult();
    const media = current.video.current;
    const source = clock?.read() ?? media?.currentTime;
    return current.sourceToResult && source !== undefined
      ? current.sourceToResult(source)
      : (clock?.read() ?? current.outputTime);
  }
  needsSeek() {
    const outputTime = this.readOutputTime(this.latest.current);
    if (!this.latest.current.playing || !this.anchor || outputTime === null) return false;
    const engine = this.engines.get();
    return (
      !!engine &&
      Math.abs(outputTime - this.anchor.outputTime - engine.now() + this.anchor.audioNow) >
        SEEK_RESCHEDULE_SECONDS
    );
  }
  private async resolveBuffer(entry: QuickEditAudioPlanEntry) {
    const key = quickEditAudioSourceKey(entry.source);
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const pending = (async () => {
      try {
        if (entry.source.kind !== 'project')
          throw new Error('Bundled source requires action audio admission.');
        const asset = await this.latest.current.resolveAsset(entry.source.assetId);
        if (!asset) return null;
        return (await this.engines.get()?.decode(await asset.arrayBuffer())) ?? null;
      } catch {
        return null;
      }
    })();
    this.buffers.set(key, pending);
    void pending.then((buffer) => {
      if (!buffer && this.buffers.get(key) === pending) this.buffers.delete(key);
    });
    return pending;
  }
  confirmPlayback(planKey: string) {
    const requested = this.requestedPlayback;
    this.requestedPlayback = false;
    return (
      requested &&
      this.anchor !== null &&
      this.planKey === planKey &&
      this.requestedProcessingKey === this.processingKey(this.latest.current)
    );
  }
  schedule(
    planKey: string,
    requested = false,
    preserveMusic = false,
    request?: ReviewTransportAudioRequest
  ) {
    if (!this.accepts(request)) return;
    // Background music keeps its audio clock during drift correction, until a transport command.
    preserveMusic = preserveMusic && this.planKey === planKey && this.anchor !== null;
    this.auditionActive = false;
    const current = {
      ...this.commandSnapshot(request),
      ...(requested ? { playing: true } : {}),
    };
    if (current.transportControl) planKey = reviewAudioPlanKey(current);
    const staged =
      this.stagedProcessingKey === this.processingKey(current) &&
      this.preparation !== null &&
      !this.preparation.signal.aborted &&
      Math.abs(current.outputTime - this.stagedProcessingTime) < SEEK_RESCHEDULE_SECONDS &&
      this.stagedSourceFile === current.originalSource?.file;
    this.stagedProcessingKey = '';
    if (!staged) this.stop(false, preserveMusic);
    const generation = ++this.generation;
    this.clearActionResources();
    const controller = staged ? this.preparation! : new AbortController();
    this.preparation = controller;
    const engine = this.engines.get();
    if (!engine) {
      if (current.playing) {
        current.onFailure();
      }
      return;
    }
    if (this.planKey !== planKey) {
      this.prepared.clear();
      this.planKey = planKey;
    }
    this.requestedPlayback = requested;
    this.requestedProcessingKey = this.processingKey(current);
    this.anchor = { outputTime: current.outputTime, audioNow: engine.now() };
    if (!staged && !preserveMusic) engine.stopAll();
    try {
      this.configureOriginal(engine, current);
    } catch {
      this.stop();
      current.onFailure();
      return;
    }
    engine.setOriginalGain(
      current.silent
        ? 0
        : Math.max(1, originalAudioGainAt(current.original, originalSourceTime(current)))
    );
    void this.run({
      current,
      generation,
      signal: controller.signal,
      engine,
      preserveMusic,
      ...(request ? { request } : {}),
    });
  }
  private active(job: PlaybackJob) {
    return (
      !job.signal.aborted &&
      (job.audition || this.accepts(job.request)) &&
      job.generation === this.generation &&
      !!job.audition === this.auditionActive &&
      (job.audition || this.latest.current.playing || this.requestedPlayback) &&
      this.latest.current.sessionKey === job.current.sessionKey &&
      (job.audition ||
        this.latest.current.recordingActionSource === job.current.recordingActionSource)
    );
  }
  private async run(job: PlaybackJob) {
    try {
      // Ready music must replace stopped nodes in this turn, before unrelated IO or React work.
      const plain = this.startPlain(job);
      // Observe a cold decode failure even if resuming the audio context also fails.
      void plain.catch((error: unknown) => this.fail(job, error));
      await job.engine.resume();
      if (!this.active(job)) return;
      await Promise.all([plain, this.startProcessed(job), this.startActions(job)]);
    } catch (error) {
      this.fail(job, error);
    }
  }
  private async startPlain(job: PlaybackJob) {
    if (!this.active(job)) return;
    const plan = buildQuickEditAudioPlan({
      voiceover: job.current.voiceover,
      music: job.current.music,
    });
    for (const entry of plan) {
      if (
        (job.preserveMusic && entry.lane === 'music') ||
        entry.timelineStart + entry.duration <= job.current.outputTime ||
        hasReviewAudioProcessing(entry.audioProcessing)
      )
        continue;
      const prepared =
        this.prepared.get(this.plainKey(entry)) ??
        (await this.preparePlainClip(entry, job.engine, job.signal));
      if (!this.active(job)) return;
      if (!prepared) continue;
      const rate = entry.playbackRate ?? 1;
      if (!this.active(job) || !this.anchor) return;
      const now = job.engine.now();
      const schedule = planQuickEditClipPlayback({
        entry,
        outputTime: this.anchor.outputTime + now - this.anchor.audioNow,
        audioNow: now,
      });
      if (schedule)
        this.scheduleClip(
          job,
          entry.lane,
          rate === 1
            ? schedule
            : {
                ...schedule,
                offset: (schedule.offset - entry.sourceOffset) / rate,
                duration: schedule.duration / rate,
                playbackRate: 1,
              },
          prepared
        );
    }
  }
  private scheduleClip(
    job: PlaybackJob,
    lane: QuickEditAudioPlanEntry['lane'],
    schedule: Parameters<ReviewAudioEngine['scheduleClip']>[0],
    buffer: ReviewAudioClipBuffer
  ) {
    this.handles = this.handles.filter((owned) => owned.end > job.engine.now());
    const handle = job.engine.scheduleClip(schedule, buffer);
    this.handles.push({ lane, end: schedule.when + schedule.duration, handle });
  }
  private plainKey(entry: QuickEditAudioPlanEntry) {
    return JSON.stringify([
      quickEditAudioSourceKey(entry.source),
      entry.sourceOffset,
      entry.duration,
      entry.playbackRate ?? 1,
    ]);
  }
  private async preparePlainClip(
    entry: QuickEditAudioPlanEntry,
    engine: ReviewAudioEngine,
    signal: AbortSignal
  ) {
    const key = this.plainKey(entry);
    const cached = this.prepared.get(key);
    if (cached) return cached;
    const buffer = await this.resolveBuffer(entry);
    signal.throwIfAborted();
    if (!buffer) return null;
    const prepared =
      (entry.playbackRate ?? 1) === 1 ? buffer : await engine.prepareClip(buffer, entry, signal);
    signal.throwIfAborted();
    this.prepared.set(key, prepared);
    return prepared;
  }
  private async admitMappedOriginal(
    current: ReviewAudioRuntimeProps,
    request: ReviewTransportAudioRequest | undefined,
    signal: AbortSignal | undefined
  ) {
    const source = current.originalSource;
    if (
      !current.mappedOriginal ||
      !request ||
      !signal ||
      current.silent ||
      current.original.muted ||
      current.original.volume <= 0 ||
      !source?.segments.some((segment) => segment.kind === 'cut') ||
      this.unavailableMappedOriginals.has(source.file) ||
      hasReviewAudioProcessing(current.original.audioProcessing)
    )
      return true;
    const generation = this.generation;
    const supported = await this.engines.get()?.supportsMappedOriginal?.(source.file, signal);
    if (
      signal.aborted ||
      generation !== this.generation ||
      !this.accepts(request) ||
      this.latest.current.originalSource?.file !== source.file
    )
      return false;
    if (supported) this.mappedOriginalFile = source.file;
    return true;
  }
  private async primePlaybackProcessing(
    entries: readonly QuickEditAudioPlanEntry[],
    current: ReviewAudioRuntimeProps,
    engine: ReviewAudioEngine,
    signal: AbortSignal,
    valid: () => boolean
  ) {
    const mapped = this.mapsOriginal(current);
    for (const entry of entries) {
      if (!valid()) return;
      if (entry.timelineStart > current.outputTime + 2) continue;
      const dryOriginal = mapped && entry.lane === 'original';
      if (dryOriginal && !this.mapsOriginal(current)) continue;
      try {
        await this.prepareProcessed(entry, current, engine, signal, current.outputTime);
      } catch (error) {
        if (!dryOriginal || !valid()) throw error;
        this.discardMappedOriginal();
      }
    }
  }

  private recoverNativeOriginal(current: ReviewAudioRuntimeProps, engine: ReviewAudioEngine) {
    const source = current.originalSource?.file;
    if (!source) return false;
    if (this.unavailableMappedOriginals.has(source)) return true;
    if (!this.latest.current.transportControl?.alignNativeOriginal?.()) return false;
    this.unavailableMappedOriginals.add(source);
    this.discardMappedOriginal();
    this.configureOriginal(engine, this.latest.current);
    return true;
  }

  private discardMappedOriginal() {
    this.mappedOriginalFile = undefined;
    this.mappedOriginalReady = false;
    for (const [id, owned] of this.processed) {
      if (owned.entry.lane !== 'original') continue;
      this.processed.delete(id);
      void owned.pending.then(
        (clip) => clip.dispose(),
        () => {}
      );
    }
  }

  private mapsOriginal(current: ReviewAudioRuntimeProps) {
    return (
      this.mappedOriginalFile !== undefined &&
      this.mappedOriginalFile === current.originalSource?.file
    );
  }
  usesOriginalProcessing(current: ReviewAudioRuntimeProps) {
    return (
      (this.mappedOriginalReady && this.mapsOriginal(current)) ||
      hasReviewAudioProcessing(current.original.audioProcessing)
    );
  }
  private configureOriginal(engine: ReviewAudioEngine, current: ReviewAudioRuntimeProps) {
    const active = this.usesOriginalProcessing(current);
    if (active && !engine.setOriginalProcessing)
      throw new Error('Original audio processing is unavailable.');
    engine.setOriginalProcessing?.(active);
  }
  private processingEntries(current: ReviewAudioRuntimeProps) {
    if (current.silent) return [];
    let original: QuickEditAudioPlanEntry[] = [];
    const mapped = this.mapsOriginal(current);
    if (mapped || this.usesOriginalProcessing(current)) {
      if (!current.originalSource)
        throw new Error('Processed original audio source is unavailable.');
      original = buildQuickEditOriginalAudioPlan({
        original: current.original,
        segments: current.originalSource.segments,
        edits: current.originalSource.edits,
        sourceId: current.sessionKey,
        includeDry: mapped,
      });
    }
    return [...original, ...buildQuickEditAudioPlan(current)].filter(
      (entry) =>
        entry.volume > 0 &&
        entry.timelineStart + entry.duration > current.outputTime &&
        ((entry.lane === 'original' && mapped) || hasReviewAudioProcessing(entry.audioProcessing))
    );
  }
  private processingKey(current: ReviewAudioRuntimeProps) {
    return JSON.stringify([
      current.sessionKey,
      current.seekRevision,
      current.silent,
      current.voiceover,
      current.music,
      current.original,
      current.originalSource?.segments,
      current.originalSource?.edits,
    ]);
  }
  private prepareProcessed(
    entry: QuickEditAudioPlanEntry,
    current: ReviewAudioRuntimeProps,
    engine: ReviewAudioEngine,
    signal: AbortSignal,
    outputTime: number
  ) {
    const cached = this.processed.get(entry.clipId);
    if (cached) return cached.pending;
    const dryOriginal = entry.lane === 'original' && this.mapsOriginal(current);
    const pending = (async () => {
      if (entry.source.kind !== 'project' || !engine.prepareProcessedClip)
        throw new Error('Processed audio preview is unavailable.');
      const blob =
        entry.lane === 'original'
          ? current.originalSource?.file
          : await current.resolveAsset(entry.source.assetId);
      signal.throwIfAborted();
      if (!blob) throw new Error('Processed audio material is unavailable.');
      const clip = await engine.prepareProcessedClip(
        blob,
        entry,
        Math.max(0, outputTime - entry.timelineStart),
        signal,
        () => {
          if (!signal.aborted && this.preparation?.signal === signal) {
            if (dryOriginal && this.recoverNativeOriginal(current, engine)) return;
            this.stop();
            current.onFailure();
          }
        }
      );
      if (signal.aborted) {
        clip.dispose();
        signal.throwIfAborted();
      }
      return clip;
    })();
    const owned = { entry, pending, scheduled: false };
    this.processed.set(entry.clipId, owned);
    void pending.catch(() => {
      if (this.processed.get(entry.clipId) === owned) this.processed.delete(entry.clipId);
    });
    return pending;
  }
  private async startProcessed(job: PlaybackJob) {
    const entries = this.processingEntries(job.current);
    if (!entries.length) return;
    const mapped = this.mapsOriginal(job.current);
    const remainsMapped = (entry: QuickEditAudioPlanEntry) =>
      !mapped || entry.lane !== 'original' || this.mapsOriginal(job.current);
    const pump = async () => {
      if (!this.active(job) || !this.anchor) return;
      const outputTime = this.anchor.outputTime + job.engine.now() - this.anchor.audioNow;
      for (const [id, owned] of this.processed) {
        if (owned.entry.timelineStart + owned.entry.duration <= outputTime) {
          this.processed.delete(id);
          void owned.pending.then(
            (clip) => clip.dispose(),
            () => {}
          );
        }
      }
      for (const entry of entries) {
        if (!this.active(job) || !this.anchor) return;
        if (
          !remainsMapped(entry) ||
          entry.timelineStart > outputTime + 2 ||
          entry.timelineStart + entry.duration <= outputTime ||
          this.processed.get(entry.clipId)?.scheduled
        )
          continue;
        try {
          const clip = await this.prepareProcessed(
            entry,
            job.current,
            job.engine,
            job.signal,
            outputTime
          );
          if (!this.active(job) || !this.anchor) return;
          if (!remainsMapped(entry)) continue;
          const now = job.engine.now();
          const schedule = planQuickEditClipPlayback({
            entry,
            audioNow: now,
            outputTime: this.anchor.outputTime + now - this.anchor.audioNow,
          });
          if (schedule) {
            clip.schedule(schedule);
            const owned = this.processed.get(entry.clipId);
            if (owned) owned.scheduled = true;
          }
        } catch (error) {
          if (!this.active(job)) return;
          if (
            !(
              mapped &&
              entry.lane === 'original' &&
              this.recoverNativeOriginal(job.current, job.engine)
            )
          )
            throw error;
        }
      }
      if (
        this.active(job) &&
        entries.some(
          (entry) => remainsMapped(entry) && entry.timelineStart + entry.duration > outputTime
        )
      )
        this.processedTimer = setTimeout(() => {
          void pump().catch((error: unknown) => this.fail(job, error));
        }, 250);
    };
    await pump();
  }
  private fail(job: PlaybackJob, error: unknown) {
    if (!this.active(job)) return;
    this.stop();
    job.current.onFailure(error instanceof ReviewActionAudioUnavailable ? error.reason : undefined);
  }
  private async loadActions(
    current: ReviewAudioRuntimeProps,
    signal: AbortSignal,
    valid: () => boolean
  ) {
    const plan = current.actionPlan;
    const source = current.recordingActionSource;
    const identity = source ?? plan;
    if (!identity || (!source && !plan?.descriptors.length) || !valid()) return null;
    let admission = this.admission?.identity === identity ? this.admission.result : null;
    if (!admission) {
      if (source) {
        if (this.pendingAdmission) await this.pendingAdmission.catch(() => undefined);
        if (!valid()) return null;
        const pending = source.admit(signal);
        this.pendingAdmission = pending;
        try {
          admission = await pending;
        } finally {
          if (this.pendingAdmission === pending) this.pendingAdmission = null;
        }
      } else admission = await admitReviewActionAudioPlan(plan!, signal);
      if (!valid()) return null;
      this.admission = { identity, result: admission };
    }
    const missing = admission.sampleIds.filter((sampleId) => !this.actionBuffers.has(sampleId));
    if (missing.length) {
      const source =
        current.createActionSource?.(signal) ??
        createReviewActionAudioSource({
          signal,
          getURL: runtimeInfo.getURL,
          fetch: (url, init) => fetch(url, init),
          decode: decodeReviewAudioClipBuffer,
        });
      this.actionSource = source;
      for (const sampleId of missing) {
        const native = await source.read(sampleId);
        if (!valid()) return null;
        this.actionBuffers.set(sampleId, new BrowserReviewAudioBuffer(native));
      }
    }
    return valid() ? admission : null;
  }
  private async startActions(job: PlaybackJob) {
    const plan = job.current.actionPlan;
    const source = job.current.recordingActionSource;
    if ((!source && !plan?.descriptors.length) || !this.active(job)) return;
    const admission = await this.loadActions(job.current, job.signal, () => this.active(job));
    if (!admission || !this.active(job)) return;
    job.current.onActionAudioRecovered?.();
    if (!admission.sampleIds.length) return;
    if (job.audition)
      this.anchor = { outputTime: job.current.outputTime, audioNow: job.engine.now() };
    const visited = new Map<string, number>();
    const pump = async () => {
      if (!this.active(job) || !this.anchor) return;
      const outputTime = this.anchor.outputTime + job.engine.now() - this.anchor.audioNow;
      const end = job.until ?? source?.duration ?? plan!.duration;
      if (outputTime >= end) {
        if (job.audition) this.stop();
        return;
      }
      let window = plan;
      if (source) {
        if (this.windowRead) await this.windowRead.catch(() => undefined);
        if (!this.active(job)) return;
        const pending = source.readWindow(
          { start: Math.max(0, outputTime), end: Math.min(end, outputTime + 2) },
          job.signal
        );
        this.windowRead = pending;
        try {
          window = await pending;
        } finally {
          if (this.windowRead === pending) this.windowRead = null;
        }
        if (!this.active(job)) return;
      }
      const action: QuickEditActionAudioSchedule = {
        plan: window!,
        offset: 0,
        busGain: admission.busGain,
        ...(job.until !== undefined
          ? { bounds: { start: job.current.outputTime, end: job.until } }
          : {}),
      };
      for (const [id, end] of visited) if (end <= outputTime) visited.delete(id);
      for (const batch of iterateQuickEditActionAudioPlan(action, {
        start: outputTime,
        end: Math.min(end, outputTime + 2),
      })) {
        for (const entry of batch) {
          if (!this.active(job) || !this.anchor) return;
          if (visited.has(entry.clipId)) continue;
          if (entry.source.kind !== 'bundled') throw new Error('Invalid action audio source.');
          const buffer = this.actionBuffers.get(entry.source.sampleId);
          if (!buffer) throw new ReviewActionAudioUnavailable('resource-missing');
          const now = job.engine.now();
          const schedule = planQuickEditClipPlayback({
            entry,
            audioNow: now,
            outputTime: this.anchor.outputTime + now - this.anchor.audioNow,
          });
          visited.set(entry.clipId, entry.timelineStart + entry.duration);
          if (schedule) this.scheduleClip(job, 'action', schedule, buffer);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (this.active(job) && outputTime < end)
        this.rollingTimer = setTimeout(() => {
          void pump().catch((error: unknown) => this.fail(job, error));
        }, 250);
    };
    await pump();
  }
}

type PlaybackJob = {
  request?: ReviewTransportAudioRequest;
  current: ReviewAudioRuntimeProps;
  generation: number;
  signal: AbortSignal;
  engine: ReviewAudioEngine;
  audition?: boolean;
  until?: number;
  preserveMusic?: boolean;
};

export function useReviewAudioRuntime(props: ReviewAudioRuntimeProps) {
  const planKey = useMemo(
    () =>
      JSON.stringify([
        props.voiceover,
        props.music,
        props.actionPlan,
        props.original,
        props.originalSource?.segments,
        props.originalSource?.edits,
      ]),
    [
      props.voiceover,
      props.music,
      props.actionPlan,
      props.original,
      props.originalSource?.segments,
      props.originalSource?.edits,
    ]
  );
  const session = useRef<ReviewAudioPlaybackSession | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { peek, get } = useElementAudioEngine(latest);
  useEffect(() => {
    const current = new ReviewAudioPlaybackSession(latest, { peek, get });
    session.current = current;
    return () => {
      current.dispose();
      session.current = null;
    };
  }, [get, peek, props.sessionKey]);
  useEffect(() => {
    if (props.transportControl) return;
    if (props.playing) {
      if (!session.current?.confirmPlayback(planKey)) session.current?.schedule(planKey);
    } else session.current?.pausePlayback();
  }, [
    planKey,
    props.playing,
    props.sessionKey,
    props.seekRevision,
    props.recordingActionSource,
    props.originalSource?.file,
    props.silent,
    props.transportControl,
  ]);
  useEffect(() => {
    if (props.transportControl) return;
    session.current?.cancelAudition();
  }, [planKey, props.seekRevision, props.recordingActionSource, props.transportControl]);
  const sourceClockMapped = props.sourceToResult !== undefined || props.playbackClock !== undefined;
  const synchronizeClock = useCallback(() => {
    if (!latest.current.transportControl && session.current?.needsSeek())
      session.current.schedule(planKey, false, sourceClockMapped);
    peek()?.setOriginalProcessing?.(
      session.current?.usesOriginalProcessing(latest.current) ??
        hasReviewAudioProcessing(latest.current.original.audioProcessing)
    );
    peek()?.setOriginalGain(
      latest.current.silent
        ? 0
        : Math.max(
            1,
            originalAudioGainAt(latest.current.original, originalSourceTime(latest.current))
          )
    );
  }, [peek, planKey, sourceClockMapped]);
  useEffect(synchronizeClock, [
    synchronizeClock,
    props.original,
    props.outputTime,
    props.silent,
    props.playing,
  ]);
  useEffect(() => {
    const clock = props.playbackClock;
    if (!clock || !props.playing) return;
    let lastSample = performance.now();
    return clock.subscribe(() => {
      if (!latest.current.playing || !clock.isPlaying()) return;
      const now = performance.now();
      if (now - lastSample < REVIEW_PLAYBACK_UI_INTERVAL_MS) return;
      lastSample = now;
      synchronizeClock();
    });
  }, [props.playbackClock, props.playing, synchronizeClock]);
  const audition = useCallback(
    (plan: ReviewActionAudioPlan, at?: number, duration?: number) =>
      session.current?.audition(plan, at, duration),
    []
  );
  const stopAudition = useCallback(() => session.current?.cancelAudition(), []);
  const preparePlayback = useCallback(
    (request?: ReviewTransportAudioRequest, signal?: AbortSignal) => {
      const current = session.current;
      return current ? current.preparePlayback(planKey, request, signal) : Promise.resolve(false);
    },
    [planKey]
  );
  const startPlayback = useCallback(
    (request?: ReviewTransportAudioRequest) =>
      session.current?.schedule(planKey, true, false, request),
    [planKey]
  );
  const stopPlayback = useCallback(() => session.current?.stop(), []);
  const readAudioClock = useCallback(
    () => (latest.current.silent ? null : (peek()?.readActiveClock?.() ?? null)),
    [peek]
  );
  return { audition, stopAudition, preparePlayback, startPlayback, stopPlayback, readAudioClock };
}
