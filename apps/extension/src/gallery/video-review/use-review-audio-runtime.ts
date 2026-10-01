import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  buildQuickEditAudioPlan,
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
  let disposed = false;
  const stopAll = () => {
    for (const handle of handles) handle.stop();
    handles.clear();
  };
  return {
    now: () => context.currentTime,
    resume: () => context.resume(),
    decode: async (data) => new BrowserReviewAudioBuffer(await context.decodeAudioData(data)),
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
  original: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  resolveAsset(assetId: string): Promise<Blob | null>;
  sessionKey: string;
  onFailure(): void;
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
  originalAudio: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  sessionKey: string;
  onFailure(): void;
}) {
  useReviewAudioRuntime({
    video: args.video,
    playing: args.playing,
    silent: args.silent ?? false,
    outputTime: args.outputTime,
    original: args.originalAudio,
    voiceover: args.voiceover,
    music: args.music,
    resolveAsset: resolveReviewAssetBytes,
    sessionKey: args.sessionKey,
    onFailure: args.onFailure,
  });
}
/** One session authority for decoded assets, processed variants, clock and cancellable playback jobs. */
class ReviewAudioPlaybackSession {
  private buffers = new Map<string, Promise<ReviewAudioClipBuffer | null>>();
  private prepared = new Map<string, ReviewAudioClipBuffer>();
  private planKey = '';
  private generation = 0;
  private preparation: AbortController | null = null;
  private anchor: { outputTime: number; audioNow: number } | null = null;
  constructor(
    private latest: { current: ReviewAudioRuntimeProps },
    private engines: { get(): ReviewAudioEngine | null; peek(): ReviewAudioEngine | null }
  ) {}

  stop() {
    this.generation += 1;
    this.preparation?.abort();
    this.anchor = null;
    this.engines.peek()?.stopAll();
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
    const cached = this.buffers.get(entry.assetId);
    if (cached) return cached;
    const pending = (async () => {
      try {
        const asset = await this.latest.current.resolveAsset(entry.assetId);
        if (!asset) return null;
        return (await this.engines.get()?.decode(await asset.arrayBuffer())) ?? null;
      } catch {
        return null;
      }
    })();
    this.buffers.set(entry.assetId, pending);
    return pending;
  }
  schedule(planKey: string) {
    const current = this.latest.current;
    const generation = ++this.generation;
    this.preparation?.abort();
    const controller = new AbortController();
    this.preparation = controller;
    const engine = this.engines.get();
    if (!engine) {
      if (current.playing) current.onFailure();
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
  private active(job: {
    current: ReviewAudioRuntimeProps;
    generation: number;
    signal: AbortSignal;
  }) {
    return (
      !job.signal.aborted &&
      job.generation === this.generation &&
      this.latest.current.playing &&
      this.latest.current.sessionKey === job.current.sessionKey
    );
  }
  private async run(job: {
    current: ReviewAudioRuntimeProps;
    generation: number;
    signal: AbortSignal;
    engine: ReviewAudioEngine;
  }) {
    try {
      await job.engine.resume();
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
        const key = JSON.stringify([entry.assetId, entry.sourceOffset, entry.duration, rate]);
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
    } catch {
      if (this.active(job)) this.latest.current.onFailure();
    }
  }
}

export function useReviewAudioRuntime(props: ReviewAudioRuntimeProps) {
  const planKey = JSON.stringify([props.voiceover, props.music]);
  const session = useRef<ReviewAudioPlaybackSession | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { peek, get } = useElementAudioEngine(latest);
  useEffect(() => {
    const current = new ReviewAudioPlaybackSession(latest, { peek, get });
    session.current = current;
    return () => {
      current.stop();
      session.current = null;
    };
  }, [get, peek, props.sessionKey]);
  useEffect(() => {
    if (props.playing) session.current?.schedule(planKey);
    else session.current?.stop();
  }, [planKey, props.playing, props.sessionKey]);
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
}
