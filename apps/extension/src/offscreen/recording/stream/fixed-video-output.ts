import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  VideoResolutionPreset,
  resolveVideoOutputDimensions,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createSourceVideo, waitForSourceMetadata } from './video-source';
import { isOnePixelEncoderCrop, resolveContainedFrame } from './contain-frame';
import { createCanvasVideoOutput } from './canvas-video-output';

type FixedVideoOutputStream = {
  dimensions: { height: number; width: number };
  frameRate: number;
  stream: MediaStream;
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
  cropOddSourceEdges: boolean;
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
}): () => void {
  return () => {
    fillCanvasBackground(params.ctx, params.canvas);
    const source = { height: params.video.videoHeight, width: params.video.videoWidth };
    if (source.width <= 0 || source.height <= 0) return;
    if (params.cropOddSourceEdges && isOnePixelEncoderCrop(source, params.canvas)) {
      params.ctx.imageSmoothingEnabled = false;
      params.ctx.drawImage(
        params.video,
        0,
        0,
        params.canvas.width,
        params.canvas.height,
        0,
        0,
        params.canvas.width,
        params.canvas.height
      );
      return;
    }
    const destination = resolveContainedFrame(source, params.canvas);
    const scaled = source.width !== destination.width || source.height !== destination.height;
    params.ctx.imageSmoothingEnabled = scaled;
    if (scaled) params.ctx.imageSmoothingQuality = 'high';
    params.ctx.drawImage(
      params.video,
      0,
      0,
      source.width,
      source.height,
      destination.x,
      destination.y,
      destination.width,
      destination.height
    );
  };
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export async function createFixedVideoOutputStream(
  sourceStream: MediaStream,
  settings: Pick<VideoRecordingSettings, 'output' | 'quality'>,
  options: { contentHint?: 'detail' | 'motion'; frameRate?: number } = {}
): Promise<FixedVideoOutputStream> {
  const video = createSourceVideo(sourceStream);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseVideo(video);
    stopStreamTracks(sourceStream);
  };
  try {
    await waitForSourceMetadata(video);

    const dimensions = resolveVideoOutputDimensions(
      video.videoWidth,
      video.videoHeight,
      settings.output.resolution
    );
    const frameRate = options.frameRate ?? getFrameRate(settings.quality);
    const normalizedStream = createCanvasVideoOutput({
      contentHint: options.contentHint ?? 'detail',
      dimensions,
      frameRate,
      initializeDrawing: ({ canvas, context }) => ({
        drawLiveFrame: createFrameDrawer({
          canvas,
          cropOddSourceEdges: settings.output.resolution === VideoResolutionPreset.SOURCE,
          ctx: context,
          video,
        }),
      }),
      release,
    });

    return { dimensions, frameRate, stream: normalizedStream };
  } catch (error) {
    release();
    throw error;
  }
}
