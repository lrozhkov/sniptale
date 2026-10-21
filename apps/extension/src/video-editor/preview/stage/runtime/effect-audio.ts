import type { VideoEditorPreviewPrepareRequest } from '../../../contracts/preview-runtime';
import { planProjectSourceVoiceoverPlayback } from '../../../../features/video/project/source-voiceover-playback';
import { createProjectSourceVoiceoverAudioRuntime } from './source-voiceover-audio';
import { getVideoProjectSceneEdgeAudioGain } from '../../../../features/video/project/scene/edge-fades';
import { buildProjectActionAudioPlan } from '../../../../features/video/review/project-action-audio';
import { createProjectActionAudioRuntime } from './action-audio';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

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
  assetUrls: Record<string, string>;
  currentTime: number;
  feedback: PreviewEffectRuntimeFeedback;
  isPlaying: boolean;
  project: VideoProject;
}) {
  const outputGain = getVideoProjectSceneEdgeAudioGain(args.project, args.currentTime);
  const plans = useMemo(() => resolveEffectRuntimeAudioPlans(args.project), [args.project]);
  const stateRef = useRef(createPreviewEffectAudioState());
  const actionStateRef = useRef(createProjectActionAudioRuntime());
  const actionPlan = useMemo(() => buildProjectActionAudioPlan(args.project), [args.project]);
  const voiceStateRef = useRef(createProjectSourceVoiceoverAudioRuntime());
  const voiceEntries = useMemo(
    () => planProjectSourceVoiceoverPlayback(args.project).map((item) => item.entry),
    [args.project]
  );
  const retryVersionRef = useRef(args.feedback.retryVersion);
  const { onFailure, onRecovery, retryVersion } = args.feedback;

  useLayoutEffect(() => {
    if (retryVersionRef.current !== retryVersion) {
      retryVersionRef.current = retryVersion;
      resetPreviewEffectAudio(stateRef.current);
      actionStateRef.current.reset();
      voiceStateRef.current.reset();
    }
    let active = true;
    void Promise.all([
      voiceStateRef.current.sync({
        entries: voiceEntries,
        assetUrls: args.assetUrls,
        currentTime: args.currentTime,
        isPlaying: args.isPlaying,
        outputGain,
      }),
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
    args.assetUrls,
    voiceEntries,
    args.currentTime,
    args.isPlaying,
    onFailure,
    onRecovery,
    plans,
    actionPlan,
    retryVersion,
    outputGain,
  ]);

  const prepareSourceVoiceover = useCallback(
    async (request: VideoEditorPreviewPrepareRequest) => {
      try {
        await voiceStateRef.current.prepare(
          { entries: voiceEntries, assetUrls: args.assetUrls, currentTime: request.time },
          request.signal
        );
      } catch (error) {
        if (request.signal.aborted || retryVersionRef.current !== retryVersion) return;
        onFailure('audio', error);
        throw error;
      }
    },
    [voiceEntries, args.assetUrls, onFailure, retryVersion]
  );

  useEffect(() => {
    const state = stateRef.current;
    const actionState = actionStateRef.current;
    const voiceState = voiceStateRef.current;
    return () => {
      voiceState.close();
      void actionState.close().catch(() => undefined);
      void cleanupPreviewEffectAudio(state).catch((error) =>
        logger.warn('Failed to close EffectV1 preview audio context', error)
      );
    };
  }, []);
  return prepareSourceVoiceover;
}
