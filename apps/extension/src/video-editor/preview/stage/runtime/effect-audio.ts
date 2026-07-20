import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import { resolveEffectRuntimeAudioPlans } from '../../../../features/video/composition/effect-runtime/audio/plan';
import type { VideoProject } from '../../../../features/video/project/types';
import type { PreviewEffectRuntimeFeedback } from '../types';
import {
  cleanupPreviewEffectAudio,
  createPreviewEffectAudioState,
  resetPreviewEffectAudio,
  syncPreviewEffectAudio,
} from './effect-audio-state';

const logger = createLogger({ namespace: 'VideoEditorPreviewEffectAudio' });

export function usePreviewEffectAudio(args: {
  currentTime: number;
  feedback: PreviewEffectRuntimeFeedback;
  isPlaying: boolean;
  project: VideoProject;
}): void {
  const plans = useMemo(() => resolveEffectRuntimeAudioPlans(args.project), [args.project]);
  const stateRef = useRef(createPreviewEffectAudioState());
  const retryVersionRef = useRef(args.feedback.retryVersion);
  const { onFailure, onRecovery, retryVersion } = args.feedback;

  useLayoutEffect(() => {
    if (retryVersionRef.current !== retryVersion) {
      retryVersionRef.current = retryVersion;
      resetPreviewEffectAudio(stateRef.current);
    }
    let active = true;
    void syncPreviewEffectAudio({
      currentTime: args.currentTime,
      isPlaying: args.isPlaying,
      plans,
      state: stateRef.current,
    }).then(
      () => {
        if (active) onRecovery('audio');
      },
      (error) => {
        if (active) onFailure('audio', error);
      }
    );
    return () => {
      active = false;
    };
  }, [args.currentTime, args.isPlaying, onFailure, onRecovery, plans, retryVersion]);

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      void cleanupPreviewEffectAudio(state).catch((error) =>
        logger.warn('Failed to close EffectV1 preview audio context', error)
      );
    };
  }, []);
}
