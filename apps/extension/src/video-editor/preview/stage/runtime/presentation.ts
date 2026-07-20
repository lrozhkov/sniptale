import { useCallback, useState } from 'react';

interface PresentedPreviewTime {
  projectId: string;
  time: number;
}

export function usePreviewStagePresentationTime(params: {
  currentTime: number;
  isPlaying: boolean;
  projectId: string;
}) {
  const [presented, setPresented] = useState<PresentedPreviewTime | null>(null);
  const present = useCallback(
    (time: number) => setPresented({ projectId: params.projectId, time }),
    [params.projectId]
  );
  return {
    currentTime:
      params.isPlaying && presented?.projectId === params.projectId
        ? presented.time
        : params.currentTime,
    present,
  };
}
