import { useCallback, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { VideoEditorPreviewPhase } from '../../../contracts/preview-runtime';
import {
  cancelActivePlaybackRequest,
  type PlaybackRequestState,
  type PlaybackRuntimeRefs,
  requestPlaybackSeek,
  requestPlaybackStart,
} from './preparation-runtime';

interface PlaybackPreparationActions {
  cancelPlaybackPreparation: () => void;
  pausePlayback: () => number;
  seekTo: (time: number) => void;
  setPlaybackPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
}

function usePlaybackPreparationActions(params: {
  phase: VideoEditorPreviewPhase;
  requestRef: MutableRefObject<PlaybackRequestState>;
  setPhase: (phase: VideoEditorPreviewPhase) => void;
  stable: PlaybackRuntimeRefs;
}): PlaybackPreparationActions {
  const { phase, requestRef, setPhase, stable } = params;
  const cancelPlaybackPreparation = useCallback(
    () => cancelActivePlaybackRequest(stable, requestRef, setPhase),
    [requestRef, setPhase, stable]
  );
  const pausePlayback = useCallback(() => {
    const time = cancelActivePlaybackRequest(stable, requestRef, setPhase);
    stable.handlersRef.current.setPlaying(false);
    return time;
  }, [requestRef, setPhase, stable]);
  const setPlaybackPlaying = useCallback(
    (playing: boolean) => {
      if (!playing) return void pausePlayback();
      requestPlaybackStart(stable, requestRef, setPhase);
    },
    [pausePlayback, requestRef, setPhase, stable]
  );
  const seekTo = useCallback(
    (time: number) => requestPlaybackSeek(stable, requestRef, setPhase, time),
    [requestRef, setPhase, stable]
  );
  const togglePlayback = useCallback(() => {
    setPlaybackPlaying(!(phase === 'starting' || stable.latestStateRef.current.isPlaying));
  }, [phase, setPlaybackPlaying, stable.latestStateRef]);
  return { cancelPlaybackPreparation, pausePlayback, seekTo, setPlaybackPlaying, togglePlayback };
}

export function usePlaybackPreparation(refs: PlaybackRuntimeRefs): PlaybackPreparationActions & {
  phase: VideoEditorPreviewPhase;
} {
  const { handlersRef, latestStateRef, playbackRef, previewRuntimeRef } = refs;
  const stable = useMemo(
    () => ({ handlersRef, latestStateRef, playbackRef, previewRuntimeRef }),
    [handlersRef, latestStateRef, playbackRef, previewRuntimeRef]
  );
  const [phase, setPhase] = useState<VideoEditorPreviewPhase>(() =>
    stable.latestStateRef.current.isPlaying ? 'live' : 'idle'
  );
  const requestRef = useRef<PlaybackRequestState>({ abortController: null, generation: 0 });
  return { ...usePlaybackPreparationActions({ phase, requestRef, setPhase, stable }), phase };
}
