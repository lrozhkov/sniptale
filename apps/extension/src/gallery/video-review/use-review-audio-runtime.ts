import { originalAudioGainAt } from '../../features/video/review/advanced/original-audio';
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

function connectClipSource(
  context: AudioContext,
  handles: Set<ReviewAudioHandle>,
  schedule: QuickEditClipSchedule,
  buffer: ReviewAudioClipBuffer
): ReviewAudioHandle {
  const source = context.createBufferSource();
  source.buffer = buffer as AudioBuffer;
  const gain = context.createGain();
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
    decode: (data) => context.decodeAudioData(data),
    scheduleClip: (schedule, buffer) => connectClipSource(context, handles, schedule, buffer),
    setOriginalGain: (volume) => {
      if (originalGain) originalGain.gain.value = volume > 1 ? volume : 1;
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

interface ReviewAudioRuntime {
  buffers: Map<string, Promise<ReviewAudioClipBuffer | null>>;
}

interface ReviewAudioRuntimeProps {
  video: RefObject<HTMLVideoElement | null>;
  playing: boolean;
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
    outputTime: args.outputTime,
    original: args.originalAudio,
    voiceover: args.voiceover,
    music: args.music,
    resolveAsset: resolveReviewAssetBytes,
    sessionKey: args.sessionKey,
    onFailure: args.onFailure,
  });
}
export function useReviewAudioRuntime(props: ReviewAudioRuntimeProps) {
  // Applied values, not transient React object identities, define a playback plan.
  const planKey = JSON.stringify([props.voiceover, props.music]);
  const runtime = useRef<ReviewAudioRuntime | null>(null);
  const generation = useRef(0);
  const scheduledAt = useRef<{ outputTime: number; audioNow: number } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { peek: peekEngine, get: getEngine } = useElementAudioEngine(latest);
  const resolveBuffer = useCallback(
    async (entry: QuickEditAudioPlanEntry): Promise<ReviewAudioClipBuffer | null> => {
      const current = runtime.current;
      if (!current) return null;
      const cached = current.buffers.get(entry.assetId);
      if (cached) return cached;
      const pending = (async () => {
        try {
          const asset = await latest.current.resolveAsset(entry.assetId);
          if (!asset) return null;
          return (await getEngine()?.decode(await asset.arrayBuffer())) ?? null;
        } catch {
          return null;
        }
      })();
      current.buffers.set(entry.assetId, pending);
      return pending;
    },
    [getEngine, latest]
  );
  const schedule = useCallback(() => {
    const current = latest.current;
    const engine = getEngine();
    if (!engine) {
      if (current.playing) current.onFailure();
      return;
    }
    const generationValue = ++generation.current;
    scheduledAt.current = { outputTime: current.outputTime, audioNow: engine.now() };
    engine.stopAll();
    engine.setOriginalGain(
      Math.max(1, originalAudioGainAt(current.original, current.video.current?.currentTime ?? 0))
    );
    void (async () => {
      try {
        await engine.resume();
      } catch {
        if (latest.current.playing) latest.current.onFailure();
        return;
      }
      const plan = buildQuickEditAudioPlan({
        voiceover: current.voiceover,
        music: current.music,
      });
      for (const entry of plan) {
        const buffer = await resolveBuffer(entry);
        if (
          generationValue !== generation.current ||
          !latest.current.playing ||
          latest.current.sessionKey !== current.sessionKey
        )
          return;
        if (!buffer) continue;
        const anchor = scheduledAt.current;
        if (!anchor) return;
        const now = engine.now();
        const clipSchedule = planQuickEditClipPlayback({
          entry,
          outputTime: anchor.outputTime + now - anchor.audioNow,
          audioNow: now,
        });
        if (clipSchedule) engine.scheduleClip(clipSchedule, buffer);
      }
    })();
  }, [getEngine, latest, resolveBuffer]);
  useEffect(() => {
    runtime.current = { buffers: new Map() };
    return () => {
      generation.current += 1;
      scheduledAt.current = null;
      peekEngine()?.stopAll();
      runtime.current = null;
    };
  }, [peekEngine, props.sessionKey]);
  useEffect(() => {
    if (props.playing) schedule();
    else {
      generation.current += 1;
      scheduledAt.current = null;
      peekEngine()?.stopAll();
    }
    // The plan identity changes with every applied edit; reschedule then.
  }, [peekEngine, planKey, props.playing, props.sessionKey, schedule]);
  useEffect(() => {
    const scheduled = scheduledAt.current;
    if (!latest.current.playing || scheduled === null) return;
    // Continuous playback projects output time from the audio clock; only a
    // seek-scale discontinuity needs the full stop-and-reschedule.
    const expected = scheduled.outputTime + (getEngine()!.now() - scheduled.audioNow);
    if (Math.abs(props.outputTime - expected) <= SEEK_RESCHEDULE_SECONDS) return;
    schedule();
  }, [getEngine, props.outputTime, schedule]);
  useEffect(() => {
    peekEngine()?.setOriginalGain(
      Math.max(
        1,
        originalAudioGainAt(latest.current.original, latest.current.video.current?.currentTime ?? 0)
      )
    );
  }, [peekEngine, props.original, props.outputTime]);
}
