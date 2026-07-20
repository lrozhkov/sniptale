import type { MutableRefObject } from 'react';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type {
  PlaybackHandlers,
  PlaybackLatestState,
  PlaybackRefState,
} from '../../../interaction/playback/types';

function createPlaybackRefState(
  startedAt: number,
  time: number,
  sessionStart: number
): PlaybackRefState {
  return {
    startedAt,
    initialTime: time,
    sessionStart,
  };
}

export function beginPlaybackSession(
  playbackRef: MutableRefObject<PlaybackRefState | null>,
  time: number
): void {
  const now = performance.now();
  playbackRef.current = createPlaybackRefState(now, time, time);
}

export function resolvePlaybackStartTime(
  currentTime: number,
  playbackRange: VideoEditorPlaybackRange | null
): number {
  if (!playbackRange) {
    return currentTime;
  }

  return currentTime >= playbackRange.start && currentTime < playbackRange.end
    ? currentTime
    : playbackRange.start;
}

export function startPlaybackSession(
  playbackRef: MutableRefObject<PlaybackRefState | null>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  latestStateRef: MutableRefObject<PlaybackLatestState>
): void {
  const nextTime = resolvePlaybackStartTime(
    latestStateRef.current.currentTime,
    latestStateRef.current.playbackRange
  );

  beginPlaybackSession(playbackRef, nextTime);
  if (nextTime !== latestStateRef.current.currentTime) {
    handlersRef.current.setCurrentTime(nextTime);
  }
}

export function restartPlaybackRange(
  playbackRef: MutableRefObject<PlaybackRefState | null>,
  handlersRef: MutableRefObject<PlaybackHandlers>,
  playbackRange: VideoEditorPlaybackRange
): void {
  handlersRef.current.setCurrentTime(playbackRange.start);
  beginPlaybackSession(playbackRef, playbackRange.start);
}
