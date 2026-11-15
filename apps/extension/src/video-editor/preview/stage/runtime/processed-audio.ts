import type { VideoEditorPreviewPrepareRequest } from '../../../contracts/preview-runtime';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import {
  getMediaClipSourceTime,
  isClipActiveAtTime,
} from '../../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../../features/video/project/timeline/rate';
import { hasCameraMediaAt } from '../../../../features/video/project/camera/animation';
import {
  hasReviewAudioProcessing,
  createReviewAudioClipCanonicalSource,
} from '../../../../workflows/video-review/audio-clip-processing';
import { openReviewAudioClipSource } from '../../../../workflows/video-review/audio-clip-source';
import {
  createAudioProcessingWorklet,
  type AudioProcessingWorklet,
} from '../../../../features/video/audio/effects/worklet-node';
import { isAudioDrivenPreviewClip } from './audio-clips';
import {
  getPreviewAudioContext,
  setPreviewAudioNodeProcessing,
  type PreviewAudioGraphState,
} from './playback/audio-graph';

type Placement = VideoProjectAudioClip | VideoProjectVideoClip;
interface Input {
  project: VideoProject;
  assetUrls: Readonly<Record<string, string>>;
}
interface Job {
  clip: Placement;
  signature: string;
  controller: AbortController;
  promise: Promise<void>;
  handle?: AudioProcessingWorklet;
  context: AudioContext;
  sourceStart: number;
  sourceEnd: number;
  rate: number;
  durationFrames: number;
  fromFrame: number;
  when?: number;
  startedFrame?: number;
  ended: boolean;
  ready: boolean;
  rangeEnd?: number;
  detachRequest(): void;
}
interface Dependencies {
  fetch: typeof fetch;
  openSource: typeof openReviewAudioClipSource;
  createWorklet: typeof createAudioProcessingWorklet;
}

/** Borrows the existing Native context/gain graph and owns bounded processed placement jobs. */
export function createProjectProcessedAudioRuntime(
  graph: PreviewAudioGraphState,
  deps: Partial<Dependencies> = {}
) {
  const dependencies: Dependencies = {
    fetch: (url, init) => fetch(url, init),
    openSource: openReviewAudioClipSource,
    createWorklet: createAudioProcessingWorklet,
    ...deps,
  };
  const jobs = new Map<string, Job>();
  let closed = false,
    generation = 0,
    playing = false;
  let failure: Error | undefined;
  let warmingController = new AbortController();
  let warming: Promise<void> | undefined;
  let preparedProject: VideoProject | undefined;
  let nextWarmTime = Infinity;
  let playbackRange: VideoEditorPreviewPrepareRequest['playbackRange'] = null;
  let hasProcessing = false;
  const signature = (clip: Placement, url: string | undefined) =>
    JSON.stringify([
      url,
      clip.assetId,
      clip.audioProcessing,
      clip.sourceStart,
      clip.sourceDuration,
      clip.playbackRate,
      clip.startTime,
      clip.duration,
      clip.playbackWindow?.offset,
      clip.type === 'VIDEO' ? clip.cameraTiming : undefined,
    ]);
  function release(id: string) {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    job.detachRequest();
    job.controller.abort();
    job.handle?.dispose();
  }
  function reset() {
    generation++;
    failure = undefined;
    warmingController.abort();
    warmingController = new AbortController();
    warming = undefined;
    preparedProject = undefined;
    nextWarmTime = Infinity;
    for (const id of [...jobs.keys()]) release(id);
  }
  function placements(input: Input, time: number) {
    const active = new Map(
      input.project.clips
        .filter((clip) => isClipActiveAtTime(clip, time))
        .map((clip) => [clip.id, clip])
    );
    return [...active.values()].filter(
      (clip): clip is Placement =>
        isAudioDrivenPreviewClip(input.project, clip, active) &&
        !clip.muted &&
        input.project.tracks.some((track) => track.id === clip.trackId && track.visible) &&
        hasReviewAudioProcessing(clip.audioProcessing)
    );
  }
  function upcomingPlacements(input: Input, time: number, end: number) {
    const times = new Set([time]);
    for (const clip of input.project.clips)
      if (
        (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
        clip.startTime > time &&
        clip.startTime <= time + 2 &&
        clip.startTime < end &&
        hasReviewAudioProcessing(clip.audioProcessing)
      )
        times.add(clip.startTime);
    const result = new Map<string, Placement>();
    for (const at of times) for (const clip of placements(input, at)) result.set(clip.id, clip);
    return [...result.values()].filter((clip) => clip.startTime < end);
  }
  const localFrame = (job: Job, clip: Placement, time: number) =>
    Math.max(
      0,
      Math.round(((getMediaClipSourceTime(clip, time) - job.sourceStart) / job.rate) * 48000)
    );
  function adoptRequest(job: Job, signal: AbortSignal) {
    job.detachRequest();
    const abort = () => {
      if (jobs.get(job.clip.id) === job && job.when === undefined) release(job.clip.id);
    };
    job.detachRequest = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }
  async function acquire(job: Job, url: string, requestGeneration: number) {
    const signal = job.controller.signal;
    const check = () => {
      signal.throwIfAborted();
      if (closed || generation !== requestGeneration || jobs.get(job.clip.id) !== job)
        throw new Error('Processed audio preparation is stale.');
    };
    let releaseSource: (() => void) | undefined;
    try {
      await job.context.resume();
      check();
      const response = await dependencies.fetch(url, { signal });
      if (!response.ok) throw new Error('Processed audio source is unavailable.');
      const blob = await response.blob();
      check();
      const native = await dependencies.openSource(blob, signal);
      let released = false;
      releaseSource = () => {
        if (released) return;
        released = true;
        native.dispose();
      };
      check();
      const source = createReviewAudioClipCanonicalSource(
        {
          sourceOffset: job.sourceStart,
          duration: (job.sourceEnd - job.sourceStart) / job.rate,
          playbackRate: job.rate,
        },
        native,
        signal
      );
      const releaseNative = releaseSource;
      releaseSource = () => {
        if (released) return;
        try {
          source.dispose();
        } finally {
          releaseNative();
        }
      };
      const handle = await dependencies.createWorklet({
        context: job.context,
        source: {
          channels: source.channels,
          lengthFrames: source.lengthFrames,
          read: source.read,
          dispose: releaseSource,
        },
        processing: job.clip.audioProcessing!,
        rate: job.rate,
        durationFrames: job.durationFrames,
        generation: requestGeneration + 1,
        signal,
        onEnded() {
          if (jobs.get(job.clip.id) === job) job.ended = true;
        },
        onError(error) {
          if (jobs.get(job.clip.id) === job) {
            failure = error;
            release(job.clip.id);
          }
        },
      });
      job.handle = handle;
      check();
      await handle.prime(job.fromFrame);
      check();
      job.ready = true;
    } catch (error) {
      job.handle?.dispose();
      releaseSource?.();
      if (jobs.get(job.clip.id) === job) release(job.clip.id);
      throw error;
    }
  }
  const runtime = {
    async prepare(input: Input, request: VideoEditorPreviewPrepareRequest) {
      if (closed) throw new Error('Processed audio runtime is closed.');
      request.signal.throwIfAborted();
      preparedProject = input.project;
      playbackRange = request.playbackRange;
      nextWarmTime = request.time + 0.25;
      hasProcessing = input.project.clips.some(
        (clip) =>
          (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
          hasReviewAudioProcessing(clip.audioProcessing)
      );
      const clips = upcomingPlacements(input, request.time, playbackRange?.end ?? Infinity),
        ids = new Set(clips.map((clip) => clip.id));
      for (const id of [...jobs.keys()]) if (!ids.has(id)) release(id);
      const pending: Promise<void>[] = [];
      for (const clip of clips) {
        const url = input.assetUrls[clip.assetId];
        if (!url) {
          if (clip.startTime > request.time) continue;
          throw new Error('Processed audio source is unavailable.');
        }
        const time = Math.max(request.time, clip.startTime);
        const key = signature(clip, url);
        let job = jobs.get(clip.id);
        if (job) {
          const target = localFrame(job, clip, time);
          const expected =
            job.when === undefined
              ? job.fromFrame
              : job.startedFrame! + Math.round((job.context.currentTime - job.when) * 48000);
          const reusable =
            job.when === undefined
              ? target >= job.fromFrame && target < job.fromFrame + 19200
              : Math.abs(target - expected) < 7200;
          if (
            job.signature !== key ||
            job.rangeEnd !== request.playbackRange?.end ||
            !reusable ||
            job.ended
          ) {
            release(clip.id);
            job = undefined;
          }
        }
        if (!job) {
          const context = getPreviewAudioContext(graph);
          if (!context) throw new Error('Processed audio context is unavailable.');
          const offset = clip.type === 'VIDEO' ? (clip.cameraTiming?.offsetSeconds ?? 0) : 0;
          const sourceStart = Math.max(0, clip.sourceStart - offset);
          const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
          const end = Math.max(sourceStart, clip.sourceStart - offset + clip.sourceDuration);
          const durationFrames = Math.round(((end - sourceStart) / rate) * 48000);
          if (durationFrames <= 0) continue;
          const next: Job = {
            clip,
            signature: key,
            context,
            sourceStart,
            sourceEnd: end,
            rate,
            durationFrames,
            fromFrame: 0,
            controller: new AbortController(),
            promise: Promise.resolve(),
            ended: false,
            ready: false,
            ...(request.playbackRange ? { rangeEnd: request.playbackRange.end } : {}),
            detachRequest() {},
          };
          next.fromFrame = Math.min(durationFrames, localFrame(next, clip, time));
          if (next.fromFrame >= durationFrames) continue;
          job = next;
          jobs.set(clip.id, job);
          job.promise = acquire(job, url, generation);
        }
        if (job.when === undefined) adoptRequest(job, request.signal);
        pending.push(job.promise);
      }
      await Promise.all(pending);
      request.signal.throwIfAborted();
    },
    sync(input: Input & { currentTime: number; isPlaying: boolean }) {
      if (closed) return;
      if (playing && !input.isPlaying) reset();
      playing = input.isPlaying;
      let changed = preparedProject !== input.project;
      for (const [id, job] of jobs) {
        const clip = input.project.clips.find((clip) => clip.id === id);
        if (
          !clip ||
          (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') ||
          signature(clip, input.assetUrls[clip.assetId]) !== job.signature
        ) {
          release(id);
          changed = true;
        }
      }
      if (!input.isPlaying) return;
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      if (changed)
        hasProcessing = input.project.clips.some(
          (clip) =>
            (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
            hasReviewAudioProcessing(clip.audioProcessing)
        );
      if (!hasProcessing && jobs.size === 0) return;
      if (!warming && (changed || input.currentTime >= nextWarmTime)) {
        const currentGeneration = generation,
          signal = warmingController.signal;
        const pending = runtime
          .prepare(input, {
            time: input.currentTime,
            generation: generation + 1,
            isPlaying: true,
            reason: 'play',
            playbackRange,
            signal,
          })
          .catch((error: unknown) => {
            if (!signal.aborted && currentGeneration === generation)
              failure =
                error instanceof Error ? error : new Error('Processed audio preparation failed.');
          });
        warming = pending;
        void pending.finally(() => {
          if (warming === pending) warming = undefined;
        });
      }
      const active = placements(input, input.currentTime),
        ids = new Set(active.map((clip) => clip.id));
      for (const [id, job] of jobs) if (job.when !== undefined && !ids.has(id)) release(id);
      for (const clip of active) {
        const job = jobs.get(clip.id),
          graphNode = graph.nodesByClipId.get(clip.id);
        if (
          !job?.ready ||
          !job.handle ||
          !graphNode ||
          job.ended ||
          !hasCameraMediaAt(input.project, clip, input.currentTime)
        )
          continue;
        setPreviewAudioNodeProcessing(graphNode, true, job.handle.output);
        if (job.when !== undefined) continue;
        const lead = 256 / 48000,
          start = localFrame(job, clip, input.currentTime + lead);
        if (start >= job.durationFrames) continue;
        const end = Math.min(
          job.durationFrames,
          localFrame(job, clip, Math.min(clip.startTime + clip.duration, job.rangeEnd ?? Infinity))
        );
        if (end <= start) continue;
        job.when = job.context.currentTime + lead;
        job.startedFrame = start;
        job.detachRequest();
        job.handle.start(job.when, end, start);
      }
    },
    reset,
    dispose() {
      if (closed) return;
      closed = true;
      reset();
    },
  };
  return runtime;
}
