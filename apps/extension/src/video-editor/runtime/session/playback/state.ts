import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type {
  PlaybackHandlers,
  PlaybackLatestState,
  PlaybackPreviewRuntime,
  PlaybackRefState,
} from '../../../interaction/playback/types';

export function createPlaybackLatestState(
  currentTime: number,
  isPlaying: boolean,
  playbackRange: VideoEditorPlaybackRange | null,
  project: VideoProject | null,
  selection: VideoEditorSelection,
  placementMode: VideoEditorPlacementMode | null,
  selectedClipId: string | null,
  selectedActionEvent: PlaybackLatestState['selectedActionEvent'],
  selectedMotionRegion: PlaybackLatestState['selectedMotionRegion']
): PlaybackLatestState {
  return {
    currentTime,
    isPlaying,
    placementMode,
    playbackRange,
    project,
    selection,
    selectedActionEvent,
    selectedClipId,
    selectedMotionRegion,
  };
}

export function createPlaybackHandlers(handlers: PlaybackHandlers): PlaybackHandlers {
  return handlers;
}

export function usePlaybackStateRefs(
  state: PlaybackLatestState,
  handlers: PlaybackHandlers
): {
  handlersRef: MutableRefObject<PlaybackHandlers>;
  latestStateRef: MutableRefObject<PlaybackLatestState>;
  playbackRef: MutableRefObject<PlaybackRefState | null>;
  previewRuntimeRef: MutableRefObject<PlaybackPreviewRuntime | null>;
} {
  const playbackRef = useRef<PlaybackRefState | null>(null);
  const previewRuntimeRef = useRef<PlaybackPreviewRuntime | null>(null);
  const latestStateRef = useRef<PlaybackLatestState>(state);
  const handlersRef = useRef<PlaybackHandlers>(handlers);

  latestStateRef.current = state;
  handlersRef.current = handlers;
  return {
    handlersRef,
    latestStateRef,
    playbackRef,
    previewRuntimeRef,
  };
}
