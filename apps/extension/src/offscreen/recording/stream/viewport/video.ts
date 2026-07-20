import { createLogger } from '@sniptale/platform/observability/logger';
import { createFramePacer } from './helpers';

const logger = createLogger({ namespace: 'OffscreenViewportVideo' });

type FrameLoopVideo = Pick<
  HTMLVideoElement,
  'requestVideoFrameCallback' | 'cancelVideoFrameCallback'
>;

export function createRecordingVideoElement(sourceStream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.autoplay = true;
  video.srcObject = sourceStream;
  video.muted = true;
  video.playsInline = true;
  return video;
}

export async function waitForVideoReady(
  video: Pick<HTMLVideoElement, 'oncanplay' | 'onerror' | 'onloadeddata' | 'play'>,
  timeoutMessage: string,
  errorMessage: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, 10000);

    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      video.onloadeddata = null;
      video.oncanplay = null;
      video.onerror = null;
      callback();
    };

    video.onloadeddata = () => finish(resolve);
    video.oncanplay = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error(errorMessage)));
    void video.play().catch((error) => {
      logger.debug('Recording viewport video play() rejected before readiness', error);
    });
  });
}

export function wrapCanvasTrackStop(
  videoTrack: Pick<MediaStreamTrack, 'stop'> | undefined,
  onStop: () => void
): void {
  if (!videoTrack) {
    return;
  }

  const originalStop = videoTrack.stop.bind(videoTrack);
  videoTrack.stop = () => {
    onStop();
    originalStop();
  };
}

export function startCanvasBackedFrameLoop(frameRate: number, drawFrame: () => void): () => void {
  const normalizedFrameRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30;
  const intervalMs = Math.max(1, Math.round(1000 / normalizedFrameRate));
  const timer = window.setInterval(drawFrame, intervalMs);

  return () => {
    window.clearInterval(timer);
  };
}

function startVideoFrameCallbackLoop(
  video: FrameLoopVideo,
  frameRate: number,
  drawFrame: () => void
): (() => void) | null {
  if (
    typeof video.requestVideoFrameCallback !== 'function' ||
    typeof video.cancelVideoFrameCallback !== 'function'
  ) {
    return null;
  }

  const pacer = createFramePacer(frameRate);
  let isRunning = true;
  let callbackId = 0;

  const render = (nowMs: number) => {
    if (!isRunning) {
      return;
    }

    if (pacer.shouldRender(nowMs)) {
      drawFrame();
    }

    callbackId = video.requestVideoFrameCallback(render);
  };

  callbackId = video.requestVideoFrameCallback(render);

  return () => {
    isRunning = false;
    video.cancelVideoFrameCallback(callbackId);
  };
}

export function startVideoBackedFrameLoop(
  video: FrameLoopVideo,
  frameRate: number,
  drawFrame: () => void
): () => void {
  return (
    startVideoFrameCallbackLoop(video, frameRate, drawFrame) ??
    startCanvasBackedFrameLoop(frameRate, drawFrame)
  );
}
