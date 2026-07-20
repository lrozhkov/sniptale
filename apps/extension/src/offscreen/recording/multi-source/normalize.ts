import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { resolveRecordingSafeSize } from '../dimensions';
import {
  createRecordingVideoElement,
  waitForVideoReady,
  wrapCanvasTrackStop,
} from '../stream/viewport/video';

type NormalizedMultiSourceVideoStream = {
  dimensions: { height: number; width: number };
  stream: MediaStream;
};

type FrameRequestTrack = Pick<MediaStreamTrack, 'stop'> & {
  requestFrame?: () => void;
};

type CanvasCapture = {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
};

function getFrameRate(quality: VideoRecordingSettings['quality']): number {
  return (VIDEO_QUALITY_CONFIGS[quality] || VIDEO_QUALITY_CONFIGS[VideoQuality.HIGH]).frameRate;
}

function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}

function fillCanvasBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function createFrameDrawer(params: {
  canvas: HTMLCanvasElement;
  canvasVideoTrack: MediaStreamTrack | undefined;
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
}): () => void {
  return () => {
    fillCanvasBackground(params.ctx, params.canvas);
    params.ctx.drawImage(params.video, 0, 0);
    (params.canvasVideoTrack as FrameRequestTrack | undefined)?.requestFrame?.();
  };
}

function startFixedFramePump(frameRate: number, drawFrame: () => void): () => void {
  const intervalMs = Math.max(16, Math.round(1000 / frameRate));
  const timer = window.setInterval(drawFrame, intervalMs);
  return () => window.clearInterval(timer);
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function requireCanvasVideoTrack(stream: MediaStream): MediaStreamTrack {
  const [track] = stream.getVideoTracks();
  if (!track) {
    throw new Error('Multi-source canvas stream returned no video track');
  }

  return track;
}

function createCanvasCapture(canvas: HTMLCanvasElement, frameRate: number): CanvasCapture {
  const manualStream = canvas.captureStream(0);
  const manualTrack = requireCanvasVideoTrack(manualStream);
  if (typeof (manualTrack as FrameRequestTrack).requestFrame === 'function') {
    return { stream: manualStream, videoTrack: manualTrack };
  }

  stopStreamTracks(manualStream);
  const timedStream = canvas.captureStream(frameRate);
  return { stream: timedStream, videoTrack: requireCanvasVideoTrack(timedStream) };
}

export async function normalizeMultiSourceVideoStream(
  sourceStream: MediaStream,
  quality: VideoRecordingSettings['quality']
): Promise<NormalizedMultiSourceVideoStream> {
  const video = createRecordingVideoElement(sourceStream);
  try {
    await waitForVideoReady(
      video,
      'Multi-source video ready timeout',
      'Multi-source video load error'
    );

    const dimensions = resolveRecordingSafeSize({
      height: video.videoHeight,
      width: video.videoWidth,
    });
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Multi-source canvas context is not available');
    }
    const frameRate = getFrameRate(quality);
    const { stream: normalizedStream, videoTrack: canvasVideoTrack } = createCanvasCapture(
      canvas,
      frameRate
    );
    const drawFrame = createFrameDrawer({ canvas, canvasVideoTrack, ctx, video });
    drawFrame();
    const stopFrameLoop = startFixedFramePump(frameRate, drawFrame);

    wrapCanvasTrackStop(canvasVideoTrack, () => {
      stopFrameLoop();
      releaseVideo(video);
      stopStreamTracks(sourceStream);
    });

    return { dimensions, stream: normalizedStream };
  } catch (error) {
    releaseVideo(video);
    stopStreamTracks(sourceStream);
    throw error;
  }
}
