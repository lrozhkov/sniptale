import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';
import { resolveContainedFrame } from '../geometry/contain-frame';
import { createCanvasVideoOutput } from './canvas-video-output';
import { resolveFixedVideoFrameRate } from './frame-pump';

type CropRect = { x: number; y: number; width: number; height: number };
type OutputSize = { width: number; height: number };
type CropStreamGeometry = {
  fillsOutput?: boolean;
  fit?: 'contain' | 'cover' | 'source';
  outputSize: OutputSize;
  sourceRect: CropRect;
};

export type CropOutputStream = {
  encoderFrameCrop?: CropRect;
  failure?: Promise<never>;
  frameRate: number;
  stream: MediaStream;
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireCropGeometry(geometry: CropStreamGeometry, source: OutputSize): CropStreamGeometry {
  const { sourceRect, outputSize } = geometry;
  const values = [sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height];
  if (
    !values.every((value) => Number.isFinite(value)) ||
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x + sourceRect.width > source.width ||
    sourceRect.y + sourceRect.height > source.height
  ) {
    throw new Error('Crop sourceRect must use finite positive bounds inside the source');
  }
  if (geometry.fit !== undefined && geometry.fit !== 'contain') {
    throw new Error('Recording crop geometry supports contain fit only');
  }
  requirePositiveInteger(outputSize.width, 'Crop output width');
  requirePositiveInteger(outputSize.height, 'Crop output height');
  if (geometry.fillsOutput) {
    const scaledWidth = (sourceRect.width * outputSize.height) / sourceRect.height;
    const scaledHeight = (sourceRect.height * outputSize.width) / sourceRect.width;
    if (
      Math.abs(scaledWidth - outputSize.width) > 1 &&
      Math.abs(scaledHeight - outputSize.height) > 1
    ) {
      throw new Error('Fill-output crop geometry must preserve the sampled source aspect');
    }
  }
  return { ...geometry, fit: 'contain' };
}

function drawContainedSourceFrame(params: {
  context: CanvasRenderingContext2D;
  frame?: VideoFrame;
  geometry: CropStreamGeometry;
  video: HTMLVideoElement;
}): void {
  const { sourceRect, outputSize } = params.geometry;
  params.context.fillStyle = '#000000';
  params.context.fillRect(0, 0, outputSize.width, outputSize.height);
  const destination = params.geometry.fillsOutput
    ? { x: 0, y: 0, ...outputSize }
    : resolveContainedFrame(sourceRect, outputSize);
  const scaled = sourceRect.width !== destination.width || sourceRect.height !== destination.height;
  params.context.imageSmoothingEnabled = scaled;
  if (scaled) params.context.imageSmoothingQuality = 'high';
  params.context.drawImage(
    params.frame ?? params.video,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height
  );
}

export async function createCropOutputStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry,
  options: { frameRate?: number } = {}
): Promise<CropOutputStream> {
  const video = createSourceVideo(sourceStream);
  let ownershipTransferred = false;
  try {
    await waitForSourceMetadata(video);
    const activeGeometry = requireCropGeometry(geometry, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const sourceFrameRate = sourceStream.getVideoTracks()[0]?.getSettings().frameRate;
    const sourceTrack = sourceStream.getVideoTracks()[0];
    if (!sourceTrack) throw new Error('Crop source stream returned no video track');
    const frameRate = resolveFixedVideoFrameRate(
      options.frameRate ?? sourceFrameRate ?? 30,
      sourceFrameRate
    );
    const cropped = createCanvasVideoOutput({
      audioTracks: sourceStream.getAudioTracks(),
      dimensions: activeGeometry.outputSize,
      frameRate,
      initializeDrawing: ({ context }) => ({
        drawHeldFrame: () => false,
        drawLiveFrame: (frame) => {
          drawContainedSourceFrame({
            context,
            ...(frame ? { frame } : {}),
            geometry: activeGeometry,
            video,
          });
          return true;
        },
      }),
      release: () => releaseSourceVideo(video),
      sourceTrack,
    });
    ownershipTransferred = true;
    return { failure: cropped.failure, frameRate, stream: cropped.stream };
  } finally {
    if (!ownershipTransferred) releaseSourceVideo(video);
  }
}

export async function createCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry,
  options: { frameRate?: number } = {}
): Promise<MediaStream> {
  return (await createCropOutputStream(sourceStream, geometry, options)).stream;
}
