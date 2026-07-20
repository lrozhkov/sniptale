import {
  getVideoClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../features/video/project/timeline';
import type { VideoProject } from '../../../features/video/project/types';
import { createVideoEditorEffectRuntime } from '../../runtime/effect-runtime';
import { renderPreviewScene } from '../stage/scene/render-preview';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';

const FRAME_SOURCE_TIMEOUT_MS = 2_000;
const MEDIA_READY_FOR_CURRENT_FRAME = 2;

export interface VideoPreviewFrameMaterializer {
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
  renderFrame(time: number, signal: AbortSignal): Promise<HTMLCanvasElement>;
}

interface VideoPreviewMaterializerState {
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
  ownerDocument: Document;
  project: VideoProject;
  rasterSize: VideoEditorPreviewRasterSize;
}): VideoPreviewFrameMaterializer {
  const { canvas, stage } = createMaterializerSurface(params.ownerDocument, params.rasterSize);
  const state = createMaterializerMediaState(params, stage);

  return {
    canvas,
    dispose: () => disposeMaterializer(state, stage),
    renderFrame: (time, signal) =>
      renderMaterializedFrame(params, state, canvas, stage, time, signal),
  };
}

function createMaterializerMediaState(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  stage: HTMLDivElement
): VideoPreviewMaterializerState {
  const state: VideoPreviewMaterializerState = {
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
  return state;
}

function disposeMaterializer(state: VideoPreviewMaterializerState, stage: HTMLDivElement): void {
  Object.values(state.videoRefs).forEach((video) => {
    video?.pause();
    video?.removeAttribute('src');
    video?.load();
    video?.remove();
  });
  state.effectRuntime?.dispose();
  state.effectRuntime = null;
  stage.remove();
}

async function renderMaterializedFrame(
  params: Parameters<typeof createVideoPreviewFrameMaterializer>[0],
  state: VideoPreviewMaterializerState,
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
  time: number,
  signal: AbortSignal
): Promise<HTMLCanvasElement> {
  throwIfAborted(signal);
  await Promise.all(Object.values(state.imageBank).map((image) => waitForImage(image, signal)));
  await prepareMaterializedVideos(params.project, state.videoRefs, time, signal);
  await renderPreviewScene({
    canvas,
    currentTime: time,
    effectRuntimeExecutor: () => {
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
  });
  throwIfAborted(signal);
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
    .filter((clip) => isClipActiveAtTime(clip, time));
  for (const clip of activeVideos) {
    const video = videoRefs[clip.id];
    if (!video) throw new Error(`Preview video source is unavailable for clip ${clip.id}`);
    video.pause();
    await waitForDecodedVideoFrame(video, getVideoClipSourceTime(clip, time), project.fps, signal);
  }
}
