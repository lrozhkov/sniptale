import { createCompositionCutSampleSource } from '../../../workflows/video-review/decoded-video-sample';
import type { VideoCompositionFrameSource } from '../../../features/video/composition/draw/media-source';
import { hasCameraMediaAt } from '../../../features/video/project/camera/animation';
import { createCompositionJoinEndpoints } from '../../../features/video/composition/canvas/join-endpoints';
import {
  drawCompositionColorOverlay,
  drawVideoProjectSceneEdges,
} from '../../../features/video/composition/canvas/scene-edges';
import { evaluateCompositionJoin } from '../../../features/video/project/scene/composition-join';
import {
  resolveVideoProjectCompositionJoinPlans,
  resolveVideoProjectCompositionJoinEndpoints,
} from '../../../features/video/project/scene/joins';
import { createPreviewRenderResources } from '../../../workflows/video-review/preview-render-resources';
import { createVideoProjectWatermarkRenderer } from '../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../runtime/session/asset-urls';
import {
  createReviewSpatialRenderer,
  type ReviewSpatialRenderer,
} from '../../../features/video/composition/canvas/spatial-renderer';
import { projectWindowHeaderImages } from '../../../features/video/composition/draw/window-header';
import type { VideoCompositionCameraState } from '../../../features/video/composition/types';
import {
  getVideoClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../features/video/project/timeline';
import type { VideoProject } from '../../../features/video/project/types';
import { createVideoEditorEffectRuntime } from '../../runtime/effect-runtime';
import { renderPreviewScene } from '../stage/scene/render-preview';
import { createVideoProjectCaptionRenderer } from '../../../workflows/video-review/project-captions';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';

const FRAME_SOURCE_TIMEOUT_MS = 2_000;
const MEDIA_READY_FOR_CURRENT_FRAME = 2;

export interface VideoPreviewFrameMaterializer {
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
  renderFrame(
    time: number,
    signal: AbortSignal,
    cameraOverride?: VideoCompositionCameraState
  ): Promise<HTMLCanvasElement>;
}

interface VideoPreviewMaterializerState {
  disposed: boolean;
  spatialRenderer: ReviewSpatialRenderer | null;
  stagingCanvas: HTMLCanvasElement | null;
  captionRenderer: ReturnType<typeof createVideoProjectCaptionRenderer>;
  watermarkRenderer: ReturnType<typeof createVideoProjectWatermarkRenderer>;
  effectRuntime: ReturnType<typeof createVideoEditorEffectRuntime> | null;
  imageBank: Record<string, HTMLImageElement>;
  videoRefs: Record<string, HTMLVideoElement | null>;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Preview preparation was cancelled', 'AbortError');
}

function waitForImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return waitForMediaEvent(image, ['load'], signal);
}

function waitForMediaEvent(
  target: EventTarget,
  eventNames: readonly string[],
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => settle(new Error('Preview media timed out')),
      FRAME_SOURCE_TIMEOUT_MS
    );
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      eventNames.forEach((name) => target.removeEventListener(name, handleReady));
      target.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };
    const settle = (error?: unknown) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleReady = () => settle();
    const handleError = () => settle(new Error('Preview media could not be decoded'));
    const handleAbort = () =>
      settle(new DOMException('Preview preparation was cancelled', 'AbortError'));
    eventNames.forEach((name) => target.addEventListener(name, handleReady, { once: true }));
    target.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function isDecodedFrameReady(
  video: HTMLVideoElement,
  targetTime: number,
  tolerance: number
): boolean {
  return (
    video.readyState >= MEDIA_READY_FOR_CURRENT_FRAME &&
    !video.seeking &&
    Math.abs(video.currentTime - targetTime) <= tolerance
  );
}

function seekVideoToDecodedTime(
  video: HTMLVideoElement,
  targetTime: number,
  tolerance: number,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => settle(new Error('Preview media timed out')),
      FRAME_SOURCE_TIMEOUT_MS
    );
    const pollId = window.setInterval(checkReady, 16);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      video.removeEventListener('seeked', checkReady);
      video.removeEventListener('loadeddata', checkReady);
      video.removeEventListener('timeupdate', checkReady);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };
    const settle = (error?: unknown) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleError = () => settle(new Error('Preview media could not be decoded'));
    const handleAbort = () =>
      settle(new DOMException('Preview preparation was cancelled', 'AbortError'));
    function checkReady(): void {
      if (isDecodedFrameReady(video, targetTime, tolerance)) settle();
    }
    video.addEventListener('seeked', checkReady);
    video.addEventListener('loadeddata', checkReady);
    video.addEventListener('timeupdate', checkReady);
    video.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
    try {
      video.currentTime = targetTime;
    } catch (error) {
      settle(error);
      return;
    }
    queueMicrotask(checkReady);
  });
}

async function waitForDecodedVideoFrame(
  video: HTMLVideoElement,
  targetTime: number,
  fps: number,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  if (video.readyState < MEDIA_READY_FOR_CURRENT_FRAME) {
    const ready = waitForMediaEvent(video, ['loadeddata', 'canplay'], signal);
    video.load();
    await ready;
  }
  const tolerance = 0.5 / Math.max(1, fps);
  if (Math.abs(video.currentTime - targetTime) > tolerance) {
    await seekVideoToDecodedTime(video, targetTime, tolerance, signal);
  }
  throwIfAborted(signal);
}

function createMaterializerSurface(
  ownerDocument: Document,
  rasterSize: VideoEditorPreviewRasterSize
) {
  const stage = ownerDocument.createElement('div');
  const canvas = ownerDocument.createElement('canvas');
  stage.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'opacity:0',
    'left:-100000px',
    'top:0',
    `width:${rasterSize.width}px`,
    `height:${rasterSize.height}px`,
  ].join(';');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.width = rasterSize.width;
  canvas.height = rasterSize.height;
  stage.append(canvas);
  ownerDocument.body.append(stage);
  return { canvas, stage };
}

export function createVideoPreviewFrameMaterializer(params: {
  assetUrls: Record<string, string>;
  sampleFps?: number;
  ownerDocument: Document;
  project: VideoProject;
  rasterSize: VideoEditorPreviewRasterSize;
}): VideoPreviewFrameMaterializer {
  const joinPlans = resolveVideoProjectCompositionJoinPlans(params.project);
  const { canvas, stage } = createMaterializerSurface(params.ownerDocument, params.rasterSize);
  const state = createMaterializerMediaState(params, stage);
  const presentation = joinPlans.length
    ? createMaterializedJoinPresentation(params, state, canvas, stage, joinPlans)
    : null;

  return {
    canvas,
    dispose: () => {
      presentation?.dispose();
      disposeMaterializer(state, stage);
    },
    renderFrame: (time, signal, cameraOverride) =>
      presentation
        ? presentation.renderFrame(time, signal, cameraOverride)
        : renderMaterializedFrame(params, state, canvas, stage, time, signal, cameraOverride),
  };
}

function createMaterializedJoinPresentation(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  state: VideoPreviewMaterializerState,
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
  plans: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>
) {
  const resources = createPreviewRenderResources({
    maximumCanvases: 2,
    maximumManagedBytes: params.rasterSize.width * params.rasterSize.height * 8,
    createCanvas: () => params.ownerDocument.createElement('canvas'),
  });
  let cutSampler: ReturnType<typeof createCompositionCutSampleSource> | undefined;
  let cutPlan: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>[number] | undefined;
  let cameraOverride: VideoCompositionCameraState | undefined;
  let busy = false;
  const renderSample = async (time: number, signal: AbortSignal) => {
    if (!cutPlan)
      return renderMaterializedFrame(
        params,
        state,
        canvas,
        stage,
        time,
        signal,
        cameraOverride,
        'omit'
      );
    cutSampler ??= createCompositionCutSampleSource({
      project: params.project,
      sourceUrl: (clip) => params.assetUrls[clip.assetId],
    });
    const source = cutSampler;
    try {
      const frames = await source.sample(time, signal, time < cutPlan.seam ? 'last' : 'first');
      try {
        return await renderMaterializedFrame(
          params,
          state,
          canvas,
          stage,
          time,
          signal,
          cameraOverride,
          'omit',
          frames.media
        );
      } finally {
        frames.release();
      }
    } catch (error) {
      if (cutSampler === source) cutSampler = undefined;
      source.dispose();
      throw error;
    }
  };
  const endpoints = createCompositionJoinEndpoints({
    resources,
    size: params.rasterSize,
    renderSample: async (time, signal) => ({
      canvas: await renderSample(time, signal),
      release() {},
    }),
  });
  return {
    dispose() {
      endpoints.dispose();
      cutSampler?.dispose();
      resources.dispose();
    },
    async renderFrame(time: number, signal: AbortSignal, nextCamera?: VideoCompositionCameraState) {
      throwIfAborted(signal);
      if (state.disposed) throw new DOMException('Preview preparation was cancelled', 'AbortError');
      if (busy) throw new Error('Composition frame is already being materialized.');
      if (cameraOverride !== nextCamera) endpoints.clear();
      cameraOverride = nextCamera;
      busy = true;
      try {
        const plan = plans.find((item) =>
          evaluateCompositionJoin(time, item.seam, item.before, item.after)
        );
        cutPlan = plan?.boundary.sampling === 'cut' ? plan : undefined;
        if (!cutPlan) {
          cutSampler?.dispose();
          cutSampler = undefined;
        }
        if (!plan) {
          endpoints.clear();
          return await renderMaterializedFrame(
            params,
            state,
            canvas,
            stage,
            time,
            signal,
            cameraOverride
          );
        }
        const blend = evaluateCompositionJoin(time, plan.seam, plan.before, plan.after)!;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Preview frame context is unavailable.');
        if (plan.boundary.transition?.type === 'dissolve') {
          const samples = resolveVideoProjectCompositionJoinEndpoints(
            plan,
            params.sampleFps ?? params.project.fps,
            time
          );
          await endpoints.draw(
            context,
            {
              key: plan,
              ...(cutPlan ? { sampling: 'cut' as const } : {}),
              ...samples,
              incomingWeight: blend.incoming,
            },
            signal
          );
        } else {
          endpoints.clear();
          await renderSample(time, signal);
          drawCompositionColorOverlay(
            context,
            blend.black,
            plan.boundary.transition?.color ?? '#000000'
          );
        }
        throwIfAborted(signal);
        if (state.disposed)
          throw new DOMException('Preview preparation was cancelled', 'AbortError');
        drawVideoProjectSceneEdges(context, params.project, time);
        return canvas;
      } catch (error) {
        endpoints.clear();
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}

function createMaterializerMediaState(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  stage: HTMLDivElement
): VideoPreviewMaterializerState {
  const state: VideoPreviewMaterializerState = {
    disposed: false,
    spatialRenderer: null,
    stagingCanvas: null,
    captionRenderer: createVideoProjectCaptionRenderer(),
    watermarkRenderer: createVideoProjectWatermarkRenderer(loadVideoEditorAssetBlob),
    effectRuntime: null,
    imageBank: {},
    videoRefs: {},
  };
  for (const clip of params.project.clips.filter(isVideoClip)) {
    const src = params.assetUrls[clip.assetId];
    if (!src) continue;
    const video = params.ownerDocument.createElement('video');
    Object.assign(video, {
      defaultMuted: true,
      muted: true,
      playsInline: true,
      preload: 'auto',
      src,
    });
    video.style.cssText = 'position:absolute;width:1px;height:1px;pointer-events:none';
    stage.append(video);
    state.videoRefs[clip.id] = video;
  }
  for (const asset of params.project.assets) {
    const src = params.assetUrls[asset.id];
    if (!src || asset.type !== 'IMAGE') continue;
    const image = params.ownerDocument.createElement('img');
    image.src = src;
    state.imageBank[asset.id] = image;
  }
  for (const { key, src } of projectWindowHeaderImages(params.project)) {
    const image = params.ownerDocument.createElement('img');
    image.src = src;
    state.imageBank[key] = image;
  }
  return state;
}

function disposeMaterializer(state: VideoPreviewMaterializerState, stage: HTMLDivElement): void {
  if (state.disposed) return;
  state.disposed = true;
  const spatial = state.spatialRenderer;
  state.spatialRenderer = null;
  spatial?.dispose();
  if (state.stagingCanvas) {
    state.stagingCanvas.width = 0;
    state.stagingCanvas.height = 0;
  }
  state.stagingCanvas = null;
  Object.values(state.videoRefs).forEach((video) => {
    video?.pause();
    video?.removeAttribute('src');
    video?.load();
    video?.remove();
  });
  state.effectRuntime?.dispose();
  state.captionRenderer.clear();
  state.watermarkRenderer.clear();
  state.effectRuntime = null;
  stage.remove();
}

async function renderMaterializedFrame(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  state: VideoPreviewMaterializerState,
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
  time: number,
  signal: AbortSignal,
  cameraOverride?: VideoCompositionCameraState,
  sceneEdges: 'apply' | 'omit' = 'apply',
  decodedVideoFrames?: ReadonlyMap<string, VideoCompositionFrameSource>
): Promise<HTMLCanvasElement> {
  const assertActive = () => {
    throwIfAborted(signal);
    if (state.disposed) throw new DOMException('Preview preparation was cancelled', 'AbortError');
  };
  assertActive();
  await Promise.all(Object.values(state.imageBank).map((image) => waitForImage(image, signal)));
  assertActive();
  if (!decodedVideoFrames)
    await prepareMaterializedVideos(params.project, state.videoRefs, time, signal);
  assertActive();
  const drawn = await renderPreviewScene({
    ...(sceneEdges === 'omit' ? { sceneEdges } : {}),
    captionRenderer: state.captionRenderer,
    watermarkRenderer: state.watermarkRenderer,
    stagingCanvas: () => {
      assertActive();
      state.stagingCanvas ??= params.ownerDocument.createElement('canvas');
      return state.stagingCanvas;
    },
    spatialRenderer: () => {
      assertActive();
      if (state.spatialRenderer) return state.spatialRenderer;
      const renderer: ReviewSpatialRenderer = createReviewSpatialRenderer(() => {
        if (state.spatialRenderer !== renderer) return;
        state.spatialRenderer = null;
        renderer.dispose();
      });
      state.spatialRenderer = renderer;
      return renderer;
    },
    ...(cameraOverride ? { cameraOverride } : {}),
    canvas,
    currentTime: time,
    effectRuntimeExecutor: () => {
      assertActive();
      state.effectRuntime ??= createVideoEditorEffectRuntime({
        ownerDocument: params.ownerDocument,
      });
      return state.effectRuntime.executor;
    },
    imageBank: state.imageBank,
    previewRasterSize: params.rasterSize,
    project: params.project,
    signal,
    stage,
    videoRefs: { current: state.videoRefs },
    ...(decodedVideoFrames ? { decodedVideoFrames } : {}),
  });
  assertActive();
  if (drawn === false) throw new Error('Preview frame is unavailable.');
  return canvas;
}

async function prepareMaterializedVideos(
  project: VideoProject,
  videoRefs: Record<string, HTMLVideoElement | null>,
  time: number,
  signal: AbortSignal
): Promise<void> {
  const activeVideos = project.clips
    .filter(isVideoClip)
    .filter((clip) => isClipActiveAtTime(clip, time) && hasCameraMediaAt(project, clip, time));
  for (const clip of activeVideos) {
    const video = videoRefs[clip.id];
    if (!video) throw new Error(`Preview video source is unavailable for clip ${clip.id}`);
    video.pause();
    await waitForDecodedVideoFrame(video, getVideoClipSourceTime(clip, time), project.fps, signal);
  }
}
