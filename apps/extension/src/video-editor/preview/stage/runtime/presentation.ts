import { useCallback, useRef, useState } from 'react';

interface PresentedPreviewTime {
  projectId: string;
  time: number;
  revision: number;
}

export function usePreviewStagePresentationTime(params: {
  currentTime: number;
  isPlaying: boolean;
  projectId: string;
  fps?: number;
}) {
  const [presented, setPresented] = useState<PresentedPreviewTime | null>(null);
  const revisionRef = useRef(0);
  const requestRef = useRef<((time: number) => void) | null>(null);
  const registerPlaybackRequest = useCallback((request: (time: number) => void) => {
    revisionRef.current += 1;
    requestRef.current = request;
    return () => {
      if (requestRef.current === request) requestRef.current = null;
    };
  }, []);
  const present = useCallback(
    (time: number) => {
      if (params.isPlaying && requestRef.current) {
        requestRef.current(time);
        return;
      }
      setPresented((previous) => {
        const fps = params.fps ?? 60;
        if (
          params.isPlaying &&
          previous?.projectId === params.projectId &&
          previous.revision === revisionRef.current &&
          Math.floor(previous.time * fps) === Math.floor(time * fps)
        )
          return previous;
        return { projectId: params.projectId, time, revision: revisionRef.current };
      });
    },
    [params.projectId, params.fps, params.isPlaying]
  );
  return {
    currentTime:
      params.isPlaying &&
      !requestRef.current &&
      presented?.projectId === params.projectId &&
      presented.revision === revisionRef.current
        ? presented.time
        : params.currentTime,
    present,
    registerPlaybackRequest,
  };
}
