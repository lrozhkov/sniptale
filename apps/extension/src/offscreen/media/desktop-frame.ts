import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import type { DesktopFrameImageFormat } from '../../contracts/messaging/contracts/runtime-message/desktop-frame.types';
import {
  acquireOffscreenMediaActivityLease,
  type OffscreenMediaActivityLease,
} from '../media-activity/lease';
import { acquireDesktopStream } from './desktop-stream';

const MAX_FRAME_SIDE = 32_768;
const MAX_FRAME_PIXELS = 100_000_000;
const RESERVATION_TIMEOUT_MS = 30_000;

export type DesktopFrameResult = {
  result: 'captured';
  dataUrl: string;
  width: number;
  height: number;
};

type Reservation = {
  lease: OffscreenMediaActivityLease;
  timeout: ReturnType<typeof setTimeout>;
};

const reservations = new Map<string, Reservation>();

function resolveMimeType(format: DesktopFrameImageFormat): string {
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

async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
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
      10_000
    );
    video.onloadeddata = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error('Failed to load desktop frame')));
    void video.play().catch((error: unknown) => finish(() => reject(error)));
  });
}

function takeReservation(requestId: string): Reservation {
  const reservation = reservations.get(requestId);
  if (!reservation) throw new Error('Desktop screenshot reservation is missing or expired');
  reservations.delete(requestId);
  clearTimeout(reservation.timeout);
  return reservation;
}

export function reserveDesktopFrame(requestId: string): 'accepted' {
  if (reservations.has(requestId)) return 'accepted';
  const acquisition = acquireOffscreenMediaActivityLease('desktop-screenshot');
  if (!acquisition.acquired) {
    throw new Error(`Desktop screenshot is unavailable while ${acquisition.busyOwner} is active`);
  }
  const timeout = setTimeout(() => {
    const reservation = reservations.get(requestId);
    if (!reservation) return;
    reservations.delete(requestId);
    reservation.lease.release();
  }, RESERVATION_TIMEOUT_MS);
  reservations.set(requestId, { lease: acquisition.lease, timeout });
  return 'accepted';
}

export function cancelDesktopFrame(requestId: string): 'accepted' {
  const reservation = reservations.get(requestId);
  if (!reservation) return 'accepted';
  reservations.delete(requestId);
  clearTimeout(reservation.timeout);
  reservation.lease.release();
  return 'accepted';
}

export async function writeDesktopFrameClipboard(dataUrl: string): Promise<'copied'> {
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.type !== 'image/png')
    throw new Error('Desktop clipboard capture must be encoded as PNG');
  await writeBrowserClipboardItems([new ClipboardItem({ 'image/png': blob })]);
  return 'copied';
}

export async function captureDesktopFrame(args: {
  requestId: string;
  streamId: string;
  imageFormat: DesktopFrameImageFormat;
  imageQuality: number;
}): Promise<DesktopFrameResult> {
  const reservation = takeReservation(args.requestId);
  let stream: MediaStream | null = null;
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  try {
    stream = await acquireDesktopStream({
      desktopStreamId: args.streamId,
      controlledCursorCaptureEnabled: true,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Desktop stream did not provide a video track');

    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await waitForVideoFrame(video);
    assertFrameDimensions(video.videoWidth, video.videoHeight);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Desktop frame canvas context is unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(resolveMimeType(args.imageFormat), args.imageQuality / 100);
    if (!isImageDataUrl(dataUrl)) throw new Error('Desktop frame output exceeded image limits');
    return { result: 'captured', dataUrl, width: canvas.width, height: canvas.height };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.srcObject = null;
    canvas.width = 0;
    canvas.height = 0;
    reservation.lease.release();
  }
}
