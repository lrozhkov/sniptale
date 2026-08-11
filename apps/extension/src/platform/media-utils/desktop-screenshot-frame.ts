import type { ScreenshotImageFormat } from '@sniptale/runtime-contracts/capture/action';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';

const FRAME_TIMEOUT_MS = 10_000;
const MAX_FRAME_SIDE = 32_768;
const MAX_FRAME_PIXELS = 100_000_000;

function resolveMimeType(format: ScreenshotImageFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function assertFrameDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_FRAME_SIDE ||
    height > MAX_FRAME_SIDE ||
    width * height > MAX_FRAME_PIXELS
  ) {
    throw new Error(
      `Desktop frame dimensions exceed the supported raster budget: ${width}x${height}`
    );
  }
}

async function suppressCursor(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) return;
  await track.applyConstraints({ cursor: 'never' } as MediaTrackConstraints).catch(() => undefined);
}

async function acquireStream(streamId: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId,
        maxFrameRate: 60,
      },
    } as MediaTrackConstraints,
  });
  await suppressCursor(stream);
  return stream;
}

async function waitForFrame(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.onloadeddata = null;
      video.onerror = null;
      complete();
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error('Timed out waiting for desktop frame'))),
      FRAME_TIMEOUT_MS
    );
    video.onloadeddata = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error('Failed to load desktop frame')));
    void video.play().catch((error: unknown) => finish(() => reject(error)));
  });
}

export async function captureDesktopScreenshotFrame(args: {
  streamId: string;
  imageFormat: ScreenshotImageFormat;
  imageQuality: number;
}): Promise<{ dataUrl: string; width: number; height: number }> {
  let stream: MediaStream | null = null;
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  try {
    stream = await acquireStream(args.streamId);
    if (!stream.getVideoTracks()[0])
      throw new Error('Desktop stream did not provide a video track');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await waitForFrame(video);
    assertFrameDimensions(video.videoWidth, video.videoHeight);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Desktop frame canvas context is unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(resolveMimeType(args.imageFormat), args.imageQuality / 100);
    if (!isImageDataUrl(dataUrl)) throw new Error('Desktop frame output exceeded image limits');
    return { dataUrl, width: canvas.width, height: canvas.height };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.srcObject = null;
    canvas.width = 0;
    canvas.height = 0;
  }
}
