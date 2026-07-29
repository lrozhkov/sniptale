import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';
import {
  createCropFrameGate,
  type CropFrameGate,
  type CropStreamControls,
  type CropStreamGeometry,
  type OutputSize,
} from './crop-frame-gate';

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

export async function createGatedCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry,
  options: { initiallySuspended?: boolean } = {}
): Promise<GatedCropStream> {
  const video = createSourceVideo(sourceStream);
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let ownershipTransferred = false;
  let stopped = false;
  try {
    await waitForSourceMetadata(video);
    let activeGeometry = requireCropGeometry(geometry, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const canvas = document.createElement('canvas');
    canvas.width = activeGeometry.outputSize.width;
    canvas.height = activeGeometry.outputSize.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable for the requested crop');
    const sourceFrameRate = sourceStream.getVideoTracks()[0]?.getSettings().frameRate;
    const frameRate =
      typeof sourceFrameRate === 'number' && Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
        ? sourceFrameRate
        : 30;
    const cropped = canvas.captureStream(frameRate);
    sourceStream.getAudioTracks().forEach((track) => cropped.addTrack(track));
    let frameGate: CropFrameGate;
    const drawSourceFrame = () => {
      if (stopped || !frameGate.canDraw()) return;
      const { sourceRect, outputSize } = activeGeometry;
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
    const drawHeldFrame = () => {
      if (stopped || !frameGate.canEmitHeldFrame()) return;
      // captureStream advances only after a canvas paint. Repaint the last safe output so a
      // navigation freeze keeps the encoded timeline alive without sampling the new page.
      context.drawImage(canvas, 0, 0);
    };
    const drawFrame = () => {
      if (stopped) return;
      if (frameGate.canDraw()) {
        drawSourceFrame();
        return;
      }
      drawHeldFrame();
    };
    const applyGeometry = (nextGeometry: CropStreamGeometry) => {
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
    };
    frameGate = createCropFrameGate({
      applyGeometry,
      drawCurrentFrame: drawSourceFrame,
      initiallySuspended: options.initiallySuspended === true,
      video,
    });
    const track = cropped.getVideoTracks()[0];
    if (!track) throw new Error('Cropped output is missing a video track');
    drawFrame();
    frameTimer = setInterval(drawFrame, Math.max(1, Math.round(1000 / frameRate)));
    const stop = track.stop.bind(track);
    track.stop = () => {
      if (stopped) return;
      stopped = true;
      frameGate.stop();
      if (frameTimer !== null) {
        clearInterval(frameTimer);
        frameTimer = null;
      }
      releaseSourceVideo(video);
      stop();
    };
    ownershipTransferred = true;
    return {
      controls: frameGate,
      stream: cropped,
    };
  } finally {
    if (!ownershipTransferred) {
      if (frameTimer !== null) clearInterval(frameTimer);
      releaseSourceVideo(video);
    }
  }
}

export async function createCropStream(
  sourceStream: MediaStream,
  geometry: CropStreamGeometry
): Promise<MediaStream> {
  return (await createGatedCropStream(sourceStream, geometry)).stream;
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
