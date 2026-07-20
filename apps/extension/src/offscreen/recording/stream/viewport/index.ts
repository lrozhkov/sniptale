import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  createViewportPresetCanvas,
  createViewportPresetCropUpdater,
  createViewportPresetDrawStateUpdater,
  createViewportPresetFrameDrawer,
} from './runtime';
import { resolveCanvasCropGeometry } from './helpers';
import {
  createRecordingVideoElement,
  startCanvasBackedFrameLoop,
  waitForVideoReady,
  wrapCanvasTrackStop,
} from './video';

export type ViewportCropUpdater =
  | ((params: {
      targetResolution?: { width: number; height: number };
      viewportSizeInPixels?: { width: number; height: number };
    }) => void)
  | null;
export type ViewportDrawStateUpdater =
  | ((params: { frozen: boolean; navigationEpoch: number }) => void)
  | null;

type FrameRequestTrack = Pick<MediaStreamTrack, 'stop'> & {
  requestFrame?: () => void;
};

function addAudioTracks(targetStream: MediaStream, sourceStream: MediaStream): void {
  sourceStream.getAudioTracks().forEach((track) => targetStream.addTrack(track));
}

function assertVideoHasDimensions(video: HTMLVideoElement, errorPrefix: string): void {
  if (video.videoWidth !== 0 && video.videoHeight !== 0) {
    return;
  }

  throw new Error(`${errorPrefix}: ${video.videoWidth}x${video.videoHeight}`);
}

function requestCanvasFrame(videoTrack: MediaStreamTrack | undefined): void {
  (videoTrack as FrameRequestTrack | undefined)?.requestFrame?.();
}

function createFrameRequestingDrawer(
  drawFrame: () => void,
  videoTrack: MediaStreamTrack | undefined
): () => void {
  return () => {
    drawFrame();
    requestCanvasFrame(videoTrack);
  };
}

function createCanvasStreamWithAudio(params: {
  canvas: HTMLCanvasElement;
  quality: VideoQuality;
  sourceStream: MediaStream;
}) {
  const frameRate = (
    VIDEO_QUALITY_CONFIGS[params.quality] || VIDEO_QUALITY_CONFIGS[VideoQuality.HIGH]
  ).frameRate;
  const stream = createCanvasVideoStream(params.canvas, frameRate);
  addAudioTracks(stream, params.sourceStream);
  return { frameRate, stream, videoTrack: stream.getVideoTracks()[0] };
}

function createCanvasVideoStream(canvas: HTMLCanvasElement, frameRate: number): MediaStream {
  const manualStream = canvas.captureStream(0);
  const manualTrack = manualStream.getVideoTracks()[0] as FrameRequestTrack | undefined;
  if (typeof manualTrack?.requestFrame === 'function') {
    return manualStream;
  }

  if (typeof manualTrack?.stop === 'function') {
    manualTrack.stop();
  }
  return canvas.captureStream(frameRate);
}

async function waitForViewportPresetVideo(video: HTMLVideoElement): Promise<void> {
  await waitForVideoReady(
    video,
    'Viewport preset video ready timeout',
    'Viewport preset video load error'
  );
  assertVideoHasDimensions(video, 'Viewport preset video has no dimensions');
}

export async function applyCanvasCrop(
  sourceStream: MediaStream,
  cropRegion: { x: number; y: number; width: number; height: number },
  quality: VideoQuality,
  viewportSizeInPixels?: { width: number; height: number }
): Promise<MediaStream> {
  const video = createRecordingVideoElement(sourceStream);
  await waitForVideoReady(video, 'Video ready timeout', 'Video load error');
  assertVideoHasDimensions(video, 'Video has no dimensions');

  const cropGeometry = resolveCanvasCropGeometry({
    sourceSize: { width: video.videoWidth, height: video.videoHeight },
    cropRegion,
    ...(viewportSizeInPixels === undefined ? {} : { viewportSizeInPixels }),
  });
  const canvas = document.createElement('canvas');
  canvas.width = cropGeometry.targetWidth;
  canvas.height = cropGeometry.targetHeight;
  const ctx = canvas.getContext('2d')!;
  const {
    frameRate,
    stream: croppedStream,
    videoTrack: canvasVideoTrack,
  } = createCanvasStreamWithAudio({ canvas, quality, sourceStream });

  const drawFrameAndRequest = createFrameRequestingDrawer(() => {
    ctx.drawImage(
      video,
      cropGeometry.sourceX,
      cropGeometry.sourceY,
      cropGeometry.sourceWidth,
      cropGeometry.sourceHeight,
      0,
      0,
      cropGeometry.targetWidth,
      cropGeometry.targetHeight
    );
  }, canvasVideoTrack);
  drawFrameAndRequest();
  const stopFrameLoop = startCanvasBackedFrameLoop(frameRate, drawFrameAndRequest);

  wrapCanvasTrackStop(canvasVideoTrack, () => {
    stopFrameLoop();
    video.pause();
    video.srcObject = null;
  });

  return croppedStream;
}

export async function createViewportPresetStream(
  sourceStream: MediaStream,
  targetResolution: { width: number; height: number },
  quality: VideoQuality,
  viewportSizeInPixels?: { width: number; height: number }
): Promise<{
  stream: MediaStream;
  updateCrop: Exclude<ViewportCropUpdater, null>;
  updateDrawState: Exclude<ViewportDrawStateUpdater, null>;
}> {
  const video = createRecordingVideoElement(sourceStream);
  await waitForViewportPresetVideo(video);

  const { canvas, ctx, state } = createViewportPresetCanvas(
    video,
    targetResolution,
    ...(viewportSizeInPixels === undefined ? [] : [viewportSizeInPixels])
  );
  const {
    frameRate,
    stream: presetStream,
    videoTrack: canvasVideoTrack,
  } = createCanvasStreamWithAudio({ canvas, quality, sourceStream });

  const drawFrameAndRequest = createFrameRequestingDrawer(
    createViewportPresetFrameDrawer({
      canvas,
      ctx,
      state,
      video,
      isRunning: () => true,
    }),
    canvasVideoTrack
  );
  drawFrameAndRequest();
  const stopFrameLoop = startCanvasBackedFrameLoop(frameRate, drawFrameAndRequest);

  const updateCrop = createViewportPresetCropUpdater(canvas, state, video);
  const updateDrawState = createViewportPresetDrawStateUpdater(state, video);
  wrapCanvasTrackStop(canvasVideoTrack, () => {
    stopFrameLoop();
    video.pause();
    video.srcObject = null;
  });

  return { stream: presetStream, updateCrop, updateDrawState };
}
