import { useCallback, useEffect } from 'react';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { usePlaybackPreparation } from './prepare';
import { usePlaybackShortcuts } from './shortcuts';
import { createPlaybackHandlers, createPlaybackLatestState, usePlaybackStateRefs } from './state';
import { usePlaybackTicker } from './ticker';
import type {
  PlaybackHandlers,
  PlaybackLatestState,
  PlaybackPreviewRuntime,
} from '../../../interaction/playback/types';

interface PlaybackHookState {
  currentTime: number;
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  selection: VideoEditorSelection;
  placementMode: VideoEditorPlacementMode | null;
  selectedClipId: string | null;
  selectedActionEvent: PlaybackLatestState['selectedActionEvent'];
  selectedMotionRegion: PlaybackLatestState['selectedMotionRegion'];
}

export interface VideoEditorPlaybackController {
  pausePlayback: () => number;
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
  seekTo: (time: number) => void;
  setPlaybackPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
}

function createPlaybackController(
  pausePlayback: VideoEditorPlaybackController['pausePlayback'],
  registerPreviewRuntime: VideoEditorPlaybackController['registerPreviewRuntime'],
  seekTo: VideoEditorPlaybackController['seekTo'],
  setPlaybackPlaying: VideoEditorPlaybackController['setPlaybackPlaying'],
  togglePlayback: VideoEditorPlaybackController['togglePlayback']
): VideoEditorPlaybackController {
  return {
    pausePlayback,
    registerPreviewRuntime,
    seekTo,
    setPlaybackPlaying,
    togglePlayback,
  };
}

function usePreviewRuntimeRegistration(
  previewRuntimeRef: ReturnType<typeof usePlaybackRuntimeRefs>['previewRuntimeRef']
) {
  return useCallback(
    (runtime: PlaybackPreviewRuntime | null) => {
      previewRuntimeRef.current = runtime;
    },
    [previewRuntimeRef]
  );
}

function usePlaybackProjectReset(
  cancelPlaybackPreparation: () => void,
  project: VideoProject | null
): void {
  useEffect(() => {
    if (project) {
      return;
    }

    cancelPlaybackPreparation();
  }, [cancelPlaybackPreparation, project]);
}

function usePlaybackSeek(
  project: VideoProject | null,
  playback: PlaybackHookState,
  handlers: PlaybackHandlers
): VideoEditorPlaybackController {
  const { handlersRef, latestStateRef, playbackRef, previewRuntimeRef } = usePlaybackRuntimeRefs(
    project,
    playback,
    handlers
  );
  const registerPreviewRuntime = usePreviewRuntimeRegistration(previewRuntimeRef);
  const transport = usePlaybackPreparation({
    handlersRef,
    latestStateRef,
    playbackRef,
    previewRuntimeRef,
  });
  const {
    cancelPlaybackPreparation,
    pausePlayback,
    phase,
    seekTo,
    setPlaybackPlaying,
    togglePlayback,
  } = transport;
  usePlaybackProjectReset(cancelPlaybackPreparation, project);

  usePlaybackTicker(
    playbackRef,
    previewRuntimeRef,
    latestStateRef,
    handlersRef,
    project,
    playback.isPlaying &&
      (phase === 'live' || phase === 'cached-frame-playback' || phase === 'cached-video-playback')
  );
  usePlaybackShortcuts(latestStateRef, handlersRef, togglePlayback);
  return createPlaybackController(
    pausePlayback,
    registerPreviewRuntime,
    seekTo,
    setPlaybackPlaying,
    togglePlayback
  );
}

function createPlaybackRuntimeState(
  project: VideoProject | null,
  playback: PlaybackHookState
): PlaybackLatestState {
  return createPlaybackLatestState(
    playback.currentTime,
    playback.isPlaying,
    playback.playbackRange,
    project,
    playback.selection,
    playback.placementMode,
    playback.selectedClipId,
    playback.selectedActionEvent,
    playback.selectedMotionRegion
  );
}

function createPlaybackRuntimeHandlers(handlers: PlaybackHandlers) {
  return createPlaybackHandlers(handlers);
}

function usePlaybackRuntimeRefs(
  project: VideoProject | null,
  playback: PlaybackHookState,
  handlers: PlaybackHandlers
) {
  const playbackState = createPlaybackRuntimeState(project, playback);
  const playbackHandlers = createPlaybackRuntimeHandlers(handlers);
  const { handlersRef, latestStateRef, playbackRef, previewRuntimeRef } = usePlaybackStateRefs(
    playbackState,
    playbackHandlers
  );
  return { handlersRef, latestStateRef, playbackRef, previewRuntimeRef };
}

/**
 * Drives preview playback timing and editor-wide playback shortcuts.
 */
export function useVideoEditorPlayback(
  project: VideoProject | null,
  playback: PlaybackHookState,
  handlers: PlaybackHandlers
): VideoEditorPlaybackController {
  return usePlaybackSeek(project, playback, handlers);
}
