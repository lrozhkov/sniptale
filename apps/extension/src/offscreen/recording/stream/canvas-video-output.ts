import { applyVideoTrackContentHint } from '../../../platform/media-utils/video-recording';
import { startVideoFramePump } from './frame-pump';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'OffscreenCanvasVideoOutput' });

type CanvasVideoOutputDrawing = {
  drawHeldFrame?: () => boolean;
  drawLiveFrame: () => boolean;
};

type CanvasVideoOutputParams = {
  audioTracks?: MediaStreamTrack[];
  contentHint?: 'detail' | 'motion';
  dimensions: { height: number; width: number };
  frameRate: number;
  initializeDrawing: (surface: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  }) => CanvasVideoOutputDrawing;
  release: () => void;
  sourceVideo?: HTMLVideoElement;
};

type RequestFrameTrack = MediaStreamTrack & { requestFrame?: () => void };

function createCanvasSurface(dimensions: { height: number; width: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Fixed video output canvas context is not available');
  return { canvas, context };
}

function requireCanvasVideoTrack(stream: MediaStream): MediaStreamTrack {
  const [track] = stream.getVideoTracks();
  if (!track) throw new Error('Fixed video output stream returned no video track');
  return track;
}

export function createCanvasVideoOutput(params: CanvasVideoOutputParams): MediaStream {
  let canvasTrack: MediaStreamTrack | null = null;
  let stopFramePump: (() => void) | null = null;
  const startedAt = performance.now();
  let emittedFrames = 0;
  try {
    const surface = createCanvasSurface(params.dimensions);
    const drawing = params.initializeDrawing(surface);
    const output = surface.canvas.captureStream(0);
    canvasTrack = requireCanvasVideoTrack(output);
    const requestFrame = (canvasTrack as RequestFrameTrack).requestFrame;
    if (typeof requestFrame !== 'function') {
      throw new Error('Canvas video output track does not support explicit frame requests');
    }
    params.audioTracks?.forEach((track) => output.addTrack(track));
    applyVideoTrackContentHint(canvasTrack, params.contentHint ?? 'detail');
    const emitFrame = () => {
      requestFrame.call(canvasTrack);
      emittedFrames += 1;
    };
    if (drawing.drawLiveFrame()) emitFrame();
    stopFramePump = startVideoFramePump({
      ...(drawing.drawHeldFrame === undefined ? {} : { drawHeldFrame: drawing.drawHeldFrame }),
      drawLiveFrame: drawing.drawLiveFrame,
      frameRate: params.frameRate,
      onFrameDrawn: emitFrame,
      ...(params.sourceVideo ? { sourceVideo: params.sourceVideo } : {}),
    });
    const stopCanvasTrack = canvasTrack.stop.bind(canvasTrack);
    let stopped = false;
    canvasTrack.stop = () => {
      if (stopped) return;
      stopped = true;
      stopFramePump?.();
      stopFramePump = null;
      const elapsedMs = Math.max(0, performance.now() - startedAt);
      logger.debug('Stopped canvas video output', {
        effectiveFrameRate: elapsedMs > 0 ? (emittedFrames * 1000) / elapsedMs : 0,
        elapsedMs,
        emittedFrames,
        requestedFrameRate: params.frameRate,
        scheduler: params.sourceVideo ? 'source-video-frame' : 'compensated-timer',
      });
      params.release();
      stopCanvasTrack();
    };
    return output;
  } catch (error) {
    stopFramePump?.();
    params.release();
    canvasTrack?.stop();
    throw error;
  }
}
