import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import { restartPlaybackRange, startPlaybackSession } from './session';
import type {
  PlaybackHandlers,
  PlaybackLatestState,
  PlaybackPreviewRuntime,
  PlaybackRefState,
} from '../../../interaction/playback/types';
import {
  resolvePlaybackFrameTime,
  resolvePlaybackPublishIntervalMs,
  shouldPublishPlaybackTime,
} from './cadence';

function isPlaybackRangeRestart(
  nextTime: number,
  playbackRange: PlaybackLatestState['playbackRange']
): playbackRange is VideoEditorPlaybackRange {
  return playbackRange !== null && nextTime >= playbackRange.end;
}

interface PlaybackTickerParams {
  handlersRef: MutableRefObject<PlaybackHandlers>;
  latestStateRef: MutableRefObject<PlaybackLatestState>;
  playbackRef: MutableRefObject<PlaybackRefState | null>;
  previewRuntimeRef: MutableRefObject<PlaybackPreviewRuntime | null>;
}

interface PlaybackTickState {
  frameId: number;
  lastPresentedTime: number;
  lastPublishedAt: number;
}

function runPlaybackTick(
  params: PlaybackTickerParams,
  state: PlaybackTickState,
  now: number
): boolean {
  const playback = params.playbackRef.current;
  const latest = params.latestStateRef.current;
  if (!playback || !latest.project) return false;
  const nextTime = resolvePlaybackTickTime(params.playbackRef, now);
  if (isPlaybackRangeRestart(nextTime, latest.playbackRange)) {
    if (latest.playbackRange.loop === false) {
      params.previewRuntimeRef.current?.present(latest.playbackRange.end);
      params.handlersRef.current.setPlaying(false);
      params.handlersRef.current.setCurrentTime(latest.playbackRange.end);
      return false;
    }
    restartPlaybackRange(params.playbackRef, params.handlersRef, latest.playbackRange);
    params.previewRuntimeRef.current?.present(latest.playbackRange.start);
    state.lastPresentedTime = latest.playbackRange.start;
    return true;
  }
  if (nextTime >= latest.project.duration) {
    params.previewRuntimeRef.current?.settle(playback.sessionStart);
    params.handlersRef.current.setPlaying(false);
    params.handlersRef.current.setCurrentTime(playback.sessionStart);
    return false;
  }
  const frameTime = resolvePlaybackFrameTime(nextTime, latest.project.duration, latest.project.fps);
  if (frameTime !== state.lastPresentedTime) {
    params.previewRuntimeRef.current?.present(frameTime);
    state.lastPresentedTime = frameTime;
  }
  if (shouldPublishPlaybackTime(now, state.lastPublishedAt, latest.project.fps)) {
    params.handlersRef.current.setCurrentTime(frameTime);
    state.lastPublishedAt = now;
  }
  return true;
}

function startPlaybackTicker(params: PlaybackTickerParams): () => void {
  const state: PlaybackTickState = {
    frameId: 0,
    lastPresentedTime: Number.NaN,
    lastPublishedAt: Number.NEGATIVE_INFINITY,
  };
  let active = true;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastTickNow = Number.NEGATIVE_INFINITY;
  const stop = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(state.frameId);
    if (timerId !== undefined) clearTimeout(timerId);
  };
  const wake = (timestamp = performance.now()) => {
    if (!active) return false;
    const now = Math.max(performance.now(), timestamp, lastTickNow);
    lastTickNow = now;
    if (!runPlaybackTick(params, state, now)) stop();
    return active;
  };
  const tick = (timestamp: number) => {
    if (wake(timestamp)) state.frameId = requestAnimationFrame(tick);
  };
  const timerTick = () => {
    timerId = undefined;
    if (wake()) scheduleTimer();
  };
  const scheduleTimer = () => {
    if (active)
      timerId = setTimeout(
        timerTick,
        resolvePlaybackPublishIntervalMs(params.latestStateRef.current.project?.fps ?? 30)
      );
  };
  state.frameId = requestAnimationFrame(tick);
  scheduleTimer();
  return stop;
}

export function usePlaybackTicker(
  playbackRef: MutableRefObject<PlaybackRefState | null>,
  previewRuntimeRef: MutableRefObject<PlaybackPreviewRuntime | null>,
  latestStateRef: MutableRefObject<PlaybackLatestState>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  project: VideoProject | null,
  isPlaying: boolean
) {
  // Inspector edits replace the project object; only a different project restarts the clock.
  const projectId = project?.id;
  useEffect(() => {
    if (!projectId || !isPlaying) {
      playbackRef.current = null;
      return;
    }

    startPlaybackSession(playbackRef, handlersRef, latestStateRef);
    return startPlaybackTicker({ handlersRef, latestStateRef, playbackRef, previewRuntimeRef });
  }, [handlersRef, isPlaying, latestStateRef, playbackRef, previewRuntimeRef, projectId]);
}

export function resolvePlaybackTickTime(
  playbackRef: MutableRefObject<PlaybackRefState | null>,
  now: number
): number {
  const playback = playbackRef.current;
  if (!playback) {
    return 0;
  }

  // A frame timestamp can precede the performance.now() anchor created during that frame.
  return playback.initialTime + Math.max(0, now - playback.startedAt) / 1000;
}
