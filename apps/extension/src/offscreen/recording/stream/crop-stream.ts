import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';

export type CropRect = { x: number; y: number; width: number; height: number };
export type OutputSize = { width: number; height: number };

export type CropStreamGeometry = {
  outputSize: OutputSize;
  sourceRect: CropRect;
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
    !values.every((value) => Number.isFinite(value) && Number.isInteger(value)) ||
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x + sourceRect.width > source.width ||
    sourceRect.y + sourceRect.height > source.height
  ) {
    throw new Error('Crop sourceRect must use integer bounds inside the source');
  }
  requirePositiveInteger(outputSize.width, 'Crop output width');
  requirePositiveInteger(outputSize.height, 'Crop output height');
  return geometry;
}

export async function createCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry
): Promise<MediaStream> {
  const video = createSourceVideo(sourceStream);
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let ownershipTransferred = false;
  try {
    await waitForSourceMetadata(video);
    const validated = requireCropGeometry(geometry, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const canvas = document.createElement('canvas');
    canvas.width = validated.outputSize.width;
    canvas.height = validated.outputSize.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable for the requested crop');
    const sourceFrameRate = sourceStream.getVideoTracks()[0]?.getSettings().frameRate;
    const frameRate =
      typeof sourceFrameRate === 'number' && Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
        ? sourceFrameRate
        : 30;
    const cropped = canvas.captureStream(frameRate);
    sourceStream.getAudioTracks().forEach((track) => cropped.addTrack(track));
    const draw = () => {
      const { sourceRect, outputSize } = validated;
      context.drawImage(
        video,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        outputSize.width,
        outputSize.height
      );
    };
    draw();
    frameTimer = setInterval(draw, Math.max(1, Math.round(1000 / frameRate)));
    const track = cropped.getVideoTracks()[0];
    if (!track) throw new Error('Cropped output is missing a video track');
    const stop = track.stop.bind(track);
    let stopped = false;
    track.stop = () => {
      if (stopped) return;
      stopped = true;
      if (frameTimer !== null) clearInterval(frameTimer);
      frameTimer = null;
      releaseSourceVideo(video);
      stop();
    };
    ownershipTransferred = true;
    return cropped;
  } finally {
    if (!ownershipTransferred) {
      if (frameTimer !== null) clearInterval(frameTimer);
      releaseSourceVideo(video);
    }
  }
}

export function resolveOnePixelEncodingCrop(source: OutputSize): CropStreamGeometry | null {
  const width = source.width - (source.width % 2);
  const height = source.height - (source.height % 2);
  return width === source.width && height === source.height
    ? null
    : {
        sourceRect: { x: 0, y: 0, width, height },
        outputSize: { width, height },
      };
}
