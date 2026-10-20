import { useEffect, useRef } from 'react';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoProject } from '../../../features/video/project/types/index';
import {
  clampPlaybackRange,
  type VideoEditorPlaybackRange,
} from '../../interaction/playback/range';

interface UsePlaybackRangeSanityParams {
  project: VideoProject | null;
  selection?: VideoEditorSelection | undefined;
  currentTime?: number | undefined;
  playbackRange: VideoEditorPlaybackRange | null;
  clearPlaybackRange: () => void;
  setPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
}

function isSamePlaybackRange(
  left: VideoEditorPlaybackRange | null,
  right: VideoEditorPlaybackRange | null
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.start === right.start && left.end === right.end;
}

export function usePlaybackRangeSanity({
  project,
  selection,
  currentTime,
  playbackRange,
  clearPlaybackRange,
  setPlaybackRange,
}: UsePlaybackRangeSanityParams) {
  const previousProjectIdRef = useRef<string | null>(null);
  const previousSelection = useRef<VideoEditorSelection | undefined>(undefined);

  useEffect(() => {
    const selectionChanged = previousSelection.current !== selection;
    previousSelection.current = selection;
    if (!project) {
      previousProjectIdRef.current = null;
      if (playbackRange) {
        clearPlaybackRange();
      }
      return;
    }

    const previousProjectId = previousProjectIdRef.current;
    previousProjectIdRef.current = project.id;
    if (previousProjectId !== null && previousProjectId !== project.id) {
      if (playbackRange) {
        clearPlaybackRange();
      }
      return;
    }

    if (!playbackRange) {
      return;
    }

    if (
      selectionChanged &&
      selection?.kind === 'comment' &&
      currentTime !== undefined &&
      (currentTime < playbackRange.start || currentTime > playbackRange.end)
    ) {
      clearPlaybackRange();
      return;
    }

    const clampedRange = clampPlaybackRange(playbackRange, project.duration);
    if (clampedRange === null) {
      clearPlaybackRange();
      return;
    }

    if (!isSamePlaybackRange(clampedRange, playbackRange)) {
      setPlaybackRange(clampedRange);
    }
  }, [clearPlaybackRange, playbackRange, project, setPlaybackRange, selection, currentTime]);
}
