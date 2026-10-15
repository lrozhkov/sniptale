import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { quickEditWebcamFrameAt } from '../../features/video/review/advanced/webcam';
import type {
  QuickEditWebcam,
  QuickEditWebcamPlacement,
} from '../../features/video/review/advanced/webcam';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  drawReviewWebcam,
  inspectReviewWebcamFrameDuration,
} from '../../workflows/video-review/render-webcam';
import { createReviewWebcamPlayback, type ReviewWebcamAdmission } from './webcam-playback';

type PreviewView = {
  canvas: HTMLCanvasElement | null;
  output: { width: number; height: number };
  settings: QuickEditWebcam;
  placement: QuickEditWebcamPlacement | undefined;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
};
type PreviewEvents = {
  ready(visible: boolean): void;
  loaded(duration: number): void;
  failed(): void;
};

/** Immutable admitted camera pixels; the synchronous render caller releases its lease. */
export interface ReviewWebcamFrameLease {
  allocationBytes: number;
  representedMediaTime: number;
  generation: number;
  source: { width: number; height: number };
  placement: QuickEditWebcamPlacement;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
  drawable: {
    draw(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number
    ): void;
  };
  release(): void;
}

type CaptureRequest = {
  generation?: number;
  placement?: QuickEditWebcamPlacement | undefined;
  crop?: Pick<QuickEditWebcam['appearance'], 'zoom' | 'panX' | 'panY'> | undefined;
};
type CaptureResult =
  | { status: 'ready'; frame: ReviewWebcamFrameLease }
  | { status: 'unavailable' | 'failed' };
type RetainedFrame = { frame: VideoFrame; bytes: number; generation: number; release(): void };

/** Owns one decoder; manual admission never invokes the hybrid canvas painter. */
export function createReviewWebcamPreviewSource(
  main: HTMLVideoElement,
  assetId: string,
  settings: () => QuickEditWebcam,
  events: PreviewEvents
) {
  return createWebcamSource(main, assetId, settings, events);
}

/** Preserves the existing hybrid mounting contract without immutable-frame allocation. */
export function mountReviewWebcamPreview(
  main: HTMLVideoElement,
  assetId: string,
  view: () => PreviewView,
  events: PreviewEvents
) {
  const source = createWebcamSource(main, assetId, () => view().settings, events, view);
  return source.dispose;
}

function createWebcamSource(
  main: HTMLVideoElement,
  assetId: string,
  settings: () => QuickEditWebcam,
  events: PreviewEvents,
  hybridView?: () => PreviewView
) {
  let disposed = false;
  const abort = new AbortController();
  let frameDuration = 1 / 30;
  let url: string | null = null;
  let stop: (() => void) | undefined;
  const listeners = new Set<(frame: ReviewWebcamAdmission | null) => void>();
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const paint = hybridView ? createWebcamPainter(video, hybridView, events) : undefined;
  const publish = (frame: ReviewWebcamAdmission | null) => {
    if (disposed) return;
    capture.accept(frame);
    if (paint) paint(frame);
    else events.ready(!!frame);
    for (const listener of listeners) listener(frame);
  };
  const fail = () => {
    if (!disposed) {
      publish(null);
      events.failed();
    }
  };
  const capture = createWebcamCapture(main, video, settings, fail);
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
    if (capture.current()) publish(null);
    stop = createReviewWebcamPlayback({
      main,
      camera: video,
      frameDuration,
      settings,
      failed: fail,
      paint: publish,
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

  return {
    captureAccepted: capture.captureAccepted,
    subscribeAdmission(listener: (frame: ReviewWebcamAdmission | null) => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(capture.current());
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      stop?.();
      capture.dispose();
      listeners.clear();
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', fail);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

/** Owns immutable admission retention independently of URL and decoder acquisition. */
function createWebcamCapture(
  main: HTMLVideoElement,
  video: HTMLVideoElement,
  settings: () => QuickEditWebcam,
  fail: () => void
) {
  let disposed = false;
  let admission: ReviewWebcamAdmission | null = null;
  let acceptedSettings: QuickEditWebcam | null = null;
  let retained: RetainedFrame | null = null;
  const clearRetained = () => {
    retained?.release();
    retained = null;
  };
  const captureAccepted = (request: CaptureRequest, resources: RenderResources): CaptureResult => {
    const accepted = admission;
    const currentSettings = settings();
    const mapped = quickEditWebcamFrameAt(currentSettings, main.currentTime, video.duration);
    if (
      disposed ||
      !accepted ||
      !mapped ||
      main.seeking ||
      acceptedSettings !== currentSettings ||
      (request.generation !== undefined && request.generation !== accepted.generation)
    ) {
      clearRetained();
      return { status: 'unavailable' };
    }
    const { tolerance, ready, bridge } = webcamAdmissionTiming(main, video, accepted, mapped.time);
    if (!ready && !bridge) {
      clearRetained();
      return { status: 'unavailable' };
    }
    try {
      if (
        ready &&
        (!retained ||
          retained.generation !== accepted.generation ||
          Math.abs(retained.frame.timestamp / 1e6 - accepted.representedMediaTime) > 0.000001)
      ) {
        clearRetained();
        retained = retainWebcamFrame(video, accepted, tolerance, resources);
        if (!retained) return { status: 'unavailable' };
      }
      if (!retained) return { status: 'unavailable' };
      return cloneWebcamFrame(retained, accepted, request, mapped, resources);
    } catch {
      fail();
      return { status: 'failed' };
    }
  };
  return {
    captureAccepted,
    current: () => admission,
    accept(frame: ReviewWebcamAdmission | null) {
      if (!frame || frame.generation !== admission?.generation || acceptedSettings !== settings())
        clearRetained();
      admission = frame;
      acceptedSettings = frame ? settings() : null;
    },
    dispose() {
      disposed = true;
      admission = null;
      clearRetained();
    },
  };
}

/** Admission remains decoded-time strict; only a bounded running frame may bridge jitter. */
function webcamAdmissionTiming(
  main: HTMLVideoElement,
  video: HTMLVideoElement,
  accepted: ReviewWebcamAdmission,
  mappedTime: number
) {
  const tolerance = accepted.tolerance * (main.paused ? 1 : Math.max(1, main.playbackRate));
  const ready =
    Math.abs(mappedTime - accepted.representedMediaTime) <= tolerance &&
    !video.seeking &&
    video.readyState >= 2;
  const bridge =
    !main.paused &&
    !main.ended &&
    performance.now() - accepted.acceptedAt <= 250 &&
    mappedTime >= accepted.time &&
    mappedTime - accepted.time <= 0.25 * Math.max(1, main.playbackRate);
  return { tolerance, ready, bridge };
}

/** Captures and admits one immutable decoded frame; failed admission closes temporary storage. */
function retainWebcamFrame(
  video: HTMLVideoElement,
  accepted: ReviewWebcamAdmission,
  tolerance: number,
  resources: RenderResources
): RetainedFrame | null {
  const frame = new VideoFrame(video);
  let bytes: number;
  let reservation: { release(): void };
  try {
    bytes = frame.allocationSize();
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Invalid webcam allocation');
    if (
      !Number.isFinite(frame.timestamp) ||
      Math.abs(frame.timestamp / 1e6 - accepted.representedMediaTime) > tolerance
    ) {
      frame.close();
      return null;
    }
    // Construction is temporary decoder/browser storage; retain only after ledger admission.
    reservation = resources.bytes('webcam.retained', bytes);
  } catch (error) {
    frame.close();
    throw error;
  }
  let released = false;
  return {
    frame,
    bytes,
    generation: accepted.generation,
    release: () => {
      if (released) return;
      released = true;
      frame.close();
      reservation.release();
    },
  };
}

/** Each consumer owns an independent clone and its matching active-byte reservation. */
function cloneWebcamFrame(
  retained: RetainedFrame,
  accepted: ReviewWebcamAdmission,
  request: CaptureRequest,
  mapped: NonNullable<ReturnType<typeof quickEditWebcamFrameAt>>,
  resources: RenderResources
): CaptureResult {
  const reservation = resources.bytes('webcam.active', retained.bytes);
  let frame: VideoFrame;
  try {
    frame = retained.frame.clone();
  } catch (error) {
    reservation.release();
    throw error;
  }
  let released = false;
  return {
    status: 'ready',
    frame: {
      allocationBytes: retained.bytes,
      representedMediaTime: frame.timestamp / 1e6,
      generation: accepted.generation,
      source: { width: frame.displayWidth, height: frame.displayHeight },
      placement: request.placement ?? mapped.placement,
      crop: request.crop ?? mapped.crop,
      drawable: {
        draw: (context, x, y, width, height) => context.drawImage(frame, x, y, width, height),
      },
      release: () => {
        if (released) return;
        released = true;
        frame.close();
        reservation.release();
      },
    },
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
      current.crop?.zoom ?? frame?.crop?.zoom,
      current.crop?.panX ?? frame?.crop?.panX,
      current.crop?.panY ?? frame?.crop?.panY,
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
        { draw: (context, x, y, width, height) => context.drawImage(video, x, y, width, height) },
        current.crop ?? frame.crop
      );
  };
}
