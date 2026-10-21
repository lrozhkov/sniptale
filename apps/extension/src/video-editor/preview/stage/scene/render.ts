import { createVideoPreviewCompositionJoinRenderer } from './joins';
import { createVideoProjectWatermarkRenderer } from '../../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../../runtime/session/asset-urls';
import {
  createReviewSpatialRenderer,
  type ReviewSpatialRenderer,
} from '../../../../features/video/composition/canvas/spatial-renderer';
import { usePreviewFrameRate } from '../frame-rate';
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
import { createVideoProjectCaptionRenderer } from '../../../../workflows/video-review/project-captions';

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
    params.previewExactFrameCache,
    params.effectRuntimeFeedback.retryVersion,
    params.project,
    params.previewRasterSize,
    params.assetUrls
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
        ...(params.assetUrls ? { assetUrls: params.assetUrls } : {}),
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
    params.assetUrls,
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
  assetUrls?: Record<string, string>;
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
    ...(args.assetUrls ? { assetUrls: args.assetUrls } : {}),
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
  exactFrameCache: PreviewStageCanvasSceneParams['previewExactFrameCache'],
  retryVersion: number,
  project: PreviewStageCanvasSceneParams['project'],
  rasterSize: PreviewStageCanvasSceneParams['previewRasterSize'],
  assetUrls: PreviewStageCanvasSceneParams['assetUrls']
): MutableRefObject<ReturnType<typeof createPreviewSceneRenderScheduler>> {
  const frameRate = usePreviewFrameRate();
  const frameRateRef = useRef(frameRate);
  frameRateRef.current = frameRate;
  const feedbackRef = useRef({ onFailure, onRecovery });
  feedbackRef.current = { onFailure, onRecovery };
  const schedulerRef = useRef<ReturnType<typeof createPreviewSceneRenderScheduler> | null>(null);
  const captionsRef = useRef<ReturnType<typeof createVideoProjectCaptionRenderer> | null>(null);
  const watermarkRef = useRef<ReturnType<typeof createVideoProjectWatermarkRenderer> | null>(null);
  const joinsRef = useRef<ReturnType<typeof createVideoPreviewCompositionJoinRenderer> | null>(
    null
  );
  const stagingRef = useRef<HTMLCanvasElement | null>(null);
  const spatialRef = useRef<ReviewSpatialRenderer | null>(null);
  const retryRef = useRef(retryVersion);
  if (!schedulerRef.current) {
    const captionRenderer = createVideoProjectCaptionRenderer();
    captionsRef.current = captionRenderer;
    const watermarkRenderer = createVideoProjectWatermarkRenderer(loadVideoEditorAssetBlob);
    watermarkRef.current = watermarkRenderer;
    schedulerRef.current = createPreviewSceneRenderScheduler({
      onError: (error) => {
        joinsRef.current?.clear();
        watermarkRenderer.clear();
        const spatial = spatialRef.current;
        spatialRef.current = null;
        spatial?.dispose();
        feedbackRef.current.onFailure('visual', error);
      },
      onSuccess: (job) => {
        feedbackRef.current.onRecovery('visual');
        if (job.isPlaybackFrame && job.previewMode !== 'cache') frameRateRef.current?.record();
      },
      render: (job) => {
        const render = (input: Parameters<typeof renderPreviewScene>[0]) => {
          joinsRef.current ??= createVideoPreviewCompositionJoinRenderer(renderPreviewScene);
          return joinsRef.current.render({
            ...input,
            captionRenderer,
            watermarkRenderer,
            spatialRenderer: () => {
              input.signal?.throwIfAborted();
              if (spatialRef.current) return spatialRef.current;
              const renderer: ReviewSpatialRenderer = createReviewSpatialRenderer(() => {
                if (spatialRef.current !== renderer) return;
                spatialRef.current = null;
                renderer.dispose();
                feedbackRef.current.onFailure('visual', new Error('Perspective context was lost.'));
              });
              spatialRef.current = renderer;
              return renderer;
            },
            stagingCanvas: () => {
              if (stagingRef.current?.ownerDocument === input.canvas.ownerDocument)
                return stagingRef.current;
              if (stagingRef.current) {
                stagingRef.current.width = 0;
                stagingRef.current.height = 0;
              }
              stagingRef.current = input.canvas.ownerDocument.createElement('canvas');
              stagingRef.current.width = 0;
              stagingRef.current.height = 0;
              return stagingRef.current;
            },
          });
        };
        if (!exactFrameCache) return render(job);
        return renderPreviewSceneWithExactCache({
          cache: exactFrameCache,
          job,
          render,
        });
      },
    });
  }
  useLayoutEffect(
    () => () => joinsRef.current?.clear(),
    [project, rasterSize?.width, rasterSize?.height, assetUrls]
  );
  useLayoutEffect(() => {
    if (retryRef.current === retryVersion) return;
    retryRef.current = retryVersion;
    watermarkRef.current?.clear();
    joinsRef.current?.clear();
    const spatial = spatialRef.current;
    spatialRef.current = null;
    spatial?.dispose();
  }, [retryVersion]);
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => {
      scheduler?.dispose();
      joinsRef.current?.dispose();
      joinsRef.current = null;
      captionsRef.current?.clear();
      watermarkRef.current?.clear();
      const spatial = spatialRef.current;
      spatialRef.current = null;
      spatial?.dispose();
      if (stagingRef.current) {
        stagingRef.current.width = 0;
        stagingRef.current.height = 0;
        stagingRef.current = null;
      }
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
