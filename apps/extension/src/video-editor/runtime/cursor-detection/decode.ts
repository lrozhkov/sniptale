import type { VideoCursorDetectionFrame } from './visual-track';
import type { VideoProjectAsset } from '../../../features/video/project/types/index';
import { CURSOR_DETECTION_MAX_ANALYSIS_WIDTH } from './model/analysis';

export interface CursorDetectionDecodeResult {
  height: number;
  width: number;
}

export async function decodeDetectionFrames(params: {
  asset: VideoProjectAsset;
  assetUrl: string;
  onFrame: (frame: VideoCursorDetectionFrame) => void;
  onProgress: (processedFrames: number) => void;
  samplingPlan: { projectTime: number; sourceTime: number }[];
  signal: AbortSignal;
}): Promise<CursorDetectionDecodeResult> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = params.assetUrl;
  let canvas: HTMLCanvasElement | null = null;

  try {
    await waitForVideoEvent(video, 'loadedmetadata', params.signal);
    canvas = document.createElement('canvas');
    const size = resolveAnalysisCanvasSize(params.asset, video);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Canvas 2D context is not available.');
    }

    for (const [index, sample] of params.samplingPlan.entries()) {
      throwIfAborted(params.signal);
      video.currentTime = sample.sourceTime;
      await waitForVideoEvent(video, 'seeked', params.signal);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      params.onFrame({
        data: context.getImageData(0, 0, canvas.width, canvas.height).data,
        height: canvas.height,
        time: sample.projectTime,
        width: canvas.width,
      });
      params.onProgress(index + 1);
      await yieldToBrowser(params.signal);
    }
    return size;
  } finally {
    cleanupDetectionMedia(video, canvas);
  }
}

function resolveAnalysisCanvasSize(
  asset: VideoProjectAsset,
  video: HTMLVideoElement
): CursorDetectionDecodeResult {
  const sourceWidth = Math.max(1, asset.metadata.width || video.videoWidth);
  const sourceHeight = Math.max(1, asset.metadata.height || video.videoHeight);
  const scale = Math.min(1, CURSOR_DETECTION_MAX_ANALYSIS_WIDTH / sourceWidth);
  return {
    height: Math.max(1, Math.round(sourceHeight * scale)),
    width: Math.max(1, Math.round(sourceWidth * scale)),
  };
}

function cleanupDetectionMedia(video: HTMLVideoElement, canvas: HTMLCanvasElement | null): void {
  video.removeAttribute('src');
  video.load();
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Cursor detection was cancelled.', 'AbortError');
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Cursor detection was cancelled.', 'AbortError'));
    };
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Unable to decode video frame for cursor detection.'));
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function yieldToBrowser(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      throwIfAborted(signal);
      resolve();
    }, 0);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Cursor detection was cancelled.', 'AbortError'));
      },
      { once: true }
    );
  });
}
