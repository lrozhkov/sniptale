import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';

export type CropRect = { x: number; y: number; width: number; height: number };
export type OutputSize = { width: number; height: number };

export type CropStreamGeometry = {
  outputSize: OutputSize;
  sourceRect: CropRect;
};

export type CropStreamControls = {
  resume(): Promise<void>;
  suspend(): void;
};

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

type CropFrameGate = CropStreamControls & {
  canDraw(): boolean;
  stop(): void;
};

function createCropFrameGate(
  video: HTMLVideoElement,
  initiallySuspended: boolean,
  drawFreshFrame: () => void
): CropFrameGate {
  let awaitingFreshFrame = false;
  let pendingFrame: {
    callbackId: number;
    reject: (error: Error) => void;
    resolve: () => void;
  } | null = null;
  let stopped = false;
  let suspended = initiallySuspended;

  const cancelPendingFrame = () => {
    if (!pendingFrame) return;
    video.cancelVideoFrameCallback(pendingFrame.callbackId);
    const reject = pendingFrame.reject;
    pendingFrame = null;
    reject(new Error('Viewport fresh-frame wait was cancelled'));
  };

  return {
    canDraw: () => !stopped && !suspended && !awaitingFreshFrame,
    resume: () => {
      if (stopped) return Promise.resolve();
      cancelPendingFrame();
      awaitingFreshFrame = true;
      suspended = false;
      if (typeof video.requestVideoFrameCallback !== 'function') {
        throw new Error('Video frame callback is unavailable for viewport output');
      }
      return new Promise<void>((resolve, reject) => {
        const callbackId = video.requestVideoFrameCallback(() => {
          if (pendingFrame?.callbackId !== callbackId) {
            resolve();
            return;
          }
          pendingFrame = null;
          if (!stopped && !suspended) {
            try {
              awaitingFreshFrame = false;
              drawFreshFrame();
            } catch (error) {
              awaitingFreshFrame = true;
              suspended = true;
              reject(error instanceof Error ? error : new Error(String(error)));
              return;
            }
          }
          resolve();
        });
        pendingFrame = { callbackId, reject, resolve };
      });
    },
    stop: () => {
      stopped = true;
      suspended = true;
      cancelPendingFrame();
    },
    suspend: () => {
      suspended = true;
      cancelPendingFrame();
    },
  };
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
    let frameGate: CropFrameGate;
    const draw = () => {
      if (stopped || !frameGate.canDraw()) return;
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
    frameGate = createCropFrameGate(video, options.initiallySuspended === true, draw);
    draw();
    frameTimer = setInterval(draw, Math.max(1, Math.round(1000 / frameRate)));
    const track = cropped.getVideoTracks()[0];
    if (!track) throw new Error('Cropped output is missing a video track');
    const stop = track.stop.bind(track);
    track.stop = () => {
      if (stopped) return;
      stopped = true;
      frameGate.stop();
      if (frameTimer !== null) clearInterval(frameTimer);
      frameTimer = null;
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
