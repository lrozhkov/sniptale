import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  VideoEditorPreviewMode,
  type VideoEditorPreviewPrepareOutcome,
  type VideoEditorPreviewPrepareRequest,
  type VideoEditorPreviewStatus,
} from '../../../../contracts/preview-runtime';
import type { PlaybackPreviewRuntime } from '../../../../interaction/playback/types';
import type { PreparedCachedVideoPreview } from '../../../../preview/cache/types';
import { createVideoPreviewRenderIdentity } from '../../../../preview/cache/revision';
import type {
  PreviewAttemptOutcome,
  PreviewRuntimeAuthority,
  UsePreviewStagePlaybackPreviewRuntimeParams,
} from './authority';
import { buildPreviewCacheAttempt, resolvePreviewAttemptFreshness } from './cache-attempt';
import { preparePreviewStagePlayback } from './prime';

async function prepareRuntimeAttempt(
  authority: PreviewRuntimeAuthority,
  request: VideoEditorPreviewPrepareRequest
): Promise<PreviewAttemptOutcome> {
  const revision = authority.configurationRevisionRef.current;
  const latest = authority.latestStateRef.current;
  latest.onPresentationTime(request.time);
  await preparePreviewStagePlayback(latest, request.time);
  const stale = resolvePreviewAttemptFreshness(authority, request, revision);
  if (stale) return stale;
  if (latest.previewMode === VideoEditorPreviewMode.CACHE) {
    return buildPreviewCacheAttempt({ authority, request, revision });
  }
  authority.setCachedVideo(null);
  authority.publishStatus({
    completedFrames: 0,
    mode: VideoEditorPreviewMode.LIVE,
    phase: request.isPlaying ? 'live' : 'idle',
    totalFrames: 0,
  });
  return 'live-ready';
}

async function prepareRuntimeRequest(
  authority: PreviewRuntimeAuthority,
  request: VideoEditorPreviewPrepareRequest
): Promise<VideoEditorPreviewPrepareOutcome> {
  if (request.reason === 'seek') {
    authority.latestStateRef.current.renderGenerationRef.current += 1;
  }
  authority.generationRef.current = request.generation;
  authority.activePreparationRef.current?.abort();
  while (!request.signal.aborted && authority.generationRef.current === request.generation) {
    const outcome = await prepareRuntimeAttempt(authority, request);
    if (outcome !== 'retry') return outcome;
  }
  return 'cancelled';
}

function createPlaybackPreviewRuntime(authority: PreviewRuntimeAuthority): PlaybackPreviewRuntime {
  return {
    cancel(generation) {
      authority.generationRef.current = Math.max(authority.generationRef.current, generation + 1);
      authority.activePreparationRef.current?.abort();
      authority.activePreparationRef.current = null;
      const phase = authority.previewStatusRef.current.phase;
      authority.publishStatus({
        completedFrames: authority.previewStatusRef.current.completedFrames,
        mode: authority.latestStateRef.current.previewMode,
        phase: phase.startsWith('preparing-') ? 'paused-preparation' : 'idle',
        totalFrames: authority.previewStatusRef.current.totalFrames,
      });
    },
    prepare: (request) => prepareRuntimeRequest(authority, request),
    present: (time) => authority.latestStateRef.current.onPresentationTime(time),
    settle: (time) => authority.latestStateRef.current.onPresentationTime(time),
    subscribe(listener) {
      authority.listenersRef.current.add(listener);
      listener(authority.previewStatusRef.current);
      return () => authority.listenersRef.current.delete(listener);
    },
  };
}

function usePreviewRuntimeAuthority(params: UsePreviewStagePlaybackPreviewRuntimeParams) {
  const [cachedVideo, setCachedVideo] = useState<PreparedCachedVideoPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<VideoEditorPreviewStatus>({
    completedFrames: 0,
    mode: params.previewMode,
    phase: 'idle',
    totalFrames: 0,
  });
  const previewStatusRef = useRef(previewStatus);
  previewStatusRef.current = previewStatus;
  const latestStateRef = useRef(params);
  latestStateRef.current = params;
  const activePreparationRef = useRef<AbortController | null>(null);
  const configurationRevisionRef = useRef(0);
  const generationRef = useRef(0);
  const listenersRef = useRef(new Set<(status: VideoEditorPreviewStatus) => void>());
  const publishStatus = useCallback((status: VideoEditorPreviewStatus) => {
    previewStatusRef.current = status;
    setPreviewStatus(status);
    listenersRef.current.forEach((listener) => listener(status));
  }, []);
  const authority = useMemo<PreviewRuntimeAuthority>(
    () => ({
      activePreparationRef,
      configurationRevisionRef,
      generationRef,
      latestStateRef,
      listenersRef,
      previewStatusRef,
      publishStatus,
      setCachedVideo,
    }),
    [publishStatus]
  );
  return { authority, cachedVideo, previewStatus, setCachedVideo };
}

function usePreviewRuntimeConfigurationReset(
  authority: PreviewRuntimeAuthority,
  params: UsePreviewStagePlaybackPreviewRuntimeParams
): void {
  const projectRenderIdentity = useMemo(
    () => createVideoPreviewRenderIdentity(params.project),
    [params.project]
  );
  useEffect(() => {
    authority.configurationRevisionRef.current += 1;
    authority.activePreparationRef.current?.abort();
    authority.activePreparationRef.current = null;
    authority.setCachedVideo(null);
  }, [
    authority,
    params.playbackRange?.end,
    params.playbackRange?.start,
    params.previewMode,
    params.previewRasterSize.height,
    params.previewRasterSize.width,
    projectRenderIdentity,
  ]);
}

function usePreviewRuntimeRegistration(
  authority: PreviewRuntimeAuthority,
  register: (runtime: PlaybackPreviewRuntime | null) => void
): void {
  useEffect(() => {
    register(createPlaybackPreviewRuntime(authority));
    const activePreparationRef = authority.activePreparationRef;
    return () => {
      activePreparationRef.current?.abort();
      activePreparationRef.current = null;
      register(null);
    };
  }, [authority, register]);
}

export function usePreviewStagePlaybackPreviewRuntime(
  params: UsePreviewStagePlaybackPreviewRuntimeParams
): { cachedVideo: PreparedCachedVideoPreview | null; previewStatus: VideoEditorPreviewStatus } {
  const runtime = usePreviewRuntimeAuthority(params);
  usePreviewRuntimeConfigurationReset(runtime.authority, params);
  usePreviewRuntimeRegistration(runtime.authority, params.registerPreviewRuntime);
  return { cachedVideo: runtime.cachedVideo, previewStatus: runtime.previewStatus };
}
