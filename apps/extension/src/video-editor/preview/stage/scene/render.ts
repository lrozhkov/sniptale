import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';

import {
  createVideoEditorEffectRuntime,
  type VideoEditorEffectRuntime,
} from '../../../runtime/effect-runtime';
import { renderPreviewScene } from './render-preview';
import { createPreviewSceneRenderScheduler } from './render-scheduler';
import type { PreviewSceneRenderJob } from './render-scheduler';
import type { PreviewStageCanvasSceneParams } from './types';
import { createVideoPreviewRenderRevision } from '../../cache/revision';
import { renderPreviewSceneWithExactCache } from '../../cache/render';

export function usePreviewStageCanvasRender(
  params: PreviewStageCanvasSceneParams & {
    resizeVersion: number;
    videoFrameState: {
      canRender: boolean;
      version: number;
    };
  }
): void {
  const effectRuntimeRef = usePreviewEffectRuntimeRef();
  const renderRevision = useMemo(
    () =>
      params.previewMode === 'cache' && !params.previewCacheBypass
        ? createVideoPreviewRenderRevision(params.project)
        : Promise.resolve('preview-cache-bypass'),
    [params.previewCacheBypass, params.previewMode, params.project]
  );
  usePreviewEffectRuntimeRetry(effectRuntimeRef, params.effectRuntimeFeedback.retryVersion);
  const renderSchedulerRef = usePreviewRenderSchedulerRef(
    params.effectRuntimeFeedback.onFailure,
    params.effectRuntimeFeedback.onRecovery,
    params.previewExactFrameCache
  );

  usePreviewStageRenderEffect(params, effectRuntimeRef, renderRevision, renderSchedulerRef);
}

function usePreviewStageRenderEffect(
  params: Parameters<typeof usePreviewStageCanvasRender>[0],
  effectRuntimeRef: MutableRefObject<VideoEditorEffectRuntime | null>,
  renderRevision: Promise<string>,
  renderSchedulerRef: ReturnType<typeof usePreviewRenderSchedulerRef>
): void {
  useLayoutEffect(() => {
    const canvas = params.canvasRef.current;
    if (!canvas || !params.videoFrameState.canRender) {
      return;
    }

    return renderSchedulerRef.current.enqueue(
      createPreviewStageCanvasRenderJob({
        canvas,
        currentTime: params.currentTime,
        effectRuntimeRef,
        imageBank: params.imageBank,
        isPlaying: params.isPlaying === true,
        previewRasterSize: params.previewRasterSize,
        previewCacheBypass: params.previewCacheBypass,
        previewMode: params.previewMode,
        project: params.project,
        renderGeneration: params.renderGeneration ?? 0,
        renderRevision,
        stage: params.stageRef.current,
        videoRefs: params.videoRefs,
      })
    );
  }, [
    params.canvasRef,
    params.currentTime,
    effectRuntimeRef,
    params.imageBank,
    params.isPlaying,
    params.project,
    params.previewMode,
    params.previewCacheBypass,
    params.previewRasterSize,
    params.renderGeneration,
    params.resizeVersion,
    params.effectRuntimeFeedback.retryVersion,
    renderSchedulerRef,
    params.stageRef,
    params.videoFrameState,
    params.videoRefs,
    renderRevision,
  ]);
}

function usePreviewEffectRuntimeRetry(
  effectRuntimeRef: MutableRefObject<VideoEditorEffectRuntime | null>,
  retryVersion: number
): void {
  const retryVersionRef = useRef(retryVersion);
  useLayoutEffect(() => {
    if (retryVersionRef.current === retryVersion) return;
    retryVersionRef.current = retryVersion;
    effectRuntimeRef.current?.dispose();
    effectRuntimeRef.current = null;
  }, [effectRuntimeRef, retryVersion]);
}

function createPreviewStageCanvasRenderJob(args: {
  canvas: HTMLCanvasElement;
  currentTime: number;
  effectRuntimeRef: MutableRefObject<VideoEditorEffectRuntime | null>;
  imageBank: PreviewStageCanvasSceneParams['imageBank'];
  isPlaying: boolean;
  previewRasterSize: PreviewStageCanvasSceneParams['previewRasterSize'];
  previewCacheBypass: PreviewStageCanvasSceneParams['previewCacheBypass'];
  previewMode: PreviewStageCanvasSceneParams['previewMode'];
  project: PreviewStageCanvasSceneParams['project'];
  renderGeneration: number;
  renderRevision: Promise<string>;
  stage: HTMLDivElement | null;
  videoRefs: PreviewStageCanvasSceneParams['videoRefs'];
}): PreviewSceneRenderJob {
  const controller = new AbortController();
  return {
    canvas: args.canvas,
    controller,
    currentTime: args.currentTime,
    effectRuntimeExecutor: () =>
      resolvePreviewEffectRuntime(args.effectRuntimeRef, args.canvas.ownerDocument).executor,
    imageBank: args.imageBank,
    isEffectRuntimeFrame: args.project.effectInstances?.some(({ enabled }) => enabled) === true,
    isPlaybackFrame: args.isPlaying === true,
    ...(args.previewRasterSize ? { previewRasterSize: args.previewRasterSize } : {}),
    ...(args.previewCacheBypass === undefined
      ? {}
      : { previewCacheBypass: args.previewCacheBypass }),
    ...(args.previewMode ? { previewMode: args.previewMode } : {}),
    project: args.project,
    renderGeneration: args.renderGeneration,
    renderRevision: args.renderRevision,
    signal: controller.signal,
    stage: args.stage,
    videoRefs: args.videoRefs,
  };
}

function usePreviewRenderSchedulerRef(
  onFailure: PreviewStageCanvasSceneParams['effectRuntimeFeedback']['onFailure'],
  onRecovery: PreviewStageCanvasSceneParams['effectRuntimeFeedback']['onRecovery'],
  exactFrameCache: PreviewStageCanvasSceneParams['previewExactFrameCache']
): MutableRefObject<ReturnType<typeof createPreviewSceneRenderScheduler>> {
  const feedbackRef = useRef({ onFailure, onRecovery });
  feedbackRef.current = { onFailure, onRecovery };
  const schedulerRef = useRef<ReturnType<typeof createPreviewSceneRenderScheduler> | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createPreviewSceneRenderScheduler({
      onError: (error) => feedbackRef.current.onFailure('visual', error),
      onSuccess: () => feedbackRef.current.onRecovery('visual'),
      render: (job) => {
        if (!exactFrameCache) return renderPreviewScene(job);
        return renderPreviewSceneWithExactCache({
          cache: exactFrameCache,
          job,
          render: renderPreviewScene,
        });
      },
    });
  }
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => {
      scheduler?.dispose();
    };
  }, []);
  return schedulerRef as MutableRefObject<ReturnType<typeof createPreviewSceneRenderScheduler>>;
}

function usePreviewEffectRuntimeRef(): MutableRefObject<VideoEditorEffectRuntime | null> {
  const runtimeRef = useRef<VideoEditorEffectRuntime | null>(null);
  useEffect(
    () => () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    },
    []
  );
  return runtimeRef;
}

function resolvePreviewEffectRuntime(
  runtimeRef: MutableRefObject<VideoEditorEffectRuntime | null>,
  ownerDocument: Document
): VideoEditorEffectRuntime {
  if (runtimeRef.current?.ownerDocument === ownerDocument) return runtimeRef.current;
  runtimeRef.current?.dispose();
  runtimeRef.current = createVideoEditorEffectRuntime({ ownerDocument });
  return runtimeRef.current;
}
