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
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  buildQuickEditAudioPlan,
  quickEditAudioSourceKey,
  hasQuickEditActionAudio,
  iterateQuickEditActionAudioPlan,
  type QuickEditActionAudioSchedule,
  planQuickEditClipPlayback,
  type QuickEditAudioPlanEntry,
  type QuickEditClipSchedule,
} from '../../features/video/review/advanced/audio-plan';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';

/** Structural surface of the preview audio graph the runtime consumes. */
export interface ReviewAudioClipBuffer {
  duration: number;
}
interface ReviewAudioHandle {
  stop(): void;
}
export interface ReviewAudioEngine {
  now(): number;
  resume(): Promise<void>;
  decode(data: ArrayBuffer): Promise<ReviewAudioClipBuffer>;
  /** Prepares the selected clip span at its applied tempo, preserving native pitch. */
  prepareClip(
    buffer: ReviewAudioClipBuffer,
    entry: QuickEditAudioPlanEntry,
    signal: AbortSignal
  ): Promise<ReviewAudioClipBuffer>;
  scheduleClip(schedule: QuickEditClipSchedule, buffer: ReviewAudioClipBuffer): ReviewAudioHandle;
  /** Graph-side amplification for original-audio volume beyond the element range. */
  setOriginalGain(volume: number): void;
  stopAll(): void;
  /** Permanently releases this element's graph and its AudioContext. */
  dispose(): void;
}

/** Seek-scale discontinuity before external clips are stopped and rescheduled. */
const SEEK_RESCHEDULE_SECONDS = 0.15;

/** One Web Audio owner per element; the context outlives switched resources. */
const elementEngines = new WeakMap<HTMLMediaElement, ReviewAudioEngine>();

class BrowserReviewAudioBuffer implements ReviewAudioClipBuffer {
  constructor(readonly value: AudioBuffer) {}
  get duration() {
    return this.value.duration;
  }
}

function browserBuffer(buffer: ReviewAudioClipBuffer): AudioBuffer {
  if (!(buffer instanceof BrowserReviewAudioBuffer))
    throw new Error('Review audio buffer does not belong to this browser graph');
  return buffer.value;
}

function connectClipSource(
  context: AudioContext,
  handles: Set<ReviewAudioHandle>,
  schedule: QuickEditClipSchedule,
  buffer: ReviewAudioClipBuffer
): ReviewAudioHandle {
  const source = context.createBufferSource();
  source.buffer = browserBuffer(buffer);
  const gain = context.createGain();
  source.playbackRate.value = 1;
  source.connect(gain);
  gain.connect(context.destination);
  schedule.envelope.forEach(([at, value], index) => {
    if (index === 0) gain.gain.setValueAtTime(value, Math.max(context.currentTime, at));
    else gain.gain.linearRampToValueAtTime(value, at);
  });
  source.start(schedule.when, schedule.offset, schedule.duration);
  const handle = {
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
      source.disconnect();
      gain.disconnect();
    },
  };
  source.onended = () => {
    handles.delete(handle);
    source.disconnect();
    gain.disconnect();
  };
  handles.add(handle);
  return handle;
}

export function createDefaultEngine(element: HTMLMediaElement | null): ReviewAudioEngine | null {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  let originalGain: GainNode | null = null;
  let originalSource: MediaElementAudioSourceNode | null = null;
  if (element) {
    const source = context.createMediaElementSource(element);
    originalSource = source;
    originalGain = context.createGain();
    source.connect(originalGain);
    originalGain.connect(context.destination);
  }
  const handles = new Set<ReviewAudioHandle>();
  const decoding = new AbortController();
  let disposed = false;
  const stopAll = () => {
    for (const handle of handles) handle.stop();
    handles.clear();
  };
  return {
    now: () => context.currentTime,
    resume: () => context.resume(),
    decode: async (data) =>
      new BrowserReviewAudioBuffer(await decodeReviewAudioClipBuffer(data, decoding.signal)),
    prepareClip: async (buffer, entry, signal) => {
      const rate = entry.playbackRate ?? 1;
      if (rate === 1) return buffer;
      const prepared = await renderTempoBuffer(
        browserBuffer(buffer),
        { start: entry.sourceOffset, duration: entry.duration * rate, rate },
        signal
      );
      signal.throwIfAborted();
      return new BrowserReviewAudioBuffer(prepared);
    },
    scheduleClip: (schedule, buffer) => connectClipSource(context, handles, schedule, buffer),
    setOriginalGain: (volume) => {
      if (originalGain) originalGain.gain.value = volume === 0 ? 0 : Math.max(1, volume);
    },
    stopAll,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      decoding.abort();
      stopAll();
      originalSource?.disconnect();
      originalGain?.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}

interface ReviewAudioRuntimeProps {
  video: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  silent?: boolean;
  outputTime: number;
  seekRevision?: number | undefined;
  original: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  actionPlan?: ReviewActionAudioPlan;
  resolveAsset(assetId: string): Promise<Blob | null>;
  sessionKey: string;
  onFailure(reason?: ReviewActionAudioUnavailable['reason']): void;
  onActionAudioRecovered?(): void;
  createActionSource?: (signal: AbortSignal) => ReviewActionAudioSource<AudioBuffer>;
  createEngine?: (element: HTMLMediaElement | null) => ReviewAudioEngine | null;
}

function useElementAudioEngine(latest: { current: ReviewAudioRuntimeProps }) {
  const engineRef = useRef<ReviewAudioEngine | null>(null);
  const elementRef = useRef<HTMLMediaElement | null>(null);
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
    const created = (latest.current.createEngine ?? createDefaultEngine)(element);
    if (!created) return null;
    elementEngines.set(element, created);
    engineRef.current = created;
    elementRef.current = element;
    return created;
  }, [latest, peek]);
  useEffect(() => () => dispose(), [dispose]);
  return { peek, get };
}

/**
 * One preview playback owner: the source element keeps cuts and speed rules while
 * external voiceover and music clips are scheduled on the audio clock from the
 * effective configuration. Stale decodes and switched resources never connect.
 */
export function useReviewEditorAudioRuntime(args: {
  video: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  silent?: boolean;
  outputTime: number;
  seekRevision?: number | undefined;
  originalAudio: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  actionPlan?: ReviewActionAudioPlan;
  sessionKey: string;
  onFailure(reason?: ReviewActionAudioUnavailable['reason']): void;
  onActionAudioRecovered?: (() => void) | undefined;
}) {
  return useReviewAudioRuntime({
    video: args.video,
    playing: args.playing,
    silent: args.silent ?? false,
    outputTime: args.outputTime,
    seekRevision: args.seekRevision,
    original: args.originalAudio,
    voiceover: args.voiceover,
    music: args.music,
    ...(args.actionPlan ? { actionPlan: args.actionPlan } : {}),
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
  private actionBuffers = new Map<ActionSoundSampleId, ReviewAudioClipBuffer>();
  private planKey = '';
  private generation = 0;
  private preparation: AbortController | null = null;
  private anchor: { outputTime: number; audioNow: number } | null = null;
  private rollingTimer: ReturnType<typeof setTimeout> | null = null;
  private actionSource: ReviewActionAudioSource<AudioBuffer> | null = null;
  private admission: {
    plan: ReviewActionAudioPlan;
    result: Awaited<ReturnType<typeof admitReviewActionAudioPlan>>;
  } | null = null;
  private auditionActive = false;
  constructor(
    private latest: { current: ReviewAudioRuntimeProps },
    private engines: { get(): ReviewAudioEngine | null; peek(): ReviewAudioEngine | null }
  ) {}

  stop() {
    this.generation += 1;
    this.auditionActive = false;
    this.preparation?.abort();
    this.clearActionResources();
    this.anchor = null;
    this.engines.peek()?.stopAll();
  }
  pausePlayback() {
    if (!this.auditionActive) this.stop();
  }
  cancelAudition() {
    if (this.auditionActive) this.stop();
  }
  async preparePlayback(): Promise<boolean> {
    this.stop();
    const current = this.latest.current;
    const plan = current.actionPlan;
    if (current.silent || !plan?.descriptors.length) return true;
    const controller = new AbortController();
    this.preparation = controller;
    const generation = this.generation;
    const valid = () =>
      !controller.signal.aborted &&
      generation === this.generation &&
      this.latest.current.sessionKey === current.sessionKey &&
      this.latest.current.actionPlan === plan &&
      this.latest.current.seekRevision === current.seekRevision &&
      this.latest.current.silent === current.silent;
    try {
      await this.loadActions(current, controller.signal, valid);
      return valid();
    } catch (error) {
      if (valid()) {
        this.stop();
        current.onFailure(error instanceof ReviewActionAudioUnavailable ? error.reason : undefined);
      }
      return false;
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
      current: { ...current, actionPlan: plan, outputTime },
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
  needsSeek(outputTime: number) {
    if (!this.latest.current.playing || !this.anchor) return false;
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
  schedule(planKey: string) {
    this.auditionActive = false;
    const current = this.latest.current;
    const generation = ++this.generation;
    this.preparation?.abort();
    this.clearActionResources();
    const controller = new AbortController();
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
    this.anchor = { outputTime: current.outputTime, audioNow: engine.now() };
    engine.stopAll();
    engine.setOriginalGain(
      current.silent
        ? 0
        : Math.max(
            1,
            originalAudioGainAt(current.original, current.video.current?.currentTime ?? 0)
          )
    );
    void this.run({ current, generation, signal: controller.signal, engine });
  }
  private active(job: PlaybackJob) {
    return (
      !job.signal.aborted &&
      job.generation === this.generation &&
      !!job.audition === this.auditionActive &&
      (job.audition || this.latest.current.playing) &&
      this.latest.current.sessionKey === job.current.sessionKey
    );
  }
  private async run(job: PlaybackJob) {
    try {
      await job.engine.resume();
      if (!this.active(job)) return;
      await this.startActions(job);
      if (!this.active(job)) return;
      const plan = buildQuickEditAudioPlan({
        voiceover: job.current.voiceover,
        music: job.current.music,
      });
      for (const entry of plan) {
        const buffer = await this.resolveBuffer(entry);
        if (!this.active(job)) return;
        if (!buffer) continue;
        const rate = entry.playbackRate ?? 1;
        const key = JSON.stringify([
          quickEditAudioSourceKey(entry.source),
          entry.sourceOffset,
          entry.duration,
          rate,
        ]);
        let prepared = rate === 1 ? buffer : this.prepared.get(key);
        if (!prepared) {
          prepared = await job.engine.prepareClip(buffer, entry, job.signal);
          if (!this.active(job)) return;
          this.prepared.set(key, prepared);
        }
        if (!this.active(job) || !this.anchor) return;
        const now = job.engine.now();
        const schedule = planQuickEditClipPlayback({
          entry,
          outputTime: this.anchor.outputTime + now - this.anchor.audioNow,
          audioNow: now,
        });
        if (schedule)
          job.engine.scheduleClip(
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
    } catch (error) {
      this.fail(job, error);
    }
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
    if (!plan?.descriptors.length || !valid()) return null;
    let admission = this.admission?.plan === plan ? this.admission.result : null;
    if (!admission) {
      admission = await admitReviewActionAudioPlan(plan, signal);
      if (!valid()) return null;
      this.admission = { plan, result: admission };
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
    if (!plan?.descriptors.length || !this.active(job)) return;
    const admission = await this.loadActions(job.current, job.signal, () => this.active(job));
    if (!admission || !this.active(job)) return;
    if (job.audition)
      this.anchor = { outputTime: job.current.outputTime, audioNow: job.engine.now() };
    job.current.onActionAudioRecovered?.();
    const action: QuickEditActionAudioSchedule = {
      plan,
      offset: 0,
      busGain: admission.busGain,
      ...(job.until !== undefined
        ? { bounds: { start: job.current.outputTime, end: job.until } }
        : {}),
    };
    const visited = new Map<string, number>();
    const pump = async () => {
      if (!this.active(job) || !this.anchor) return;
      const outputTime = this.anchor.outputTime + job.engine.now() - this.anchor.audioNow;
      const end = job.until ?? plan.duration;
      if (outputTime >= end) {
        if (job.audition) this.stop();
        return;
      }
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
          if (schedule) job.engine.scheduleClip(schedule, buffer);
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
  current: ReviewAudioRuntimeProps;
  generation: number;
  signal: AbortSignal;
  engine: ReviewAudioEngine;
  audition?: boolean;
  until?: number;
};

export function useReviewAudioRuntime(props: ReviewAudioRuntimeProps) {
  const planKey = useMemo(
    () => JSON.stringify([props.voiceover, props.music, props.actionPlan]),
    [props.voiceover, props.music, props.actionPlan]
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
    if (props.playing) session.current?.schedule(planKey);
    else session.current?.pausePlayback();
  }, [planKey, props.playing, props.sessionKey, props.seekRevision]);
  useEffect(() => {
    session.current?.cancelAudition();
  }, [planKey, props.seekRevision]);
  useEffect(() => {
    if (session.current?.needsSeek(props.outputTime)) session.current.schedule(planKey);
  }, [props.outputTime, planKey]);
  useEffect(() => {
    peek()?.setOriginalGain(
      latest.current.silent
        ? 0
        : Math.max(
            1,
            originalAudioGainAt(
              latest.current.original,
              latest.current.video.current?.currentTime ?? 0
            )
          )
    );
  }, [peek, props.original, props.outputTime, props.silent]);
  const audition = useCallback(
    (plan: ReviewActionAudioPlan, at?: number, duration?: number) =>
      session.current?.audition(plan, at, duration),
    []
  );
  const stopAudition = useCallback(() => session.current?.cancelAudition(), []);
  const preparePlayback = useCallback(() => {
    const current = session.current;
    return current ? current.preparePlayback() : Promise.resolve(false);
  }, []);
  return { audition, stopAudition, preparePlayback };
}
