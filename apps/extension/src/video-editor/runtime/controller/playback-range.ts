import { useEffect, useRef } from 'react';
import type { VideoProject } from '../../../features/video/project/types/index';
import {
  clampPlaybackRange,
  type VideoEditorPlaybackRange,
} from '../../interaction/playback/range';

interface UsePlaybackRangeSanityParams {
  project: VideoProject | null;
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
  playbackRange,
  clearPlaybackRange,
  setPlaybackRange,
}: UsePlaybackRangeSanityParams) {
  const previousProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
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

    const clampedRange = clampPlaybackRange(playbackRange, project.duration);
    if (clampedRange === null) {
      clearPlaybackRange();
      return;
    }

    if (!isSamePlaybackRange(clampedRange, playbackRange)) {
      setPlaybackRange(clampedRange);
    }
  }, [clearPlaybackRange, playbackRange, project, setPlaybackRange]);
}
