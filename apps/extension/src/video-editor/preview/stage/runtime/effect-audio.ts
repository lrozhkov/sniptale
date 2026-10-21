import { getVideoProjectSceneEdgeAudioGain } from '../../../../features/video/project/scene/edge-fades';
import { buildProjectActionAudioPlan } from '../../../../features/video/review/project-action-audio';
import { createProjectActionAudioRuntime } from './action-audio';
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
  const outputGain = getVideoProjectSceneEdgeAudioGain(args.project, args.currentTime);
  const plans = useMemo(() => resolveEffectRuntimeAudioPlans(args.project), [args.project]);
  const stateRef = useRef(createPreviewEffectAudioState());
  const actionStateRef = useRef(createProjectActionAudioRuntime());
  const actionPlan = useMemo(() => buildProjectActionAudioPlan(args.project), [args.project]);
  const retryVersionRef = useRef(args.feedback.retryVersion);
  const { onFailure, onRecovery, retryVersion } = args.feedback;

  useLayoutEffect(() => {
    if (retryVersionRef.current !== retryVersion) {
      retryVersionRef.current = retryVersion;
      resetPreviewEffectAudio(stateRef.current);
      actionStateRef.current.reset();
    }
    let active = true;
    void Promise.all([
      syncPreviewEffectAudio({
        currentTime: args.currentTime,
        isPlaying: args.isPlaying,
        outputGain,
        plans,
        state: stateRef.current,
      }),
      actionStateRef.current.sync({
        plan: actionPlan,
        currentTime: args.currentTime,
        isPlaying: args.isPlaying,
        outputGain,
      }),
    ]).then(
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
  }, [
    args.currentTime,
    args.isPlaying,
    onFailure,
    onRecovery,
    plans,
    actionPlan,
    retryVersion,
    outputGain,
  ]);

  useEffect(() => {
    const state = stateRef.current;
    const actionState = actionStateRef.current;
    return () => {
      void actionState.close().catch(() => undefined);
      void cleanupPreviewEffectAudio(state).catch((error) =>
        logger.warn('Failed to close EffectV1 preview audio context', error)
      );
    };
  }, []);
}
