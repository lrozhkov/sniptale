import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';
import {
  createCropFrameGate,
  type CropFrameGate,
  type CropStreamControls,
  type CropStreamGeometry,
  type OutputSize,
} from './crop-frame-gate';
import { resolveContainedFrame } from '../geometry/contain-frame';
import { createCanvasVideoOutput } from './canvas-video-output';
import { resolveFixedVideoFrameRate } from './frame-pump';

export type {
  CropRect,
  CropStreamControls,
  CropStreamDrawStateResult,
  CropStreamGeometry,
  OutputSize,
} from './crop-frame-gate';

export type GatedCropStream = {
  controls: CropStreamControls;
  frameRate: number;
  stream: MediaStream;
};

type CropStreamOptions = {
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
  if (geometry.fit !== undefined && geometry.fit !== 'contain') {
    throw new Error('Recording crop geometry supports contain fit only');
  }
  requirePositiveInteger(outputSize.width, 'Crop output width');
  requirePositiveInteger(outputSize.height, 'Crop output height');
  return { ...geometry, fit: 'contain' };
}

function fillFrameBackground(context: CanvasRenderingContext2D, outputSize: OutputSize): void {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, outputSize.width, outputSize.height);
}

function drawContainedSourceFrame(params: {
  context: CanvasRenderingContext2D;
  geometry: CropStreamGeometry;
  video: HTMLVideoElement;
}): void {
  const { sourceRect, outputSize } = params.geometry;
  fillFrameBackground(params.context, outputSize);
  const destination = resolveContainedFrame(sourceRect, outputSize);
  const scaled = sourceRect.width !== destination.width || sourceRect.height !== destination.height;
  params.context.imageSmoothingEnabled = scaled;
  if (scaled) params.context.imageSmoothingQuality = 'high';
  params.context.drawImage(
    params.video,
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
    const sourceFrameRate = sourceStream.getVideoTracks()[0]?.getSettings().frameRate;
    const frameRate = resolveFixedVideoFrameRate(
      options.frameRate ?? sourceFrameRate ?? 30,
      sourceFrameRate
    );
    let frameGate: CropFrameGate | null = null;
    const cropped = createCanvasVideoOutput({
      audioTracks: sourceStream.getAudioTracks(),
      dimensions: activeGeometry.outputSize,
      frameRate,
      initializeDrawing: ({ canvas, context }) => {
        const drawSourceFrame = () => {
          if (!frameGate?.canDraw()) return false;
          drawContainedSourceFrame({ context, geometry: activeGeometry, video });
          return true;
        };
        const drawHeldFrame = () => {
          if (!frameGate?.canEmitHeldFrame()) return false;
          context.drawImage(canvas, 0, 0);
          return true;
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
      frameRate,
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
