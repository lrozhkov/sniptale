import {
  resolveVideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createRecordingGeometryPlan } from '../geometry/plan';
import { createCanvasVideoOutput } from './canvas-video-output';
import { resolveFixedVideoFrameRate } from './frame-pump';
import { resolveAspectMatchedSourceFrame, resolveContainedFrame } from '../geometry/contain-frame';
import { createSourceVideo, waitForSourceMetadata } from './video-source';

type FixedVideoOutputStream = {
  dimensions: { height: number; width: number };
  frameRate: number;
  stream: MediaStream;
};

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
  ctx: CanvasRenderingContext2D;
  outputBasis: { height: number; width: number };
  sourceRect: { height: number; width: number; x: number; y: number };
  video: HTMLVideoElement;
}): () => boolean {
  return () => {
    fillCanvasBackground(params.ctx, params.canvas);
    const currentSource = {
      height: params.video.videoHeight,
      width: params.video.videoWidth,
    };
    if (currentSource.width <= 0 || currentSource.height <= 0) return false;
    const usesStableSource =
      currentSource.width === params.outputBasis.width &&
      currentSource.height === params.outputBasis.height;
    const source = usesStableSource ? params.sourceRect : { x: 0, y: 0, ...currentSource };
    const destination = usesStableSource
      ? { x: 0, y: 0, width: params.canvas.width, height: params.canvas.height }
      : resolveContainedFrame(source, params.canvas);
    const scaled = source.width !== destination.width || source.height !== destination.height;
    params.ctx.imageSmoothingEnabled = scaled;
    if (scaled) params.ctx.imageSmoothingQuality = 'high';
    params.ctx.drawImage(
      params.video,
      source.x,
      source.y,
      source.width,
      source.height,
      destination.x,
      destination.y,
      destination.width,
      destination.height
    );
    return true;
  };
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export async function createFixedVideoOutputStream(
  sourceStream: MediaStream,
  settings: Pick<VideoRecordingSettings, 'outputProfile'>,
  options: {
    contentHint?: 'detail' | 'motion';
    frameRate?: number;
    includeSourceAudio?: boolean;
    sourceOwnership?: 'caller' | 'output';
  } = {}
): Promise<FixedVideoOutputStream> {
  const video = createSourceVideo(sourceStream);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseVideo(video);
    if (options.sourceOwnership !== 'caller') stopStreamTracks(sourceStream);
  };
  try {
    await waitForSourceMetadata(video);
    const outputProfile = resolveVideoOutputProfile(settings);
    const requestedFrameRate = Math.min(
      options.frameRate ?? outputProfile.frameRate,
      outputProfile.frameRate
    );
    const frameRate = resolveFixedVideoFrameRate(
      requestedFrameRate,
      sourceStream.getVideoTracks()[0]?.getSettings().frameRate
    );
    const geometry = createRecordingGeometryPlan({
      frameRateCap: outputProfile.frameRate,
      outputBasis: { height: video.videoHeight, width: video.videoWidth },
      resolution: outputProfile.resolution,
      sourceRect: { x: 0, y: 0, height: video.videoHeight, width: video.videoWidth },
    });
    const sourceRect = resolveAspectMatchedSourceFrame(geometry.sourceRect, geometry.outputSize);
    const normalizedStream = createCanvasVideoOutput({
      ...(options.includeSourceAudio ? { audioTracks: sourceStream.getAudioTracks() } : {}),
      contentHint: options.contentHint ?? 'detail',
      dimensions: geometry.outputSize,
      frameRate,
      initializeDrawing: ({ canvas, context }) => ({
        drawLiveFrame: createFrameDrawer({
          canvas,
          ctx: context,
          outputBasis: geometry.outputBasis,
          sourceRect,
          video,
        }),
      }),
      release,
      sourceVideo: video,
    });

    return { dimensions: geometry.outputSize, frameRate, stream: normalizedStream };
  } catch (error) {
    release();
    throw error;
  }
}
