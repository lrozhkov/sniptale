import type {
  QuickEditWebcam,
  QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  drawReviewWebcam,
  inspectReviewWebcamFrameDuration,
} from '../../workflows/video-review/render-webcam';
import { createReviewWebcamPlayback } from './webcam-playback';

type PreviewView = {
  canvas: HTMLCanvasElement | null;
  output: { width: number; height: number };
  settings: QuickEditWebcam;
  placement: QuickEditWebcamPlacement | undefined;
};
type PreviewEvents = {
  ready(visible: boolean): void;
  loaded(duration: number): void;
  failed(): void;
};

/** Owns private bytes, Blob URL, one native decoder and all playback cleanup for a mounted preview. */
export function mountReviewWebcamPreview(
  main: HTMLVideoElement,
  assetId: string,
  view: () => PreviewView,
  events: PreviewEvents
) {
  let disposed = false;
  const abort = new AbortController();
  let frameDuration = 1 / 30;
  let url: string | null = null;
  let stop: (() => void) | undefined;
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const paint = createWebcamPainter(video, view, events);
  const fail = () => {
    if (!disposed) events.failed();
  };
  const loaded = () => {
    if (disposed) return;
    if (
      ![video.duration, video.videoWidth, video.videoHeight].every(
        (value) => Number.isFinite(value) && value > 0
      )
    ) {
      fail();
      return;
    }
    events.loaded(video.duration);
    stop?.();
    stop = createReviewWebcamPlayback({
      main,
      camera: video,
      frameDuration,
      settings: () => view().settings,
      failed: fail,
      paint: (frame) => {
        if (!disposed) paint(frame);
      },
    });
  };
  video.addEventListener('loadedmetadata', loaded);
  video.addEventListener('error', fail);
  void resolveReviewAssetBytes(assetId)
    .then(async (blob) => {
      if (disposed) return;
      if (!blob) {
        fail();
        return;
      }
      frameDuration = await inspectReviewWebcamFrameDuration(blob, abort.signal);
      if (disposed) return;
      url = URL.createObjectURL(blob);
      video.src = url;
      video.load();
    })
    .catch(fail);
  return () => {
    disposed = true;
    abort.abort();
    stop?.();
    video.removeEventListener('loadedmetadata', loaded);
    video.removeEventListener('error', fail);
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (url) URL.revokeObjectURL(url);
  };
}

/** Cache only identical paused paints; authored settings and geometry invalidate the raster. */
function createWebcamPainter(
  video: HTMLVideoElement,
  view: () => PreviewView,
  events: PreviewEvents
): Parameters<typeof createReviewWebcamPlayback>[0]['paint'] {
  let paintedKey: string | null = null;
  let paintedSettings: QuickEditWebcam | null = null;
  return (frame) => {
    const current = view();
    const target = current.canvas;
    if (!target) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(current.output.width * scale));
    const height = Math.max(1, Math.round(current.output.height * scale));
    const placement = current.placement ?? frame?.placement;
    const key = [
      width,
      height,
      frame?.time,
      placement?.x,
      placement?.y,
      placement?.width,
      placement?.height,
    ].join(':');
    if (paintedKey === key && paintedSettings === current.settings) return;
    paintedKey = key;
    paintedSettings = current.settings;
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const context = target.getContext('2d');
    if (!context) {
      events.failed();
      return;
    }
    context.clearRect(0, 0, width, height);
    events.ready(!!frame);
    if (frame)
      drawReviewWebcam(
        context,
        { width, height },
        current.settings,
        current.placement ?? frame.placement,
        { width: video.videoWidth, height: video.videoHeight },
        { draw: (context, x, y, width, height) => context.drawImage(video, x, y, width, height) }
      );
  };
}
