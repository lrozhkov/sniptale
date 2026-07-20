import type { MutableRefObject } from 'react';

import type {
  VideoEditorPreviewPhase,
  VideoEditorPreviewPrepareOutcome,
} from '../../../contracts/preview-runtime';
import type {
  PlaybackHandlers,
  PlaybackLatestState,
  PlaybackPreviewRuntime,
  PlaybackRefState,
} from '../../../interaction/playback/types';
import { resolvePlaybackFrameTime } from './cadence';
import { beginPlaybackSession, resolvePlaybackStartTime } from './session';
import { resolvePlaybackTickTime } from './ticker';

export interface PlaybackRuntimeRefs {
  handlersRef: MutableRefObject<PlaybackHandlers>;
  latestStateRef: MutableRefObject<PlaybackLatestState>;
  playbackRef: MutableRefObject<PlaybackRefState | null>;
  previewRuntimeRef: MutableRefObject<PlaybackPreviewRuntime | null>;
}

export interface PlaybackRequestState {
  abortController: AbortController | null;
  generation: number;
}

type PhaseSetter = (phase: VideoEditorPreviewPhase) => void;

function resolvePlayingPhase(outcome: VideoEditorPreviewPrepareOutcome): VideoEditorPreviewPhase {
  if (outcome === 'frame-cache-ready') return 'cached-frame-playback';
  if (outcome === 'video-cache-ready') return 'cached-video-playback';
  return 'live';
}

function settleCurrentPlayback(refs: PlaybackRuntimeRefs): number {
  const latest = refs.latestStateRef.current;
  const playback = refs.playbackRef.current;
  const project = latest.project;
  const limit = Math.min(
    project?.duration ?? latest.currentTime,
    latest.playbackRange?.end ?? Infinity
  );
  const time =
    playback && project
      ? resolvePlaybackFrameTime(
          Math.min(limit, resolvePlaybackTickTime(refs.playbackRef, performance.now())),
          project.duration,
          project.fps
        )
      : latest.currentTime;
  refs.previewRuntimeRef.current?.settle(time);
  refs.handlersRef.current.setCurrentTime(time);
  return time;
}

export function cancelActivePlaybackRequest(
  refs: PlaybackRuntimeRefs,
  requestRef: MutableRefObject<PlaybackRequestState>,
  setPhase: PhaseSetter
): number {
  const settledTime = settleCurrentPlayback(refs);
  const generation = requestRef.current.generation;
  requestRef.current.abortController?.abort();
  refs.previewRuntimeRef.current?.cancel(generation);
  requestRef.current = { abortController: null, generation: generation + 1 };
  refs.playbackRef.current = null;
  setPhase('idle');
  return settledTime;
}

async function preparePlaybackRequest(params: {
  generation: number;
  isPlaying: boolean;
  reason: 'play' | 'seek';
  refs: PlaybackRuntimeRefs;
  signal: AbortSignal;
  time: number;
}): Promise<VideoEditorPreviewPrepareOutcome> {
  const runtime = params.refs.previewRuntimeRef.current;
  if (!runtime) return 'live-ready';
  return runtime.prepare({
    generation: params.generation,
    isPlaying: params.isPlaying,
    playbackRange: params.refs.latestStateRef.current.playbackRange,
    reason: params.reason,
    signal: params.signal,
    time: params.time,
  });
}

function beginRequest(requestRef: MutableRefObject<PlaybackRequestState>) {
  requestRef.current.abortController?.abort();
  const controller = new AbortController();
  const generation = requestRef.current.generation + 1;
  requestRef.current = { abortController: controller, generation };
  return { controller, generation };
}

function isCurrentRequest(
  requestRef: MutableRefObject<PlaybackRequestState>,
  generation: number
): boolean {
  return (
    requestRef.current.generation === generation &&
    !requestRef.current.abortController?.signal.aborted
  );
}

function failCurrentRequest(params: {
  generation: number;
  refs: PlaybackRuntimeRefs;
  requestRef: MutableRefObject<PlaybackRequestState>;
  setPhase: PhaseSetter;
}): void {
  if (!isCurrentRequest(params.requestRef, params.generation)) return;
  params.refs.handlersRef.current.setPlaying(false);
  params.refs.playbackRef.current = null;
  params.setPhase('idle');
}

function completeStart(params: {
  outcome: VideoEditorPreviewPrepareOutcome;
  refs: PlaybackRuntimeRefs;
  setPhase: PhaseSetter;
  time: number;
}): void {
  params.refs.handlersRef.current.setCurrentTime(params.time);
  params.refs.handlersRef.current.setPlaying(true);
  beginPlaybackSession(params.refs.playbackRef, params.time);
  params.setPhase(resolvePlayingPhase(params.outcome));
}

export function requestPlaybackStart(
  refs: PlaybackRuntimeRefs,
  requestRef: MutableRefObject<PlaybackRequestState>,
  setPhase: PhaseSetter
): void {
  if (!refs.latestStateRef.current.project) return;
  const time = resolvePlaybackStartTime(
    refs.latestStateRef.current.currentTime,
    refs.latestStateRef.current.playbackRange
  );
  const request = beginRequest(requestRef);
  refs.handlersRef.current.setCurrentTime(time);
  setPhase('starting');
  if (!refs.previewRuntimeRef.current) {
    completeStart({ outcome: 'live-ready', refs, setPhase, time });
    return;
  }
  void preparePlaybackRequest({
    generation: request.generation,
    isPlaying: true,
    reason: 'play',
    refs,
    signal: request.controller.signal,
    time,
  }).then(
    (outcome) => {
      if (!isCurrentRequest(requestRef, request.generation) || outcome === 'cancelled') return;
      completeStart({ outcome, refs, setPhase, time });
    },
    () => failCurrentRequest({ generation: request.generation, refs, requestRef, setPhase })
  );
}

function completeSeek(params: {
  keepPlaying: boolean;
  outcome: VideoEditorPreviewPrepareOutcome;
  refs: PlaybackRuntimeRefs;
  setPhase: PhaseSetter;
  time: number;
}): void {
  params.refs.handlersRef.current.setCurrentTime(params.time);
  if (!params.keepPlaying) {
    params.refs.playbackRef.current = null;
    params.setPhase('idle');
    return;
  }
  beginPlaybackSession(params.refs.playbackRef, params.time);
  params.setPhase(resolvePlayingPhase(params.outcome));
}

export function requestPlaybackSeek(
  refs: PlaybackRuntimeRefs,
  requestRef: MutableRefObject<PlaybackRequestState>,
  setPhase: PhaseSetter,
  time: number
): void {
  const keepPlaying = refs.latestStateRef.current.isPlaying;
  const request = beginRequest(requestRef);
  refs.handlersRef.current.setCurrentTime(time);
  setPhase('starting');
  if (!refs.previewRuntimeRef.current) {
    completeSeek({ keepPlaying, outcome: 'live-ready', refs, setPhase, time });
    return;
  }
  void preparePlaybackRequest({
    generation: request.generation,
    isPlaying: keepPlaying,
    reason: 'seek',
    refs,
    signal: request.controller.signal,
    time,
  }).then(
    (outcome) => {
      if (!isCurrentRequest(requestRef, request.generation) || outcome === 'cancelled') return;
      completeSeek({ keepPlaying, outcome, refs, setPhase, time });
    },
    () => failCurrentRequest({ generation: request.generation, refs, requestRef, setPhase })
  );
}
