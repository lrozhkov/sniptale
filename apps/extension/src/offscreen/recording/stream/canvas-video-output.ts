import { applyVideoTrackContentHint } from '../../../platform/media-utils/video-recording';
import { startVideoFramePump } from './frame-pump';

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
};

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
  try {
    const surface = createCanvasSurface(params.dimensions);
    const drawing = params.initializeDrawing(surface);
    const output = surface.canvas.captureStream(params.frameRate);
    canvasTrack = requireCanvasVideoTrack(output);
    params.audioTracks?.forEach((track) => output.addTrack(track));
    applyVideoTrackContentHint(canvasTrack, params.contentHint ?? 'detail');
    drawing.drawLiveFrame();
    stopFramePump = startVideoFramePump({
      ...(drawing.drawHeldFrame === undefined ? {} : { drawHeldFrame: drawing.drawHeldFrame }),
      drawLiveFrame: drawing.drawLiveFrame,
      frameRate: params.frameRate,
    });
    const stopCanvasTrack = canvasTrack.stop.bind(canvasTrack);
    let stopped = false;
    canvasTrack.stop = () => {
      if (stopped) return;
      stopped = true;
      stopFramePump?.();
      stopFramePump = null;
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
