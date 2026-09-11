import { useCallback, useState } from 'react';

interface PresentedPreviewTime {
  projectId: string;
  time: number;
}

export function usePreviewStagePresentationTime(params: {
  currentTime: number;
  isPlaying: boolean;
  projectId: string;
  fps?: number;
}) {
  const [presented, setPresented] = useState<PresentedPreviewTime | null>(null);
  const present = useCallback(
    (time: number) =>
      setPresented((previous) => {
        const fps = params.fps ?? 60;
        if (
          params.isPlaying &&
          previous?.projectId === params.projectId &&
          Math.floor(previous.time * fps) === Math.floor(time * fps)
        )
          return previous;
        return { projectId: params.projectId, time };
      }),
    [params.projectId, params.fps, params.isPlaying]
  );
  return {
    currentTime:
      params.isPlaying && presented?.projectId === params.projectId
        ? presented.time
        : params.currentTime,
    present,
  };
}
