import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';
import {
  createCropFrameGate,
  type CropFrameGate,
  type CropStreamControls,
  type CropStreamGeometry,
  type OutputSize,
} from './crop-frame-gate';
import {
  isOnePixelEncoderCrop,
  resolveContainedFrame,
  resolveCoverSourceRect,
} from './contain-frame';
import { createCanvasVideoOutput } from './canvas-video-output';

export type {
  CropRect,
  CropStreamControls,
  CropStreamDrawStateResult,
  CropStreamGeometry,
  OutputSize,
} from './crop-frame-gate';

export type GatedCropStream = {
  controls: CropStreamControls;
  stream: MediaStream;
};

type CropStreamOptions = {
  cropOddSourceEdges?: boolean;
  dynamicSourceFit?: boolean;
  frameRate?: number;
  initiallySuspended?: boolean;
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

function fillFrameBackground(context: CanvasRenderingContext2D, outputSize: OutputSize): void {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, outputSize.width, outputSize.height);
}

function drawDynamicSourceFrame(params: {
  context: CanvasRenderingContext2D;
  cropOddSourceEdges: boolean;
  outputSize: OutputSize;
  video: HTMLVideoElement;
}): void {
  const rawSize = { height: params.video.videoHeight, width: params.video.videoWidth };
  if (rawSize.width <= 0 || rawSize.height <= 0) return;

  if (params.cropOddSourceEdges && isOnePixelEncoderCrop(rawSize, params.outputSize)) {
    params.context.imageSmoothingEnabled = false;
    params.context.drawImage(
      params.video,
      0,
      0,
      params.outputSize.width,
      params.outputSize.height,
      0,
      0,
      params.outputSize.width,
      params.outputSize.height
    );
    return;
  }

  fillFrameBackground(params.context, params.outputSize);
  const destination = resolveContainedFrame(rawSize, params.outputSize);
  const scaled = rawSize.width !== destination.width || rawSize.height !== destination.height;
  params.context.imageSmoothingEnabled = scaled;
  if (scaled) params.context.imageSmoothingQuality = 'high';
  params.context.drawImage(
    params.video,
    0,
    0,
    rawSize.width,
    rawSize.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height
  );
}

function drawFixedSourceFrame(params: {
  context: CanvasRenderingContext2D;
  geometry: CropStreamGeometry;
  video: HTMLVideoElement;
}): void {
  const { sourceRect, outputSize } = params.geometry;
  let source = sourceRect;
  let destination = { x: 0, y: 0, ...outputSize };
  if (params.geometry.fit === 'source' && isOnePixelEncoderCrop(sourceRect, outputSize)) {
    params.context.imageSmoothingEnabled = false;
    params.context.drawImage(
      params.video,
      sourceRect.x,
      sourceRect.y,
      outputSize.width,
      outputSize.height,
      0,
      0,
      outputSize.width,
      outputSize.height
    );
    return;
  }
  if (params.geometry.fit === 'cover' || params.geometry.fit === 'source') {
    const crop = resolveCoverSourceRect(sourceRect, outputSize);
    source = {
      height: crop.height,
      width: crop.width,
      x: sourceRect.x + crop.x,
      y: sourceRect.y + crop.y,
    };
  } else if (params.geometry.fit === 'contain') {
    fillFrameBackground(params.context, outputSize);
    destination = resolveContainedFrame(sourceRect, outputSize);
  }
  const scaled = source.width !== destination.width || source.height !== destination.height;
  params.context.imageSmoothingEnabled = scaled;
  if (scaled) params.context.imageSmoothingQuality = 'high';
  params.context.drawImage(
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
}

export async function createGatedCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry,
  options: CropStreamOptions = {}
): Promise<GatedCropStream> {
  const video = createSourceVideo(sourceStream);
  let ownershipTransferred = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseSourceVideo(video);
  };
  try {
    await waitForSourceMetadata(video);
    let activeGeometry = requireCropGeometry(geometry, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const sourceFrameRate =
      options.frameRate ?? sourceStream.getVideoTracks()[0]?.getSettings().frameRate;
    const frameRate =
      typeof sourceFrameRate === 'number' && Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
        ? sourceFrameRate
        : 30;
    let frameGate: CropFrameGate | null = null;
    const cropped = createCanvasVideoOutput({
      audioTracks: sourceStream.getAudioTracks(),
      dimensions: activeGeometry.outputSize,
      frameRate,
      initializeDrawing: ({ canvas, context }) => {
        const drawSourceFrame = () => {
          if (!frameGate?.canDraw()) return;
          if (options.dynamicSourceFit) {
            drawDynamicSourceFrame({
              context,
              cropOddSourceEdges: options.cropOddSourceEdges === true,
              outputSize: activeGeometry.outputSize,
              video,
            });
            return;
          }
          drawFixedSourceFrame({ context, geometry: activeGeometry, video });
        };
        const drawHeldFrame = () => {
          if (!frameGate?.canEmitHeldFrame()) return;
          context.drawImage(canvas, 0, 0);
        };
        frameGate = createCropFrameGate({
          applyGeometry: (nextGeometry) => {
            const validated = requireCropGeometry(nextGeometry, {
              width: video.videoWidth,
              height: video.videoHeight,
            });
            if (
              validated.outputSize.width !== canvas.width ||
              validated.outputSize.height !== canvas.height
            ) {
              throw new Error('Updated crop geometry cannot change the encoded output dimensions');
            }
            activeGeometry = validated;
          },
          drawCurrentFrame: drawSourceFrame,
          initiallySuspended: options.initiallySuspended === true,
          video,
        });
        return { drawHeldFrame, drawLiveFrame: drawSourceFrame };
      },
      release: () => {
        frameGate?.stop();
        release();
      },
    });
    if (!frameGate) throw new Error('Crop output controls were not initialized');
    ownershipTransferred = true;
    return {
      controls: frameGate,
      stream: cropped,
    };
  } finally {
    if (!ownershipTransferred) {
      release();
    }
  }
}

export async function createCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry,
  options: Omit<CropStreamOptions, 'initiallySuspended'> = {}
): Promise<MediaStream> {
  return (await createGatedCropStream(sourceStream, geometry, options)).stream;
}
