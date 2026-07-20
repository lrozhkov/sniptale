import { useEffect, useRef } from 'react';

interface UseVideoEditorOverlayPlaybackArgs {
  blockingOverlayOpen: boolean;
  enabled: boolean;
  isPlaying: boolean;
  setPlaybackPlaying: (playing: boolean) => void;
}

export function useVideoEditorOverlayPlayback({
  blockingOverlayOpen,
  enabled,
  isPlaying,
  setPlaybackPlaying,
}: UseVideoEditorOverlayPlaybackArgs): void {
  const resumePlaybackRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      resumePlaybackRef.current = false;
      return;
    }

    if (!blockingOverlayOpen) {
      if (!resumePlaybackRef.current) {
        return;
      }

      resumePlaybackRef.current = false;
      setPlaybackPlaying(true);
      return;
    }

    if (!isPlaying) {
      return;
    }

    resumePlaybackRef.current = true;
    setPlaybackPlaying(false);
  }, [blockingOverlayOpen, enabled, isPlaying, setPlaybackPlaying]);
}
