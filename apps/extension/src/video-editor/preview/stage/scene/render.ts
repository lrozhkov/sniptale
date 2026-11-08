import type { GpuPreviewFramePresenter } from '../../../../features/video/composition/canvas/preview-presentation';
import { createVideoPreviewCompositionJoinRenderer } from './joins';
import { createVideoProjectWatermarkRenderer } from '../../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../../runtime/session/asset-urls';
import { createReviewSpatialSession } from '../../../../workflows/video-review/spatial-render-session';
import type { ReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';
import { usePreviewFrameRate } from '../frame-rate';
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';

import {
  createVideoEditorEffectRuntime,
  createVideoEditorEffectPreparationExecutor,
  type VideoEditorEffectRuntime,
} from '../../../runtime/effect-runtime';
import { renderPreviewScene, PreviewGpuSerialFallback } from './render-preview';
import { prepareNativePreviewSceneFrame } from './frame-plan';
import { createPreviewSceneRenderScheduler } from './render-scheduler';
import type { PreviewSceneRenderJob } from './render-scheduler';
import type { PreviewStageCanvasSceneParams } from './types';
import { createVideoPreviewRenderRevision } from '../../cache/revision';
import { createVideoPreviewExactFrameRenderer } from '../../cache/render';
import { createVideoProjectCaptionRenderer } from '../../../../workflows/video-review/project-captions';
import { createNativeGpuPreviewRenderer } from './gpu-preview';
import { resolveActivePreviewClips } from '../runtime/index';
import { canRenderActivePreviewVideos } from './video-frame';
import type { VideoPreviewRenderer } from '../../../../features/video/preview/preferences';

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
        ? createVideoPreviewRenderRevision(params.project, params.previewRenderer)
        : Promise.resolve('preview-cache-bypass'),
    [params.previewCacheBypass, params.previewMode, params.previewRenderer, params.project]
  );
  usePreviewEffectRuntimeRetry(effectRuntimeRef, params.effectRuntimeFeedback.retryVersion);
  const renderSchedulerRef = usePreviewRenderSchedulerRef(
    params.effectRuntimeFeedback.onFailure,
    params.effectRuntimeFeedback.onRecovery,
    params.previewExactFrameCache,
    params.effectRuntimeFeedback.retryVersion,
    params.previewRenderer ?? 'gpu'
  );

  usePreviewStageRenderEffect(params, effectRuntimeRef, renderRevision, renderSchedulerRef);
}

function usePreviewStageRenderEffect(
  params: Parameters<typeof usePreviewStageCanvasRender>[0],
  effectRuntimeRef: MutableRefObject<VideoEditorEffectRuntime | null>,
  renderRevision: Promise<string>,
  renderSchedulerRef: ReturnType<typeof usePreviewRenderSchedulerRef>
): void {
  const registerPlaybackRequest = params.registerPlaybackRequest;
  const direct =
    !!registerPlaybackRequest && params.isPlaying === true && params.previewMode !== 'cache';
  const committed = useRef({ params, renderRevision });
  const lastRequest = useRef<{ projectId: string; generation: number; time: number } | null>(null);
  const cancelDirect = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    committed.current = { params, renderRevision };
  });

  const enqueue = (time: number, requireCurrentDependencies: boolean) => {
    const { params: current, renderRevision: revision } = committed.current;
    const canvas = current.canvasRef.current;
    if (
      !canvas ||
      !current.videoFrameState.canRender ||
      current.canRenderCursorFrame?.(time) === false
    )
      return;
    const framePresenter = current.framePresenterRef?.current;
    if (requireCurrentDependencies) {
      const needed = resolveActivePreviewClips(current.project, time);
      if (
        needed.length !== current.activeClips.length ||
        needed.some((clip, index) => clip.id !== current.activeClips[index]?.id) ||
        !canRenderActivePreviewVideos(needed, current.videoRefs)
      )
        return;
    }
    return renderSchedulerRef.current.enqueue(
      createPreviewStageCanvasRenderJob({
        canvas,
        onCameraPresented: current.onCameraPresented,
        ...(framePresenter ? { framePresenter } : {}),
        currentTime: time,
        ...(current.assetUrls ? { assetUrls: current.assetUrls } : {}),
        effectRuntimeRef,
        imageBank: current.imageBank,
        isPlaying: current.isPlaying === true,
        previewRasterSize: current.previewRasterSize,
        previewCacheBypass: current.previewCacheBypass,
        previewMode: current.previewMode,
        previewRenderer: current.previewRenderer ?? 'gpu',
        project: current.project,
        effectPreparationProject: current.effectPreparationProject,
        renderGeneration: current.renderGenerationRef?.current ?? current.renderGeneration ?? 0,
        runtimeVersion: current.effectRuntimeFeedback.retryVersion,
        layoutVersion: current.resizeVersion,
        renderRevision: revision,
        stage: current.stageRef.current,
        videoRefs: current.videoRefs,
      })
    );
  };
  const enqueueRef = useRef(enqueue);
  useLayoutEffect(() => {
    enqueueRef.current = enqueue;
  });
  useLayoutEffect(() => {
    if (!direct || !registerPlaybackRequest) return;
    let active = true;
    const release = registerPlaybackRequest((time) => {
      if (!active) return;
      const current = committed.current.params;
      lastRequest.current = {
        projectId: current.project.id,
        generation: current.renderGenerationRef?.current ?? current.renderGeneration ?? 0,
        time,
      };
      cancelDirect.current = enqueueRef.current(time, true) ?? cancelDirect.current;
    });
    return () => {
      active = false;
      release();
      cancelDirect.current?.();
      cancelDirect.current = null;
      lastRequest.current = null;
    };
  }, [direct, registerPlaybackRequest]);

  const effectTime = direct ? null : params.currentTime;
  const activeClipKey = params.activeClips.map((clip) => clip.id).join('|');
  useLayoutEffect(() => {
    const current = committed.current.params;
    const generation = current.renderGenerationRef?.current ?? current.renderGeneration ?? 0;
    const last = lastRequest.current;
    const time =
      direct && last?.projectId === current.project.id && last.generation === generation
        ? last.time
        : current.currentTime;
    return enqueueRef.current(time, direct);
  }, [
    direct,
    effectTime,
    params.canvasRef,
    params.canRenderCursorFrame,
    params.framePresenterRef,
    params.onCameraPresented,
    params.assetUrls,
    effectRuntimeRef,
    params.imageBank,
    params.isPlaying,
    params.project,
    params.effectPreparationProject,
    activeClipKey,
    params.previewMode,
    params.previewRenderer,
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
  onCameraPresented: PreviewStageCanvasSceneParams['onCameraPresented'];
  framePresenter?: GpuPreviewFramePresenter;
  assetUrls?: Record<string, string>;
  effectRuntimeRef: MutableRefObject<VideoEditorEffectRuntime | null>;
  imageBank: PreviewStageCanvasSceneParams['imageBank'];
  isPlaying: boolean;
  previewRasterSize: PreviewStageCanvasSceneParams['previewRasterSize'];
  previewCacheBypass: PreviewStageCanvasSceneParams['previewCacheBypass'];
  previewMode: PreviewStageCanvasSceneParams['previewMode'];
  previewRenderer: PreviewStageCanvasSceneParams['previewRenderer'];
  project: PreviewStageCanvasSceneParams['project'];
  effectPreparationProject?: PreviewStageCanvasSceneParams['effectPreparationProject'];
  renderGeneration: number;
  runtimeVersion: number;
  layoutVersion: number;
  renderRevision: Promise<string>;
  stage: HTMLDivElement | null;
  videoRefs: PreviewStageCanvasSceneParams['videoRefs'];
}): PreviewSceneRenderJob {
  const controller = new AbortController();
  return {
    canvas: args.canvas,
    onCameraPresented: args.onCameraPresented,
    ...(args.framePresenter
      ? {
          framePresenter: args.framePresenter,
          deferFrameEvent: true,
          acquireGpuOutput: args.framePresenter.acquire,
        }
      : {}),
    controller,
    currentTime: args.currentTime,
    previewRenderer: args.previewRenderer ?? 'gpu',
    ...(args.assetUrls ? { assetUrls: args.assetUrls } : {}),
    effectRuntimeExecutor: () =>
      resolvePreviewEffectRuntime(
        args.effectRuntimeRef,
        args.canvas.ownerDocument,
        args.previewRenderer ?? 'gpu'
      ).executor,
    imageBank: args.imageBank,
    isEffectRuntimeFrame: args.project.effectInstances?.some(({ enabled }) => enabled) === true,
    isPlaybackFrame: args.isPlaying === true,
    ...(args.previewRasterSize ? { previewRasterSize: args.previewRasterSize } : {}),
    ...(args.previewCacheBypass === undefined
      ? {}
      : { previewCacheBypass: args.previewCacheBypass }),
    ...(args.previewMode ? { previewMode: args.previewMode } : {}),
    project: args.project,
    effectPreparationProject: args.effectPreparationProject,
    renderGeneration: args.renderGeneration,
    runtimeVersion: args.runtimeVersion,
    layoutVersion: args.layoutVersion,
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
  renderer: VideoPreviewRenderer
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
  const gpuRef = useRef<ReturnType<typeof createNativeGpuPreviewRenderer> | null>(null);
  const cacheRendererRef = useRef<ReturnType<typeof createVideoPreviewExactFrameRenderer> | null>(
    null
  );
  const retryRef = useRef({ version: retryVersion, renderer });
  const serialFallbackRef = useRef(false);
  if (!schedulerRef.current) {
    const captionRenderer = createVideoProjectCaptionRenderer();
    captionsRef.current = captionRenderer;
    const watermarkRenderer = createVideoProjectWatermarkRenderer(loadVideoEditorAssetBlob);
    watermarkRef.current = watermarkRenderer;
    schedulerRef.current = createPreviewSceneRenderScheduler({
      maximumInFlight: 2,
      retrySerial(error) {
        if (!(error instanceof PreviewGpuSerialFallback)) return false;
        serialFallbackRef.current = true;
        return true;
      },
      prepare: (input) => {
        if (
          serialFallbackRef.current ||
          input.previewRenderer === 'legacy' ||
          input.previewMode === 'cache' ||
          !gpuRef.current?.acceptsNativeFrames
        )
          return undefined;
        joinsRef.current ??= createVideoPreviewCompositionJoinRenderer(
          renderPreviewScene,
          prepareNativePreviewSceneFrame
        );
        return joinsRef.current.prepare(input);
      },
      onError: (error) => {
        joinsRef.current?.clear();
        cacheRendererRef.current?.clear();
        watermarkRenderer.clear();
        const spatial = spatialRef.current;
        spatialRef.current = null;
        spatial?.dispose();
        gpuRef.current?.dispose();
        gpuRef.current = null;
        feedbackRef.current.onFailure('visual', error);
      },
      onSuccess: (job, presentation) => {
        let transferred = false;
        if (presentation) {
          const acceptGeometry = () => {
            if (job.framePresenter && presentation.output) {
              // The GPU front is visible before the hidden layout/cache anchor changes its backing.
              const { width, height } = presentation.output.canvas;
              if (job.canvas.width !== width) job.canvas.width = width;
              if (job.canvas.height !== height) job.canvas.height = height;
            }
            job.onCameraPresented?.(presentation.camera, presentation.time);
          };
          if (job.framePresenter) {
            job.framePresenter.publish(presentation.output ?? null, acceptGeometry);
            transferred = presentation.output !== undefined;
          } else acceptGeometry();
          if (presentation.renderer) frameRateRef.current?.reportRenderer(presentation.renderer);
        }
        feedbackRef.current.onRecovery('visual');
        if (job.isPlaybackFrame && job.previewMode !== 'cache') frameRateRef.current?.record();
        return transferred;
      },
      render: (job) => {
        if (
          !job.signal?.aborted &&
          typeof job.effectRuntimeExecutor === 'function' &&
          job.previewRenderer !== 'legacy' &&
          job.project.effectInstances?.some(
            (instance) =>
              instance.enabled &&
              instance.kind === 'standalone' &&
              job.project.clips.some(
                (clip) =>
                  clip.type === 'EFFECT' &&
                  clip.effectInstanceId === instance.id &&
                  job.project.tracks.some(({ id, visible }) => id === clip.trackId && visible)
              )
          )
        )
          job.effectRuntimeExecutor();
        const render = (input: Parameters<typeof renderPreviewScene>[0]) => {
          joinsRef.current ??= createVideoPreviewCompositionJoinRenderer(
            renderPreviewScene,
            prepareNativePreviewSceneFrame
          );
          if (input.previewRenderer !== 'legacy')
            gpuRef.current ??= createNativeGpuPreviewRenderer(undefined, {
              maximumInFlight: 2,
              createPreparationExecutor: createVideoEditorEffectPreparationExecutor,
            });
          return joinsRef.current.render({
            ...input,
            ...(gpuRef.current ? { gpuPreview: gpuRef.current } : {}),
            gpuOnly:
              input.previewRenderer !== 'legacy' &&
              input.previewMode !== 'cache' &&
              !serialFallbackRef.current &&
              gpuRef.current?.acceptsNativeFrames === true,
            captionRenderer,
            watermarkRenderer,
            spatialRenderer: () => {
              input.signal?.throwIfAborted();
              if (spatialRef.current) return spatialRef.current;
              const renderer: ReviewSpatialRenderer = createReviewSpatialSession(() => {
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
        cacheRendererRef.current ??= createVideoPreviewExactFrameRenderer();
        return cacheRendererRef.current.render({
          cache: exactFrameCache,
          job,
          render,
        });
      },
    });
  }
  useLayoutEffect(() => {
    if (retryRef.current.version === retryVersion && retryRef.current.renderer === renderer) return;
    retryRef.current = { version: retryVersion, renderer };
    serialFallbackRef.current = false;
    watermarkRef.current?.clear();
    joinsRef.current?.clear();
    cacheRendererRef.current?.clear();
    const spatial = spatialRef.current;
    spatialRef.current = null;
    spatial?.dispose();
    gpuRef.current?.dispose();
    gpuRef.current = null;
  }, [retryVersion, renderer]);
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => {
      scheduler?.dispose();
      cacheRendererRef.current?.dispose();
      cacheRendererRef.current = null;
      joinsRef.current?.dispose();
      joinsRef.current = null;
      captionsRef.current?.clear();
      watermarkRef.current?.clear();
      const spatial = spatialRef.current;
      spatialRef.current = null;
      spatial?.dispose();
      gpuRef.current?.dispose();
      gpuRef.current = null;
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
  ownerDocument: Document,
  renderer: VideoPreviewRenderer
): VideoEditorEffectRuntime {
  if (
    runtimeRef.current?.ownerDocument === ownerDocument &&
    runtimeRef.current.renderer === renderer
  )
    return runtimeRef.current;
  runtimeRef.current?.dispose();
  runtimeRef.current = createVideoEditorEffectRuntime({ ownerDocument, renderer });
  return runtimeRef.current;
}
