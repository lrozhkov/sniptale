import type { VideoPreviewRenderer } from '../../../features/video/preview/preferences';
import type { PreviewScenePresentation } from '../stage/scene/types';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { createMaterializerGpuComposer } from './materializer-gpu';
import { createRecordingEventsRenderer } from '../../../workflows/video-review/recording-events';
import { createCompositionCutSampleSource } from '../../../workflows/video-review/decoded-video-sample';
import { createRecordingCursorTrajectoryRenderer } from '../../../workflows/video-review/cursor-trajectory';
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
  resolveActiveVideoProjectCompositionJoinPlan,
  resolveVideoProjectCompositionJoinEndpoints,
} from '../../../features/video/project/scene/joins';
import { createPreviewRenderResources } from '../../../workflows/video-review/preview-render-resources';
import { createVideoProjectWatermarkRenderer } from '../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../runtime/session/asset-urls';
import { createReviewSpatialSession } from '../../../workflows/video-review/spatial-render-session';
import type { ReviewSpatialRenderer } from '../../../features/video/composition/canvas/spatial-renderer';
import {
  projectWindowHeaderImages,
  windowHeaderImageKey,
} from '../../../features/video/composition/draw/window-header';
import type {
  VideoCompositionCameraState,
  VideoCompositionFrame,
} from '../../../features/video/composition/types';
import {
  getVideoClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../features/video/project/timeline';
import type { VideoProject } from '../../../features/video/project/types';
import { createVideoEditorEffectRuntime } from '../../runtime/effect-runtime';
import { renderPreviewScene } from '../stage/scene/render-preview';
import { createNativeGpuPreviewRenderer } from '../stage/scene/gpu-preview';

import { createVideoProjectCaptionRenderer } from '../../../workflows/video-review/project-captions';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';

const MEDIA_LOAD_TIMEOUT_MS = 2_000;
// Long-GOP UHD seeks exceeded two seconds in Chromium. Cancellation still interrupts this bounded wait.
const VIDEO_SEEK_TIMEOUT_MS = 5_000;
const MEDIA_READY_FOR_CURRENT_FRAME = 2;

export interface MaterializedPreviewFrame {
  canvas: HTMLCanvasElement;
  presentation: PreviewScenePresentation;
}

export interface VideoPreviewFrameMaterializer {
  readonly canvas: HTMLCanvasElement;
  /** Returns completed pixels and their camera; this operation does not publish visible UI. */
  renderFrameWithPresentation(
    time: number,
    signal: AbortSignal,
    cameraOverride?: VideoCompositionCameraState
  ): Promise<MaterializedPreviewFrame>;
  /** Replaces composition only between frames; false requires a new resource owner. */
  updateProject(project: VideoProject): boolean;
  dispose(): void;
  renderFrame(
    time: number,
    signal: AbortSignal,
    cameraOverride?: VideoCompositionCameraState
  ): Promise<HTMLCanvasElement>;
}

interface VideoPreviewMaterializerState {
  disposed: boolean;
  playbackSampler: ReturnType<typeof createCompositionCutSampleSource> | null;
  playbackSamplerConversion: 'canvas' | 'native';
  gpuPreview: ReturnType<typeof createNativeGpuPreviewRenderer> | null;
  spatialRenderer: ReviewSpatialRenderer | null;
  stagingCanvas: HTMLCanvasElement | null;
  captionRenderer: ReturnType<typeof createVideoProjectCaptionRenderer>;
  cursorTrajectoryRenderer: ReturnType<typeof createRecordingCursorTrajectoryRenderer>;
  recordingEventsRenderer: ReturnType<typeof createRecordingEventsRenderer>;
  watermarkRenderer: ReturnType<typeof createVideoProjectWatermarkRenderer>;
  effectRuntime: ReturnType<typeof createVideoEditorEffectRuntime> | null;
  imageBank: Record<string, HTMLImageElement>;
  videoRefs: Record<string, HTMLVideoElement | null>;
  videoSlots: { assetId: string; src: string; video: HTMLVideoElement }[];
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Preview preparation was cancelled', 'AbortError');
}

function waitForImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (image.complete) {
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error('Preview media could not be decoded'));
  }
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
      MEDIA_LOAD_TIMEOUT_MS
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
      VIDEO_SEEK_TIMEOUT_MS
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

function materializerMediaIdentity(project: VideoProject): string {
  return JSON.stringify({
    id: project.id,
    assets: project.assets.map(({ id, type }) => ({ id, type })),
    videos: project.clips.filter(isVideoClip).map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      startTime: clip.startTime,
      duration: clip.duration,
      sourceStart: clip.sourceStart,
      sourceDuration: clip.sourceDuration,
      playbackRate: clip.playbackRate,
      playbackWindow: clip.playbackWindow,
      cameraTiming: clip.cameraTiming,
    })),
    headers: projectWindowHeaderImages(project),
  });
}

export function createVideoPreviewFrameMaterializer(params: {
  assetUrls: Record<string, string>;
  sampleFps?: number;
  previewRenderer?: VideoPreviewRenderer;
  ownerDocument: Document;
  project: VideoProject;
  rasterSize: VideoEditorPreviewRasterSize;
}): VideoPreviewFrameMaterializer {
  const mediaIdentity = materializerMediaIdentity(params.project);
  let busy = false;
  const joinPlans = resolveVideoProjectCompositionJoinPlans(params.project);
  const { canvas, stage } = createMaterializerSurface(params.ownerDocument, params.rasterSize);
  const state = createMaterializerMediaState(params);
  let presentation = joinPlans.length
    ? createMaterializedJoinPresentation(params, state, canvas, stage, joinPlans)
    : null;

  const renderFrameWithPresentation = async (
    time: number,
    signal: AbortSignal,
    cameraOverride?: VideoCompositionCameraState
  ): Promise<MaterializedPreviewFrame> => {
    if (busy) throw new Error('Composition frame is already being materialized.');
    busy = true;
    try {
      return await (presentation
        ? presentation.renderFrameWithPresentation(time, signal, cameraOverride)
        : renderMaterializedFrame(params, state, canvas, stage, time, signal, cameraOverride));
    } finally {
      busy = false;
    }
  };

  return {
    canvas,
    updateProject(project) {
      if (busy || state.disposed) return false;
      if (project === params.project) return true;
      if (materializerMediaIdentity(project) !== mediaIdentity) return false;
      params = { ...params, project };
      const plans = resolveVideoProjectCompositionJoinPlans(project);
      if (presentation && plans.length) presentation.updateProject(project, plans);
      else {
        presentation?.dispose();
        presentation = plans.length
          ? createMaterializedJoinPresentation(params, state, canvas, stage, plans)
          : null;
      }
      return true;
    },
    dispose: () => {
      presentation?.dispose();
      disposeMaterializer(state, stage);
    },
    async renderFrame(time, signal, cameraOverride) {
      return (await renderFrameWithPresentation(time, signal, cameraOverride)).canvas;
    },
    renderFrameWithPresentation,
  };
}

function createMaterializedJoinPresentation(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  state: VideoPreviewMaterializerState,
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
  plans: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>,
  sceneEdges: 'include' | 'omit' = 'include'
): Pick<VideoPreviewFrameMaterializer, 'dispose' | 'renderFrameWithPresentation'> & {
  updateProject(
    project: VideoProject,
    plans: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>
  ): void;
} {
  const resources = createPreviewRenderResources({
    maximumCanvases: 2,
    maximumManagedBytes: params.rasterSize.width * params.rasterSize.height * 8,
    createCanvas: () => params.ownerDocument.createElement('canvas'),
  });
  let cutSampler: ReturnType<typeof createCompositionCutSampleSource> | undefined;
  let cutSamplerConversion: 'canvas' | 'native' = 'canvas';
  let cutPlan: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>[number] | undefined;
  let cutPlans = plans.filter(({ boundary }) => boundary.sampling === 'cut');
  let nestedCuts: ReturnType<typeof createMaterializedJoinPresentation> | undefined;
  let disposed = false;
  let cameraOverride: VideoCompositionCameraState | undefined;
  let busy = false;
  const gpuComposer = createMaterializerGpuComposer(
    params.rasterSize,
    () => disposed || state.disposed,
    params.previewRenderer
  );
  const renderSample = async (time: number, signal: AbortSignal) => {
    if (!cutPlan) {
      if (resolveActiveVideoProjectCompositionJoinPlan(cutPlans, time)) {
        nestedCuts ??= createMaterializedJoinPresentation(
          params,
          state,
          canvas,
          stage,
          cutPlans,
          'omit'
        );
        return nestedCuts.renderFrameWithPresentation(time, signal, cameraOverride);
      }
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
    }
    const conversion = state.gpuPreview?.acceptsNativeFrames ? 'native' : 'canvas';
    if (cutSamplerConversion !== conversion) {
      cutSampler?.dispose();
      cutSampler = undefined;
      cutSamplerConversion = conversion;
    }
    cutSampler ??= createCompositionCutSampleSource({
      conversion,
      project: params.project,
      sourceUrl: (clip) => params.assetUrls[clip.assetId],
    });
    const source = cutSampler;
    try {
      const frames = await source.sample(
        time,
        signal,
        time < cutPlan.seam ? 'last' : 'first',
        params.project
      );
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
    compose: ({ context, outgoing, incoming, incomingWeight, sampling, signal }) => {
      const rect = { x: 0, y: 0, ...params.rasterSize };
      const inverse = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
      return gpuComposer.compose(
        context,
        [
          { source: outgoing, rect, inverse, opacity: sampling === 'cut' ? 1 : 1 - incomingWeight },
          {
            source: incoming,
            rect,
            inverse,
            opacity: incomingWeight,
            blend: sampling === 'cut' ? 'over' : 'add',
          },
        ],
        signal
      );
    },
    renderSample: async (time, signal) => ({
      canvas: (await renderSample(time, signal)).canvas,
      release() {},
    }),
  });
  return {
    updateProject(project, nextPlans) {
      params = { ...params, project };
      plans = nextPlans;
      cutPlans = plans.filter(({ boundary }) => boundary.sampling === 'cut');
      endpoints.clear();
      nestedCuts?.dispose();
      nestedCuts = undefined;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      endpoints.dispose();
      nestedCuts?.dispose();
      cutSampler?.dispose();
      resources.dispose();
      gpuComposer.dispose();
    },
    async renderFrameWithPresentation(
      time: number,
      signal: AbortSignal,
      nextCamera?: VideoCompositionCameraState
    ) {
      throwIfAborted(signal);
      if (disposed || state.disposed)
        throw new DOMException('Preview preparation was cancelled', 'AbortError');
      if (busy) throw new Error('Composition frame is already being materialized.');
      if (cameraOverride !== nextCamera) endpoints.clear();
      cameraOverride = nextCamera;
      busy = true;
      try {
        const plan = resolveActiveVideoProjectCompositionJoinPlan(plans, time);
        cutPlan = plan?.boundary.sampling === 'cut' ? plan : undefined;
        if (cutPlan || !plan) {
          nestedCuts?.dispose();
          nestedCuts = undefined;
        }
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
            cameraOverride,
            sceneEdges === 'omit' ? 'omit' : undefined
          );
        }
        const framePresentation: PreviewScenePresentation = {
          camera:
            cameraOverride ??
            resolveVideoCompositionFrame(
              await prepareMaterializerRenderProject(params.project, state, time, signal),
              time
            ).camera,
          time,
        };
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
        }
        throwIfAborted(signal);
        if (state.disposed)
          throw new DOMException('Preview preparation was cancelled', 'AbortError');
        const artwork = params.ownerDocument.createElement('canvas');
        artwork.width = params.rasterSize.width;
        artwork.height = params.rasterSize.height;
        try {
          const overlay = artwork.getContext('2d');
          if (!overlay) throw new Error('Composition edge artwork is unavailable.');
          if (plan.boundary.transition?.type !== 'dissolve')
            drawCompositionColorOverlay(
              overlay,
              blend.black,
              plan.boundary.transition?.color ?? '#000000'
            );
          if (sceneEdges !== 'omit')
            drawVideoProjectSceneEdges(
              overlay,
              params.project,
              time,
              undefined,
              params.sampleFps ?? params.project.fps
            );
          const rect = { x: 0, y: 0, ...params.rasterSize };
          const inverse = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
          const gpuComposed = await gpuComposer.compose(
            context,
            [
              { source: canvas, rect, inverse },
              { source: artwork, rect, inverse },
            ],
            signal
          );
          if (!gpuComposed) context.drawImage(artwork, 0, 0);
          framePresentation.renderer = gpuComposed
            ? { backend: 'gpu' }
            : {
                backend: 'legacy',
                ...(params.previewRenderer !== 'legacy'
                  ? { fallback: gpuComposer.fallbackReason }
                  : {}),
              };
        } finally {
          artwork.width = artwork.height = 0;
        }
        return { canvas, presentation: framePresentation };
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
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0]
): VideoPreviewMaterializerState {
  const state: VideoPreviewMaterializerState = {
    disposed: false,
    playbackSampler: null,
    playbackSamplerConversion: 'canvas',
    gpuPreview: params.previewRenderer === 'legacy' ? null : createNativeGpuPreviewRenderer(),
    spatialRenderer: null,
    stagingCanvas: null,
    captionRenderer: createVideoProjectCaptionRenderer(),
    cursorTrajectoryRenderer: createRecordingCursorTrajectoryRenderer(),
    recordingEventsRenderer: createRecordingEventsRenderer(),
    watermarkRenderer: createVideoProjectWatermarkRenderer(loadVideoEditorAssetBlob),
    effectRuntime: null,
    imageBank: {},
    videoRefs: {},
    videoSlots: [],
  };
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
  state.videoSlots.forEach(({ video }) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  });
  state.videoSlots = [];
  state.videoRefs = {};
  state.effectRuntime?.dispose();
  state.playbackSampler?.dispose();
  state.playbackSampler = null;
  state.gpuPreview?.dispose();
  state.captionRenderer.clear();
  state.cursorTrajectoryRenderer.clear();
  state.recordingEventsRenderer.clear();
  state.watermarkRenderer.clear();
  state.effectRuntime = null;
  stage.remove();
}

async function prepareMaterializerRenderProject(
  project: VideoProject,
  state: VideoPreviewMaterializerState,
  time: number,
  signal: AbortSignal
) {
  const eventsProject = await state.recordingEventsRenderer.prepare(
    project,
    { start: time, end: time },
    signal
  );
  signal.throwIfAborted();
  const renderProject = await state.cursorTrajectoryRenderer.prepare(eventsProject, time);
  signal.throwIfAborted();
  if (state.disposed) throw new DOMException('Preview preparation was cancelled', 'AbortError');
  return renderProject;
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
): Promise<MaterializedPreviewFrame> {
  const assertActive = () => {
    throwIfAborted(signal);
    if (state.disposed) throw new DOMException('Preview preparation was cancelled', 'AbortError');
  };
  let sampled:
    | Awaited<ReturnType<ReturnType<typeof createCompositionCutSampleSource>['sample']>>
    | undefined;
  try {
    assertActive();
    if (
      !decodedVideoFrames &&
      params.project.clips.some(
        (clip) => clip.type === 'VIDEO' && clip.playbackWindow && isClipActiveAtTime(clip, time)
      )
    ) {
      const conversion = state.gpuPreview?.acceptsNativeFrames ? 'native' : 'canvas';
      if (state.playbackSamplerConversion !== conversion) {
        state.playbackSampler?.dispose();
        state.playbackSampler = null;
        state.playbackSamplerConversion = conversion;
      }
      state.playbackSampler ??= createCompositionCutSampleSource({
        conversion,
        project: params.project,
        sourceUrl: (clip) => params.assetUrls[clip.assetId],
      });
      sampled = await state.playbackSampler.sample(time, signal, 'last', params.project);
      decodedVideoFrames = sampled.media;
    }
    assertActive();
    if (!decodedVideoFrames) await prepareMaterializedVideos(params, state, stage, time, signal);
    else state.videoRefs = {};
    assertActive();
    const renderProject = await prepareMaterializerRenderProject(
      params.project,
      state,
      time,
      signal
    );
    assertActive();
    const drawn = await renderPreviewScene({
      previewRenderer: params.previewRenderer ?? 'gpu',
      ...(state.gpuPreview ? { gpuPreview: state.gpuPreview } : {}),
      sampleFps: params.sampleFps ?? params.project.fps,
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
        const renderer: ReviewSpatialRenderer = createReviewSpatialSession(() => {
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
          renderer: params.previewRenderer ?? 'gpu',
        });
        return state.effectRuntime.executor;
      },
      imageBank: state.imageBank,
      prepareImages: (frames) => prepareMaterializedImages(state.imageBank, frames, signal),
      previewRasterSize: params.rasterSize,
      project: renderProject,
      signal,
      stage,
      videoRefs: { current: state.videoRefs },
      ...(decodedVideoFrames ? { decodedVideoFrames } : {}),
    });
    assertActive();
    if (!drawn) throw new Error('Preview frame is unavailable.');
    return { canvas, presentation: drawn };
  } catch (error) {
    state.playbackSampler?.dispose();
    state.playbackSampler = null;
    throw error;
  } finally {
    sampled?.release();
  }
}

async function prepareMaterializedVideos(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  state: VideoPreviewMaterializerState,
  stage: HTMLDivElement,
  time: number,
  signal: AbortSignal
): Promise<void> {
  const project = params.project;
  const activeVideos = project.clips
    .filter(isVideoClip)
    .filter((clip) => isClipActiveAtTime(clip, time) && hasCameraMediaAt(project, clip, time));
  const sources = activeVideos.map((clip) => {
    const src = params.assetUrls[clip.assetId];
    if (!src) throw new Error(`Preview video source is unavailable for clip ${clip.id}`);
    return { clip, src };
  });
  const used = new Set<HTMLVideoElement>();
  const refs: VideoPreviewMaterializerState['videoRefs'] = {};
  // Reserve surviving clips before new clips can reuse their source slots.
  for (const { clip, src } of sources) {
    const prior = state.videoRefs[clip.id];
    const slot = state.videoSlots.find(
      (entry) => entry.video === prior && entry.assetId === clip.assetId && entry.src === src
    );
    if (slot) {
      refs[clip.id] = slot.video;
      used.add(slot.video);
    }
  }
  for (const { clip, src } of sources) {
    if (refs[clip.id]) continue;
    let slot =
      state.videoSlots.find(
        (entry) => !used.has(entry.video) && entry.assetId === clip.assetId && entry.src === src
      ) ?? state.videoSlots.find((entry) => !used.has(entry.video));
    if (!slot) {
      const video = params.ownerDocument.createElement('video');
      Object.assign(video, { defaultMuted: true, muted: true, playsInline: true, preload: 'auto' });
      video.style.cssText = 'position:absolute;width:1px;height:1px;pointer-events:none';
      stage.append(video);
      slot = { assetId: clip.assetId, src, video };
      video.src = src;
      state.videoSlots.push(slot);
    } else if (slot.src !== src) {
      slot.video.pause();
      slot.video.src = src;
    }
    slot.assetId = clip.assetId;
    slot.src = src;
    refs[clip.id] = slot.video;
    used.add(slot.video);
  }
  state.videoRefs = refs;
  for (const { clip } of sources) {
    throwIfAborted(signal);
    if (state.disposed) throw new DOMException('Preview preparation was cancelled', 'AbortError');
    const video = refs[clip.id]!;
    video.pause();
    await waitForDecodedVideoFrame(video, getVideoClipSourceTime(clip, time), project.fps, signal);
  }
}

async function prepareMaterializedImages(
  imageBank: Record<string, HTMLImageElement>,
  frames: readonly VideoCompositionFrame[],
  signal: AbortSignal
): Promise<void> {
  const keys = new Set<string>();
  for (const frame of frames) {
    for (const layer of [...frame.visualLayers, ...frame.effectInputLayers]) {
      if (layer.kind === 'image') keys.add(layer.clip.assetId);
      if (layer.kind === 'shape' && layer.clip.embeddedAsset)
        keys.add(layer.clip.embeddedAsset.assetId);
      if (
        (layer.kind === 'image' || (layer.kind === 'video' && layer.trackRole !== 'CAMERA')) &&
        layer.clip.windowHeader
      )
        keys.add(windowHeaderImageKey(layer.clipId, layer.clip.windowHeader));
    }
  }
  await Promise.all(
    [...keys].map((key) => {
      const image = imageBank[key];
      return image ? waitForImage(image, signal) : undefined;
    })
  );
}
